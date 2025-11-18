# odysseus

Odysseus is a lightweight, local-first agent with pluggable tools and a friendly CLI. It now ships with a password-protected web console for sending tasks to Odysseus.ai via a Next.js frontend and API route.

## Quickstart (CLI)

```bash
python -m odysseus.cli "Plan a 7 day workout"
python -m odysseus.cli "What is 6*(3+2)?"
python -m odysseus.cli "todo schedule a team sync" --export sessions/latest.json
```

Run the CLI without a message to launch an interactive session:

```bash
python -m odysseus.cli
```

Type `exit` to end the session at any time.

## Web console

Install dependencies and start the Next.js dev server:

```bash
npm install
npm run dev
```

Then open http://localhost:3000/login, enter the console password, and you will be redirected to http://localhost:3000/odysseus to use the console. Choose a mode, enter a task, and send it to Odysseus.ai. The console calls the `/api/odysseus` endpoint, which forwards the request to the Codex bridge defined in `lib/odysseus.ts`.

### Required environment variables

Create a `.env.local` file (or use your secret manager) with:

```
ODYSSEUS_CONSOLE_PASSWORD=super-secret-password
ODYSSEUS_CODEX_URL=https://your-internal-codex-service/run
```

`ODYSSEUS_CODEX_URL` should point at whatever service or proxy you use to execute Codex/LLM prompts. The bridge expects a JSON response shaped like `{ output: "..." }` but will stringify any other response body.

### Deploying to Vercel

1. In the Vercel dashboard, add `ODYSSEUS_CONSOLE_PASSWORD` and `ODYSSEUS_CODEX_URL` as Project Environment Variables.
2. Deploy as a standard Next.js app (`npm run build` will be run by Vercel). The Odysseus API routes explicitly opt into the `nodejs` runtime and are marked `force-dynamic` to avoid edge/runtime caching issues with external Codex services.
3. Once deployed, open `/login`, enter the console password, and you will be redirected to `/odysseus` to issue prompts against your configured Codex environment.

## Tools

- **calculator**: Evaluates arithmetic expressions from a message.
- **todo**: Adds, lists, or clears todo items held in the in-memory transcript.

## Development

The project targets Python 3.11+ for the CLI agent. The Next.js console uses TypeScript, Tailwind CSS, and Next 14. A Ruff configuration is provided to keep the Python style consistent if you choose to add linting.
