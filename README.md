# CreatorOS

FreeCut-based creator studio with Lee Animations automation — built for Leandro's YouTube automation workflow.

## What's inside

| App | Port | Purpose |
|-----|------|---------|
| **FreeCut Editor** (`apps/editor`) | 5173 | Professional video editor — WebGPU, WebCodecs, keyframes, color grading, AI chat |
| **Automation Server** (`apps/server`) | 3737 | Lee Animations AI: morning brief, script, voice, asset forge, packaging |
| **OmniMediaRoute** (`apps/image-router`) | 8765 | Free image generation — Pollinations → HuggingFace → Cloudflare fallback chain |

## Requirements

- **Node.js 20+** — for the FreeCut editor ([nodejs.org](https://nodejs.org))
- **Bun** — for the automation server and OmniMediaRoute ([bun.sh](https://bun.sh))
- **Windows** — `start.bat` / `setup.bat` are batch files; on Mac/Linux use the `npm run` scripts directly

## First-time setup

1. Clone the repo:
   ```
   git clone https://github.com/lsmmvie-max/creatorOS.git
   cd creatorOS
   ```

2. Run setup (installs editor and OmniMediaRoute dependencies):
   ```
   .\setup.bat
   ```
   Or manually in order:
   ```
   bun install --cwd apps/image-router/server
   npm install --prefix apps/editor
   ```
   > The automation server (`apps/server`) uses Bun and auto-installs its dependencies on first run.

3. **Create the working data directory** — the server reads keys and writes data to `C:\YouStudio\`:
   ```
   mkdir C:\YouStudio
   ```
   Then create `C:\YouStudio\keys.json` with your AI provider tokens:
   ```json
   {
     "openrouter": ["sk-or-..."],
     "gemini": [],
     "fal": [],
     "stability": [],
     "zenmux": [],
     "cloudflare": { "accountId": "", "tokens": [] },
     "youtube": [],
     "groq": []
   }
   ```
   Providers with empty arrays are skipped. Only `openrouter` or `gemini` keys are needed for basic AI chat and script generation.

4. **OmniMediaRoute API keys** (optional — Pollinations works with zero keys):
   ```
   copy apps\image-router\.env.example apps\image-router\server\.env
   ```
   Edit `apps\image-router\server\.env` and fill in `HF_API_KEYS` (HuggingFace) and/or Cloudflare credentials.

## Daily use

Double-click **`start.bat`** or run:
```
npm start
```
This clears ports 3737/5173/8765, then opens all three services with labeled console output.

Then open **http://localhost:5173** in Chrome or Edge.

To run without OmniMediaRoute:
```
npm run start:no-image
```

## Project structure

```
creatorOS/
├── apps/
│   ├── editor/              # FreeCut video editor (Vite + React, port 5173)
│   │   ├── src/
│   │   │   ├── features/    # timeline, ai-chat, lee-animations, media-library, …
│   │   │   ├── infrastructure/
│   │   │   └── app/
│   │   ├── headless/        # CLI render harness (headless/*.mjs)
│   │   ├── public/
│   │   ├── docs/
│   │   └── scripts/
│   ├── server/              # Lee Animations automation (Bun/Express, port 3737)
│   │   └── src/
│   │       ├── ai-router.ts
│   │       ├── voice-router.ts
│   │       ├── forge-router.ts
│   │       ├── image-router.ts
│   │       ├── mcp-server.ts
│   │       ├── overnight-brain.ts
│   │       └── key-manager.ts
│   └── image-router/        # OmniMediaRoute gateway (Bun/Express, port 8765)
│       └── server/
│           └── src/
│               ├── providers/   # pollinations.ts, huggingface.ts, cloudflare.ts
│               └── routes/      # native.ts, openai-compat.ts
├── start.bat                # Launch all three services (Windows)
├── setup.bat                # Install dependencies (Windows)
└── package.json             # Workspace scripts (concurrently)
```

## Working data (outside the repo)

Runtime assets, recordings, and projects live at **`C:\YouStudio\`** — not version-controlled:

```
C:\YouStudio\
├── keys.json        # AI provider API keys (required — see setup step 3)
├── youstudio.db     # SQLite usage/rotation tracking (auto-created)
├── queue/           # Overnight brain batch job queue (auto-created)
└── (recordings, projects, assets…)
```

## Known environment notes

- The **overnight brain** (automated episode generation) is triggered via Windows Task Scheduler pointing at the server's `runOvernightBrain()` export — it is not a separate repo or process.
- The video editor workspace (project files, timeline data) can point to any local folder, including `C:\YouStudio\`, configured in-app.
- `apps/image-router/server/.env` is gitignored — do not commit it.
