# LaTeX Studio (MERN)

Split-view LaTeX editor with live PDF preview, download, optional MongoDB persistence, and Claude-powered resume optimization workflow.

## Prerequisites

- **Node.js** 18+
- **MongoDB** (optional) for Save / Saved documents — compile works without it
- **LaTeX** on the machine that runs the API — e.g. macOS: `brew install --cask basictex`, then ensure `pdflatex` is on your `PATH` (you may need to open a new terminal or add `/Library/TeX/texbin`)

## Setup

```bash
cd /path/to/resume-enhancer
npm run install:all
cp server/.env.example server/.env   # edit MONGODB_URI if needed
```

To enable AI extraction/engage:

```bash
# in server/.env
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Run
Terminal 1 — API (default port 5000, configurable with `PORT`):

```bash
cd server && npm run dev
```

Terminal 2 — React (port 5173, proxies `/api` to the API):

```bash
cd client && npm run dev
```

If you see `EADDRINUSE` (port already in use), start both with a different API port, e.g. `5001`:

```bash
PORT=5001 npm run dev --prefix server
VITE_API_PORT=5001 npm run dev --prefix client
```

Or from the repo root:

```bash
npm run install:all
npm run dev
```

You can also override ports from the repo root:

```bash
PORT=5001 VITE_API_PORT=5001 npm run dev
```

## Deploy on Render

Deploy as a **single Render Web Service** using the included `Dockerfile`. This is the most reliable way to ship LaTeX (TeX Live) + required packages so compilation works in production.

- **Service type**: Web Service
- **Runtime**: Docker
- **Start command**: (handled by Dockerfile)
- **Environment variables**:
  - **`MONGODB_URI`**: optional (needed for Save/Saved). If unset, compile still works.
  - **`ANTHROPIC_API_KEY`**: required for JD extraction + Engage suggestions.
  - **`ANTHROPIC_MODEL`**: optional model override.
  - **`NODE_ENV`**: `production` (set by Dockerfile)

After deploy, open your Render URL. The UI and API are served from the same origin.

Open **http://localhost:5173**. Paste or edit LaTeX on the left, click **Compile**, view the PDF on the right, use **Download PDF** when ready.

## Production API URL

Build the client and set `VITE_API_URL` to your deployed API origin if it is not same-origin:

```bash
VITE_API_URL=https://your-api.example.com npm run build --prefix client
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/compile` | Body `{ "source": "...tex..." }` → PDF bytes |
| `GET`/`POST`/`PATCH` | `/api/documents` | List / create / update LaTeX projects (needs MongoDB) |
| `POST` | `/api/ai/extract` | Body `{ "jobDescription": "..." }` → `{ skills, keywords }` |
| `POST` | `/api/ai/engage` | Body `{ jobDescription, skills, keywords, latex }` → snippet suggestions |
| `POST` | `/api/ai/commit` | Body `{ latex, suggestions, suggestionIds }` → patched LaTeX with applied/skipped |
