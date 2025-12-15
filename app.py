"""
Agent + Website & Native App Generator (Vite React TS + Tailwind, Expo RN TS).

Run API:
  uvicorn app:api --reload

Key endpoints:
  POST /interact          - run the planning agent with tool use
  POST /generate_project  - generate web/native project ZIPs (see ProjectInput)
  GET  /download?path=... - download generated ZIPs from the exports directory

Tools include web search/fetch, calendar/email helpers, python sandbox, HTTP client,
and a project.generate scaffolder for Vite React TS or Expo React Native TS.
"""
from __future__ import annotations

import asyncio
import dataclasses
import datetime as dt
import email.message
import hashlib
import io
import json
import math
import os
import re
import secrets
import shutil
import sqlite3
import textwrap
import typing as t
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup  # noqa: N813
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from starlette.responses import FileResponse, JSONResponse

# Optional deps
try:  # pragma: no cover - openai is optional
    import openai
except Exception:  # pragma: no cover
    openai = None

load_dotenv()

APP_DIR = Path(os.getenv("AGENT_HOME", ".")).resolve()
DATA_DIR = APP_DIR / ".agent_data"
EXPORTS_DIR = DATA_DIR / "exports"
DATA_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "agent.sqlite3"
ICS_PATH = DATA_DIR / "calendar.ics"
AGENTS_PATH = DATA_DIR / "agents.json"

DEFAULT_MODEL = os.getenv("AGENT_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
REQUEST_TIMEOUT = 30.0
MAX_TOOL_STEPS = 8
EMBED_DIM = 768


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def ts() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()

def safe_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in {"http", "https"} and bool(p.netloc)
    except Exception:
        return False

def slugify(name: str, fallback: str = "app") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\- ]+", "", name).strip().lower().replace(" ", "-")[:50]
    return cleaned or fallback

def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def make_zip(src_dir: Path, zip_path: Path) -> Path:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in src_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(src_dir))
    return zip_path


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class Message:
    role: str
    content: str
    meta: dict[str, t.Any] = field(default_factory=dict)

@dataclass
class ToolSpec:
    name: str
    description: str
    schema: dict[str, t.Any]

@dataclass
class AgentConfig:
    id: str
    name: str
    model: str = DEFAULT_MODEL
    system: str = "You are a helpful, safe, and efficient AI assistant."
    max_steps: int = MAX_TOOL_STEPS
    temperature: float = 0.2
    top_p: float = 1.0
    tools: list[str] = field(
        default_factory=lambda: [
            "web.search",
            "web.fetch",
            "calendar",
            "email",
            "python.run",
            "http",
            "project.generate",
        ]
    )


# ---------------------------------------------------------------------------
# Memory (deterministic embedding)
# ---------------------------------------------------------------------------

class SqliteMemory:
    def __init__(self, path: Path):
        self.path = path
        self._cx = sqlite3.connect(path, check_same_thread=False)
        self._cx.execute(
            """
            CREATE TABLE IF NOT EXISTS memory (
                id TEXT PRIMARY KEY,
                ts TEXT,
                kind TEXT,
                text TEXT,
                meta TEXT,
                embed BLOB
            )
            """
        )
        self._cx.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                ts TEXT,
                agent_id TEXT,
                status TEXT,
                input TEXT,
                result TEXT,
                logs TEXT
            )
            """
        )
        self._cx.commit()
        self.lock = asyncio.Lock()

    @staticmethod
    def _hashing_embed(text: str) -> list[float]:
        vec = [0.0] * EMBED_DIM
        for tok in re.findall(r"\w+", text.lower()):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            idx = h % EMBED_DIM
            sign = -1.0 if (h >> 1) & 1 else 1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def add(self, kind: str, text: str, meta: dict | None = None) -> str:
        eid = hashlib.sha256(f"{kind}:{text[:200]}:{secrets.token_hex(4)}".encode()).hexdigest()
        emb = json.dumps(self._hashing_embed(text)).encode()
        async with self.lock:
            self._cx.execute(
                "INSERT INTO memory (id, ts, kind, text, meta, embed) VALUES (?,?,?,?,?,?)",
                (eid, ts(), kind, text, json.dumps(meta or {}), emb),
            )
            self._cx.commit()
        return eid

    async def search(self, query: str, k: int = 5, kinds: list[str] | None = None) -> list[dict]:
        qv = self._hashing_embed(query)
        rows = self._cx.execute("SELECT id, ts, kind, text, meta, embed FROM memory").fetchall()
        scored: list[tuple[float, dict]] = []
        for rid, rts, rkind, rtext, rmeta, remb in rows:
            if kinds and rkind not in kinds:
                continue
            vec = json.loads(remb.decode())
            score = float(sum(x * y for x, y in zip(qv, vec)))
            scored.append((score, {"id": rid, "ts": rts, "kind": rkind, "text": rtext, "meta": json.loads(rmeta)}))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [dict(score=s, **d) for s, d in scored[:k]]

    async def summarize_top(self, query: str, k: int = 5) -> str:
        hits = await self.search(query, k=k)
        if not hits:
            return ""
        points: list[str] = []
        for h in hits:
            for line in h["text"].splitlines():
                if len(line) > 30 and len(points) < 10:
                    points.append("- " + line.strip())
        return "\n".join(points)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

class ToolError(Exception):
    pass


class Tool:
    spec: ToolSpec

    async def run(self, **kwargs) -> dict:
        raise NotImplementedError


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, name: str, tool: Tool):
        if name in self._tools:
            raise ValueError(f"Tool already registered: {name}")
        self._tools[name] = tool

    def specs(self) -> list[dict]:
        out = []
        for name, tool in self._tools.items():
            out.append(
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": tool.spec.description,
                        "parameters": tool.spec.schema,
                    },
                }
            )
        return out

    async def call(self, name: str, args: dict) -> dict:
        if name not in self._tools:
            raise ToolError(f"Unknown tool: {name}")
        tool = self._tools[name]
        try:
            return await tool.run(**args)
        except ValidationError as ve:
            raise ToolError(f"Invalid args for {name}: {ve}") from ve
        except Exception as e:  # pragma: no cover
            raise ToolError(f"Tool {name} failed: {e}") from e


# --- Web Tools -------------------------------------------------------------

class WebSearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    max_results: int = Field(3, ge=1, le=10)


class WebFetchInput(BaseModel):
    url: str


class WebToolSearch(Tool):
    spec = ToolSpec(
        name="web.search",
        description="Search the web and return top links with titles.",
        schema=WebSearchInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = WebSearchInput(**kwargs)
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            r = await client.get("https://duckduckgo.com/html/", params={"q": args.query})
            r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        out = []
        for a in soup.select("a.result__a")[: args.max_results]:
            href = a.get("href")
            title = a.get_text(strip=True)
            if href and title and safe_url(href):
                out.append({"title": title, "url": href})
        return {"results": out}


class WebToolFetch(Tool):
    spec = ToolSpec(
        name="web.fetch",
        description="Fetch a web page and return cleaned text (best-effort).",
        schema=WebFetchInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = WebFetchInput(**kwargs)
        if not safe_url(args.url):
            raise ToolError("Unsafe URL")
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            r = await client.get(args.url, headers={"User-Agent": "Agent/1.0"})
            r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for s in soup(["script", "style", "noscript"]):
            s.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
        return {"url": args.url, "text": text[:15000]}


# --- Calendar --------------------------------------------------------------

class CalendarInput(BaseModel):
    action: t.Literal["create", "list"] = "create"
    title: str | None = None
    starts_at: str | None = None  # ISO
    ends_at: str | None = None
    location: str | None = None
    description: str | None = None


class CalendarTool(Tool):
    spec = ToolSpec(
        name="calendar",
        description="Create or list events in a local ICS calendar file.",
        schema=CalendarInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = CalendarInput(**kwargs)
        ICS_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not ICS_PATH.exists():
            ICS_PATH.write_text("""BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Agent//EN\nEND:VCALENDAR\n""")
        if args.action == "list":
            return {"ics_path": str(ICS_PATH), "events_sample": ICS_PATH.read_text()[:2000]}
        if not (args.title and args.starts_at and args.ends_at):
            raise ToolError("title/starts_at/ends_at required")
        uid = secrets.token_hex(8)
        vevent = textwrap.dedent(
            f"""
            BEGIN:VEVENT
            UID:{uid}
            DTSTAMP:{dt.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}
            DTSTART:{dt.datetime.fromisoformat(args.starts_at).strftime('%Y%m%dT%H%M%SZ')}
            DTEND:{dt.datetime.fromisoformat(args.ends_at).strftime('%Y%m%dT%H%M%SZ')}
            SUMMARY:{args.title}
            LOCATION:{args.location or ''}
            DESCRIPTION:{args.description or ''}
            END:VEVENT
            """
        ).strip()
        content = ICS_PATH.read_text()
        content = content.replace("END:VCALENDAR", vevent + "\nEND:VCALENDAR")
        ICS_PATH.write_text(content)
        return {"created": True, "uid": uid}


# --- Email -----------------------------------------------------------------

class EmailInput(BaseModel):
    to: str
    subject: str
    body: str
    smtp_host: str | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None
    dry_run: bool = True


class EmailTool(Tool):
    spec = ToolSpec(
        name="email",
        description="Compose and optionally send email via SMTP.",
        schema=EmailInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        import smtplib

        args = EmailInput(**kwargs)
        msg = email.message.EmailMessage()
        msg["From"] = args.smtp_user or "agent@example.com"
        msg["To"] = args.to
        msg["Subject"] = args.subject
        msg.set_content(args.body)
        if args.dry_run:
            return {"dry_run": True, "mime": msg.as_string()[:4000]}
        if not (args.smtp_host and args.smtp_user and args.smtp_pass):
            raise ToolError("SMTP credentials required when dry_run=False")
        with smtplib.SMTP_SSL(args.smtp_host, 465, timeout=20) as s:
            s.login(args.smtp_user, args.smtp_pass)
            s.send_message(msg)
        return {"sent": True}


# --- Python sandbox --------------------------------------------------------

class PythonRunInput(BaseModel):
    code: str = Field(..., max_length=5000)
    timeout_sec: float = Field(3.0, ge=0.1, le=10.0)


class PythonTool(Tool):
    spec = ToolSpec(
        name="python.run",
        description="Execute short Python snippets in a constrained sandbox and return stdout/repr.",
        schema=PythonRunInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = PythonRunInput(**kwargs)
        code = args.code
        allowed_builtins = {"print": print, "len": len, "range": range, "sum": sum, "min": min, "max": max}
        globals_sandbox = {"__builtins__": allowed_builtins}
        locals_sandbox: dict[str, t.Any] = {}
        loop = asyncio.get_event_loop()

        def _exec():
            exec(compile(code, "<python.run>", "exec"), globals_sandbox, locals_sandbox)  # noqa: S102
            return locals_sandbox.get("_", None)

        try:
            with asyncio.timeout(args.timeout_sec):
                result = await loop.run_in_executor(None, _exec)
        except Exception as e:  # pragma: no cover
            return {"ok": False, "error": str(e)}
        return {"ok": True, "result": repr(result), "locals_keys": list(locals_sandbox.keys())[:20]}


# --- HTTP client -----------------------------------------------------------

class HttpInput(BaseModel):
    method: t.Literal["GET", "POST"] = "GET"
    url: str
    json_body: dict | None = None
    headers: dict[str, str] | None = None


class HttpTool(Tool):
    spec = ToolSpec(
        name="http",
        description="Minimal HTTP client for JSON APIs.",
        schema=HttpInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = HttpInput(**kwargs)
        if not safe_url(args.url):
            raise ToolError("Unsafe URL")
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            if args.method == "GET":
                r = await client.get(args.url, headers=args.headers)
            else:
                r = await client.post(args.url, json=args.json_body, headers=args.headers)
            r.raise_for_status()
            ct = r.headers.get("content-type", "")
            if "application/json" in ct:
                return {"status": r.status_code, "json": r.json()}
            return {"status": r.status_code, "text": r.text[:8000]}


# --- Project Generator -----------------------------------------------------

class ProjectInput(BaseModel):
    target: t.Literal["web", "native"] = "web"
    app_name: str = Field(..., min_length=1, max_length=60)
    prompt: str = Field(..., min_length=4, max_length=2000)
    pages: list[str] | None = Field(default=None, description="Optional list of pages/screens")


class ProjectGeneratorTool(Tool):
    spec = ToolSpec(
        name="project.generate",
        description="Generate a ready-to-run project ZIP. target: web (Vite+React+TS+Tailwind) or native (Expo React Native + TS).",
        schema=ProjectInput.model_json_schema(),
    )

    async def run(self, **kwargs) -> dict:
        args = ProjectInput(**kwargs)
        if args.target == "web":
            manifest, root = generate_web_project(args.app_name, args.prompt, args.pages)
        else:
            manifest, root = generate_native_project(args.app_name, args.prompt, args.pages)
        zip_name = f"{slugify(args.app_name)}-{args.target}-{dt.datetime.utcnow().strftime('%Y%m%d%H%M%S')}.zip"
        zip_path = EXPORTS_DIR / zip_name
        make_zip(root, zip_path)
        return {"ok": True, "zip_path": str(zip_path), "manifest": manifest}


# ---------------------------------------------------------------------------
# Scaffolder implementations
# ---------------------------------------------------------------------------

def _derive_keywords(prompt: str) -> list[str]:
    uniq: list[str] = []
    for tok in re.findall(r"[a-zA-Z]{4,}", prompt.lower()):
        if tok not in uniq:
            uniq.append(tok)
    return uniq[:8]

def _hero_copy(prompt: str) -> tuple[str, str]:
    title = prompt.strip().split("\n")[0][:80]
    if len(title) < 10:
        title = f"{prompt[:10]} App"
    subtitle = f"Generated from prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}"
    return title, subtitle

def generate_web_project(app_name: str, prompt: str, pages: list[str] | None) -> tuple[dict, Path]:
    root = DATA_DIR / "projects" / f"{slugify(app_name)}-web"
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)

    app_slug = slugify(app_name)
    kws = _derive_keywords(prompt)
    title, subtitle = _hero_copy(prompt)
    pages = pages or ["Home", "Features", "About"]

    pkg = {
        "name": app_slug,
        "private": True,
        "version": "0.0.1",
        "type": "module",
        "scripts": {"dev": "vite", "build": "tsc && vite build", "preview": "vite preview"},
        "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^6.28.0"},
        "devDependencies": {
            "typescript": "^5.6.3",
            "vite": "^5.4.8",
            "@types/react": "^18.3.8",
            "@types/react-dom": "^18.3.2",
            "tailwindcss": "^3.4.14",
            "postcss": "^8.4.45",
            "autoprefixer": "^10.4.20",
        },
    }

    tsconfig = {
        "compilerOptions": {
            "target": "ES2020",
            "useDefineForClassFields": True,
            "lib": ["ES2020", "DOM", "DOM.Iterable"],
            "module": "ESNext",
            "skipLibCheck": True,
            "moduleResolution": "bundler",
            "resolveJsonModule": True,
            "isolatedModules": True,
            "noEmit": True,
            "jsx": "react-jsx",
            "strict": True,
        },
        "include": ["src"],
    }

    vite_cfg = """import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n"""

    index_html = f"""<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>{app_name}</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n"""

    postcss = "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }"
    tailwind = "/** @type {import('tailwindcss').Config} */\nexport default { content: ['./index.html','./src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }"
    css = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"

    nav_links = "".join([f"<NavLink to=\"/{slugify(p)}\">{p}</NavLink>" for p in pages if p != "Home"])
    main_tsx = textwrap.dedent(
        """
        import React from 'react'
        import ReactDOM from 'react-dom/client'
        import { createBrowserRouter, RouterProvider } from 'react-router-dom'
        import './index.css'
        import App from './shell/App'
        import Home from './pages/Home'
        import NotFound from './pages/NotFound'
        import routes from './routes'

        const router = createBrowserRouter([
          { path: '/', element: <App />, children: [
            { index: true, element: <Home /> },
            ...routes
          ]},
          { path: '*', element: <NotFound /> }
        ])

        ReactDOM.createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
        """
    )

    shell_app = textwrap.dedent(
        """
        import {{ Outlet, NavLink }} from 'react-router-dom'

        export default function App() {{
          return (
            <div className="min-h-screen bg-gray-50 text-gray-900">
              <nav className="sticky top-0 bg-white border-b">
                <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4">
                  <span className="font-bold">{app_name}</span>
                  <div className="flex gap-3">
                    <NavLink to="/" className={{({{isActive}})=> isActive ? 'font-semibold' : ''}}>Home</NavLink>
                    {nav_links}
                  </div>
                </div>
              </nav>
              <main className="max-w-6xl mx-auto px-4 py-10"><Outlet /></main>
              <footer className="text-center text-sm text-gray-500 py-8">Generated • {timestamp}</footer>
            </div>
          )
        }}
        """
    ).format(app_name=app_name, nav_links=nav_links, timestamp=ts())

    feature_cards = "".join(
        [
            f'<div className="p-4 border rounded-xl"><h3 className="font-semibold capitalize">{k}</h3><p className="text-sm text-gray-600">Auto-generated feature stub for {k}.</p></div>'
            for k in (kws or ["feature"])
        ]
    )
    home_tsx = textwrap.dedent(
        f"""
        export default function Home() {{
          return (
            <section className="space-y-6">
              <header className="space-y-2">
                <h1 className="text-4xl font-bold">{title}</h1>
                <p className="text-gray-600">{subtitle}</p>
              </header>
              <div className="grid md:grid-cols-3 gap-4">
                {feature_cards}
              </div>
            </section>
          )
        }}
        """
    )

    notfound_tsx = "export default function NotFound(){ return <div>Not Found</div> }"

    route_entries: list[str] = []
    import_lines: list[str] = []
    for p in pages:
        if p == "Home":
            continue
        comp_name = re.sub(r"[^A-Za-z0-9]", "", p) or "Page"
        file_name = comp_name
        comp = textwrap.dedent(
            f"""
            export default function {comp_name}(){{
              return (
                <section className="space-y-4">
                  <h1 className="text-3xl font-bold">{p}</h1>
                  <p className="text-gray-600">This page was generated from your prompt.</p>
                </section>
              )
            }}
            """
        )
        write_file(root / f"src/pages/{file_name}.tsx", comp)
        route_entries.append(f"{{ path: '/{slugify(p)}', element: <{comp_name} /> }}")
        import_lines.append(f"import {comp_name} from './pages/{file_name}'")

    routes_ts = "import React from 'react'\n" + "\n".join(import_lines) + "\n\n" + "export default [\n  " + ",\n  ".join(route_entries) + "\n] as const\n"

    write_file(root / "package.json", json.dumps(pkg, indent=2))
    write_file(root / "tsconfig.json", json.dumps(tsconfig, indent=2))
    write_file(root / "vite.config.ts", vite_cfg)
    write_file(root / "index.html", index_html)
    write_file(root / "postcss.config.cjs", postcss)
    write_file(root / "tailwind.config.ts", tailwind)
    write_file(root / "src/index.css", css)
    write_file(root / "src/main.tsx", main_tsx)
    write_file(root / "src/shell/App.tsx", shell_app)
    write_file(root / "src/pages/Home.tsx", home_tsx)
    write_file(root / "src/pages/NotFound.tsx", notfound_tsx)
    write_file(root / "src/routes.tsx", routes_ts)
    readme = f"""# {app_name}\n\nGenerated by Agent.\n\n## Run\nnpm install\nnpm run dev\n\n## Build\nnpm run build\nnpm run preview\n"""
    write_file(root / "README.md", readme)

    manifest = {"name": app_name, "target": "web", "framework": "vite-react-ts-tailwind", "pages": pages, "dir": str(root)}
    return manifest, root


def generate_native_project(app_name: str, prompt: str, pages: list[str] | None) -> tuple[dict, Path]:
    root = DATA_DIR / "projects" / f"{slugify(app_name)}-native"
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)

    app_slug = slugify(app_name)
    pages = pages or ["Home", "About"]
    title, subtitle = _hero_copy(prompt)

    pkg = {
        "name": app_slug,
        "version": "0.0.1",
        "private": True,
        "main": "index.js",
        "scripts": {
            "start": "expo start",
            "android": "expo run:android",
            "ios": "expo run:ios",
            "web": "expo start --web",
        },
        "dependencies": {"expo": "^52.0.0", "react": "^18.3.1", "react-native": "0.76.0", "expo-router": "^4.0.0"},
        "devDependencies": {"typescript": "^5.6.3", "@types/react": "^18.3.8", "@types/react-native": "^0.73.0"},
    }

    appjson = {
        "expo": {
            "name": app_name,
            "slug": app_slug,
            "scheme": app_slug,
            "version": "0.0.1",
            "orientation": "portrait",
            "sdkVersion": "52.0.0",
            "ios": {"supportsTablet": True},
            "android": {
                "adaptiveIcon": {"foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#ffffff"}
            },
            "web": {"bundler": "metro"},
        }
    }

    inline_links = " ".join(
        [f"<Link href='/{slugify(p)}'><Text style={{fontSize:18}}>{p}</Text></Link>" for p in pages if p != "Home"]
    )
    app_tsx = textwrap.dedent(
        """
        import {{ Link, Stack }} from 'expo-router'
        import {{ Text, View, ScrollView }} from 'react-native'

        export default function Home() {{
          return (
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <Text style={{ fontSize: 28, fontWeight: 'bold' }}>{title}</Text>
              <Text style={{ color: '#666', marginTop: 6 }}>{subtitle}</Text>
              <View style={{ marginTop: 20, gap: 12 }}>
                {inline_links}
              </View>
            </ScrollView>
          )
        }}
        """
    ).format(title=title, subtitle=subtitle, inline_links=inline_links)

    for p in pages:
        if p == "Home":
            continue
        comp_name = re.sub(r"[^A-Za-z0-9]", "", p) or "Screen"
        screen = textwrap.dedent(
            f"""
            import {{ Text, View, ScrollView }} from 'react-native'
            export default function {comp_name}() {{
              return (
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                  <Text style={{ fontSize: 28, fontWeight: 'bold' }}>{p}</Text>
                  <Text style={{ color: '#666', marginTop: 6 }}>Generated from your prompt.</Text>
                </ScrollView>
              )
            }}
            """
        )
        write_file(root / f"app/{slugify(p)}.tsx", screen)

    write_file(root / "package.json", json.dumps(pkg, indent=2))
    write_file(root / "app.json", json.dumps(appjson, indent=2))
    write_file(root / "tsconfig.json", json.dumps({"compilerOptions": {"jsx": "react-jsx", "strict": True}}, indent=2))
    write_file(root / "app/_layout.tsx", "import { Stack } from 'expo-router'\nexport default function Layout(){ return <Stack /> }")
    write_file(root / "app/index.tsx", app_tsx)
    write_file(root / "README.md", f"# {app_name}\n\nRun: npm install && npm run start\n")
    (root / "assets").mkdir(parents=True, exist_ok=True)

    manifest = {"name": app_name, "target": "native", "framework": "expo-react-native-ts", "screens": pages, "dir": str(root)}
    return manifest, root


# ---------------------------------------------------------------------------
# LLM Client
# ---------------------------------------------------------------------------

class LLMClient:
    def __init__(self, model: str = DEFAULT_MODEL, api_key: str | None = None):
        key = api_key or OPENAI_API_KEY
        self.model = model
        if not key or openai is None:
            self.disabled = True
            self.client = None
        else:
            self.disabled = False
            openai.api_key = key
            self.client = openai

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.2,
        top_p: float = 1.0,
    ) -> dict:
        if self.disabled:
            return {
                "role": "assistant",
                "content": "LLM disabled; returning heuristic answer. Prefer calling project.generate directly.",
                "tool_calls": None,
            }
        rsp = await asyncio.to_thread(
            self.client.chat.completions.create,
            model=self.model,
            messages=messages,
            temperature=temperature,
            top_p=top_p,
            tools=tools or None,
            tool_choice="auto" if tools else "none",
        )
        choice = rsp.choices[0].message
        tcalls = None
        if getattr(choice, "tool_calls", None):
            tcalls = []
            for c in choice.tool_calls:
                tcalls.append({"name": c.function.name, "arguments": c.function.arguments})
        return {"role": choice.role, "content": choice.content, "tool_calls": tcalls}


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class Agent:
    def __init__(self, cfg: AgentConfig, memory: SqliteMemory, tools: ToolRegistry, llm: LLMClient):
        self.cfg = cfg
        self.memory = memory
        self.tools = tools
        self.llm = llm

    async def plan(self, goal: str, context: str) -> str:
        sys_prompt = f"""{self.cfg.system}

Task: Devise a concise action plan to achieve the user's goal using available tools only if needed.
Return bullet points, each actionable and specific. Keep to <=6 bullets."""
        msgs = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"Goal: {goal}\nContext:\n{context}"},
        ]
        res = await self.llm.chat(msgs, tools=None, temperature=self.cfg.temperature, top_p=self.cfg.top_p)
        plan = res.get("content") or "- Understand the goal\n- Decide whether to use tools\n- Produce final answer"
        await self.memory.add("plan", plan, {"goal": goal})
        return plan

    async def step(self, history: list[dict], user_input: str) -> tuple[str, list[dict]]:
        summary = await self.memory.summarize_top(user_input, k=5)
        system = f"""{self.cfg.system}

Tools available: {[t for t in self.cfg.tools]}
If a tool is needed, respond with a single tool-call. Otherwise, produce the final answer.
Context:\n{summary or '(no prior memory relevant)'}"""

        messages = [{"role": "system", "content": system}] + history + [{"role": "user", "content": user_input}]
        res = await self.llm.chat(messages, tools=self.tools.specs(), temperature=self.cfg.temperature, top_p=self.cfg.top_p)
        tool_calls = res.get("tool_calls")
        content = res.get("content") or ""
        if tool_calls:
            tool_results: list[dict] = []
            for tc in tool_calls[:2]:
                try:
                    args = json.loads(tc["arguments"]) if isinstance(tc["arguments"], str) else tc["arguments"]
                except Exception:
                    args = {}
                out = await self.tools.call(tc["name"], args)
                tool_results.append({"tool": tc["name"], "args": args, "output": out})
                await self.memory.add("tool", f"{tc['name']}({args}) -> {str(out)[:800]}")
            assistant_msg = {"role": "assistant", "content": content, "tool_results": tool_results}
            return "tool", [assistant_msg]
        await self.memory.add("final", content[:2000], {"input": user_input})
        return "final", [{"role": "assistant", "content": content}]

    async def run(self, goal: str) -> dict:
        logs: list[str] = [f"[{ts()}] start goal: {goal}"]
        context = await self.memory.summarize_top(goal, k=5)
        plan = await self.plan(goal, context)
        logs.append(f"[{ts()}] plan:\n{plan}")
        history: list[dict] = []
        result_text = ""
        for i in range(self.cfg.max_steps):
            status, msgs = await self.step(history, goal if i == 0 else "Continue.")
            history.extend(msgs)
            logs.append(f"[{ts()}] step {i+1} status={status}")
            if status == "final":
                result_text = msgs[-1]["content"]
                break
        else:
            result_text = "Reached step limit; returning best effort based on gathered info."
        await self.memory.add("result", result_text[:4000], {"goal": goal, "plan": plan})
        return {"plan": plan, "result": result_text, "logs": logs, "history": history}


# ---------------------------------------------------------------------------
# Task Queue / Persistence
# ---------------------------------------------------------------------------

class TaskQueue:
    def __init__(self, memory: SqliteMemory):
        self.q: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
        self.memory = memory

    async def enqueue(self, agent_id: str, input_text: str) -> str:
        tid = secrets.token_hex(12)
        self.memory._cx.execute(
            "INSERT INTO tasks (id, ts, agent_id, status, input, result, logs) VALUES (?,?,?,?,?,?,?)",
            (tid, ts(), agent_id, "queued", input_text, "", json.dumps([])),
        )
        self.memory._cx.commit()
        await self.q.put((tid, agent_id))
        return tid

    async def update(self, task_id: str, status: str, result: str, logs: list[str]):
        self.memory._cx.execute(
            "UPDATE tasks SET status=?, result=?, logs=? WHERE id=?",
            (status, result, json.dumps(logs), task_id),
        )
        self.memory._cx.commit()

    def get(self, task_id: str) -> dict | None:
        row = self.memory._cx.execute(
            "SELECT id, ts, agent_id, status, input, result, logs FROM tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if not row:
            return None
        tid, tts, aid, st, inp, res, logs = row
        return {"id": tid, "ts": tts, "agent_id": aid, "status": st, "input": inp, "result": res, "logs": json.loads(logs)}


# ---------------------------------------------------------------------------
# Registry & default agent
# ---------------------------------------------------------------------------

memory = SqliteMemory(DB_PATH)
tools = ToolRegistry()
tools.register("web.search", WebToolSearch())
tools.register("web.fetch", WebToolFetch())
tools.register("calendar", CalendarTool())
tools.register("email", EmailTool())
tools.register("python.run", PythonTool())
tools.register("http", HttpTool())
tools.register("project.generate", ProjectGeneratorTool())


def load_agents() -> dict[str, AgentConfig]:
    if AGENTS_PATH.exists():
        data = json.loads(AGENTS_PATH.read_text())
        return {k: AgentConfig(**v) for k, v in data.items()}
    default = AgentConfig(
        id="default",
        name="General Assistant",
        system=(
            "You are an efficient assistant. Be concise; prefer calling project.generate when the user asks to build an app."
        ),
        tools=["web.search", "web.fetch", "calendar", "email", "python.run", "http", "project.generate"],
    )
    return {"default": default}


def save_agents(cfgs: dict[str, AgentConfig]):
    AGENTS_PATH.write_text(json.dumps({k: dataclasses.asdict(v) for k, v in cfgs.items()}, indent=2))


AGENTS = load_agents()
LLMS: dict[str, LLMClient] = {}

def get_agent(agent_id: str) -> Agent:
    cfg = AGENTS.get(agent_id)
    if not cfg:
        raise KeyError(f"Unknown agent: {agent_id}")
    if agent_id not in LLMS:
        LLMS[agent_id] = LLMClient(model=cfg.model)
    return Agent(cfg, memory, tools, LLMS[agent_id])


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

api = FastAPI(title="Agent API", version="0.2.0")
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateAgentBody(BaseModel):
    id: str
    name: str
    model: str | None = None
    system: str | None = None
    tools: list[str] | None = None


@api.post("/agents")
async def create_agent(body: CreateAgentBody):
    if body.id in AGENTS:
        raise HTTPException(409, "Agent id already exists")
    cfg = AgentConfig(
        id=body.id,
        name=body.name,
        model=body.model or DEFAULT_MODEL,
        system=body.system or "You are a helpful assistant.",
        tools=body.tools or ["web.search", "web.fetch", "calendar", "email", "python.run", "http", "project.generate"],
    )
    AGENTS[body.id] = cfg
    save_agents(AGENTS)
    return {"ok": True, "agent": dataclasses.asdict(cfg)}


class TaskBody(BaseModel):
    agent_id: str = "default"
    input: str

task_queue = TaskQueue(memory)


@api.post("/tasks")
async def create_task(body: TaskBody):
    if body.agent_id not in AGENTS:
        raise HTTPException(404, "Agent not found")
    tid = await task_queue.enqueue(body.agent_id, body.input)
    return {"task_id": tid}


@api.get("/tasks/{task_id}")
async def get_task(task_id: str):
    row = task_queue.get(task_id)
    if not row:
        raise HTTPException(404, "Task not found")
    return row


class InteractBody(BaseModel):
    agent_id: str = "default"
    input: str


@api.post("/interact")
async def interact(body: InteractBody):
    try:
        agent = get_agent(body.agent_id)
    except KeyError:
        raise HTTPException(404, "Agent not found")
    res = await agent.run(body.input)
    return JSONResponse(res)


class GenerateBody(ProjectInput):
    pass


@api.post("/generate_project")
async def generate_project(body: GenerateBody):
    tool = tools._tools["project.generate"]
    out = await tool.run(**body.model_dump())
    return JSONResponse(out)


@api.get("/download")
async def download(path: str):
    p = Path(path)
    if not p.exists() or not p.is_file() or EXPORTS_DIR not in p.parents:
        raise HTTPException(404, "File not found")
    return FileResponse(p)


async def worker_loop():
    while True:
        tid, agent_id = await task_queue.q.get()
        row = task_queue.get(tid)
        if not row:
            continue
        try:
            agent = get_agent(agent_id)
            await task_queue.update(tid, "running", "", [])
            res = await agent.run(row["input"])
            await task_queue.update(tid, "done", res["result"], res["logs"])
        except Exception as e:  # pragma: no cover
            await task_queue.update(tid, "failed", f"{e}", [str(e)])
        finally:
            task_queue.q.task_done()


@api.on_event("startup")
async def _startup():
    asyncio.create_task(worker_loop())


if __name__ == "__main__":
    if len(os.sys.argv) > 1 and os.sys.argv[1] == "demo":
        goal = "Find 3 recent reputable articles on AI evals and draft a short email summary to my team."
        agent = get_agent("default")
        res = asyncio.run(agent.run(goal))
        print("PLAN:\n", res["plan"])
        print("\nRESULT:\n", res["result"])
    else:
        print("Run API with: uvicorn app:api --reload")
        example = """Example generate_project:\n
curl -X POST http://127.0.0.1:8000/generate_project \
  -H 'Content-Type: application/json' \
  -d '{\"target\":\"web\",\"app_name\":\"Trip Genie\",\"prompt\":\"AI trip planner\",\"pages\":[\"Home\",\"Plans\"]}'"""
        print(example)

