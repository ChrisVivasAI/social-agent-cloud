# Social Media Agent

Automated social media agent powered by Claude — generates and posts content to Twitter and LinkedIn, controlled via Slack.

## Stack

TypeScript, Node.js, Docker Compose, Slack Bolt, Supabase, Anthropic Claude API, Twitter API v2, LinkedIn API, Remotion, fal.ai, node-cron

## Architecture

Two Docker services (`docker-compose.yml`):
- **agent** — main app (port 3002). Runs the scheduler, Slack listener, content generator, and posting service.
- **remotion** — Remotion video renderer Express microservice at `remotion-renderer/` (port 3010). Has pre-existing type errors from `node_modules/remotion` — not our code, ignore them.

### Key Services (`src/services/`)

| Service | Purpose |
|---|---|
| `slack-listener.ts` | Slack Bolt app — slash commands (`/schedule`, `/ping`, `/generate`, etc.) and interactive actions (approve/reject/edit buttons) |
| `slack-handlers.ts` | Builds and sends Slack review cards, failure cards, success cards |
| `content-generator.ts` | Uses Claude API to generate post text and media. Constructor: `(queue, remotionService, falService)` |
| `content-queue.ts` | Supabase CRUD for `content_queue` table — schedule, approve, reject, update items |
| `posting-service.ts` | Posts to Twitter and LinkedIn. Downloads media, validates it, uploads to platforms |
| `scheduler.ts` | node-cron jobs — triggers content generation and posting at scheduled times |
| `intake-service.ts` | Ingests content ideas from RSS feeds, scraping, manual input |
| `content-discovery.ts` | Discovers trending topics and content ideas |
| `metrics-collector.ts` | Collects engagement metrics from posted content |
| `fal-service.ts` | fal.ai integration — MiniMax Speech-2.8 HD for TTS, Flux 2 Flex for images |
| `remotion-service.ts` | Calls the remotion renderer microservice to generate videos |

### Other Key Directories

- `src/clients/` — API clients (Twitter, LinkedIn, Slack, Supabase video upload)
- `src/config/env.ts` — Environment config with `getConfig()`
- `src/config/schedule.ts` — Weekly posting schedule (4 slots/week)
- `src/prompts/` — Claude prompt templates for content generation
- `src/utils/slack-blocks.ts` — Slack Block Kit builders for review cards, schedule lists, etc.
- `src/types/index.ts` — TypeScript types (`ContentQueueItem`, etc.)

## GCP Deployment

- **VM**: `social-agent` in `us-central1-b` (e2-medium)
- **External IP**: `35.184.163.85`
- **App path on VM**: `/opt/social-agent`
- **Systemd service**: `social-agent.service`
- **Slack events URL**: `http://35.184.163.85:3002/slack/events`

### Deploy Workflow

Use the `/deploy` command or manually:
1. `npm run build` — verify TypeScript compiles
2. `git add` + `git commit` + `git push`
3. `gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo git pull && sudo docker compose up --build -d'`
4. Verify: `gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo docker compose logs --tail 20'`
5. Look for "Slack listener started on port 3002"

### Check Logs

Use the `/logs` command or: `gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo docker compose logs --tail 100 --no-log-prefix'`

## Supabase

- **Project ID**: `cmuohezhukzzhrstbhbp`
- Main table: `content_queue` — holds all posts with status lifecycle: `pending` → `generated` → `rendering` → `awaiting_approval` → `ready` → `posted`/`failed`

## Build & Test

```bash
npm run build          # TypeScript compile
npm run dev            # Local dev with tsx watch
npm test               # Unit tests
npm run test:int       # Integration tests
docker compose up --build  # Full local Docker run
```

## Known Issues

- Remotion renderer has pre-existing TS errors from its node_modules — ignore these
- Some old Supabase media uploads are HTML files (from a previous upload bug) — `prepareMedia()` now detects and rejects these
- Metrics collector may pass full JSON objects as tweet IDs — needs fix
