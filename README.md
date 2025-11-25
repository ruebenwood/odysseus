# odysseus

Odysseus is a local-first autonomous agent with lightweight memory, a tiny tool registry, and both CLI and API entrypoints. A Next.js console can forward tasks to the same Codex/LLM bridge used by the Python planner.

## Setup

1. Copy the example environment file and adjust values for your Codex bridge and secrets:
   ```bash
   cp .env.example .env
   ```
2. Install Python dependencies (Python 3.11+):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -e .[dev]
   ```

## CLI quickstart

Run the agent once with an optional dry-run flag to avoid side effects:

```bash
python -m odysseus.cli run "List my todos" --dry-run
```

The CLI bootstraps built-in tools (todo, email, calendar, web) and streams the planner result as JSON.

## API server

A FastAPI wrapper exposes the planner and available tools. Start it with uvicorn:

```bash
uvicorn odysseus.server:app --host ${ODYSSEUS_API_HOST:-127.0.0.1} --port ${ODYSSEUS_API_PORT:-8787}
```

Authenticate requests with the `Bearer ${ODYSSEUS_CONSOLE_PASSWORD}` token. The LLM backend is selected via `ODYSSEUS_LLM`:

- `bridge` (default) posts to `ODYSSEUS_CODEX_URL`, expecting `{ messages, tools }` JSON and `{ text }` in response.
- `openai` calls the chat completions API using `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`, while keeping the same text contract for the planner.

## Web console

Install Node dependencies and run the Next.js app to use the password-protected console:

```bash
npm install
npm run dev
```

Open http://localhost:3000/login and enter `ODYSSEUS_CONSOLE_PASSWORD` (defaults to `letmein` if unset) to reach `/odysseus`. The console calls `/api/odysseus`, which forwards the request to your configured Codex bridge.

## Environment variables

`.env.example` documents all supported settings, including:

- `ODYSSEUS_LLM` — choose `bridge` (default) or `openai`.
- `ODYSSEUS_CODEX_URL` — HTTP endpoint that executes Codex/LLM prompts when using the bridge. In development, if this is unset the bridge returns a stub string so the UI can render; set it before deploying.
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` — settings for the OpenAI backend.
- `ODYSSEUS_CONSOLE_PASSWORD` — password for the console and API Bearer token (defaults to `letmein` if not set).
- `ODYSSEUS_DB` — SQLite path for memory, todos, and automations.
- `ODYSSEUS_MAX_STEPS` / `ODYSSEUS_TEMPERATURE` — planner behavior tuning.

## Testing

Run the lightweight smoke test after installing dev dependencies:

```bash
pytest
```

Frontend/unit tests use Vitest with JSDOM. Useful commands:

```bash
npm test           # watch mode
npm run test:run   # one-off
npm run test:ci    # coverage
```

Note: flags like `--runInBand` are Jest-only; use the scripts above for Vitest.
