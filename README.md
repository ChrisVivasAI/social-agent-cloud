# Social Agent Cloud

An autonomous social media agent that generates, schedules, and posts content to Twitter and LinkedIn. Powered by Claude (Anthropic), with both a **Slack bot** and a **web-based Command Center** for managing the entire content pipeline.

## Features

### Content Pipeline
- **Content Discovery** — Automatically finds trending topics and relevant content via RSS feeds, web scraping (FireCrawl), and Slack channel ingestion
- **AI Content Generation** — Claude generates platform-specific posts (Twitter & LinkedIn) with distinct voice and formatting per platform
- **Video Content Pipeline** — End-to-end video creation using fal.ai (TTS + image generation), FFmpeg editing, and Remotion rendering
- **Scheduling** — 20+ cron jobs handling content generation, posting, metrics collection, memory consolidation, and more
- **Engagement Metrics** — Tracks post performance and feeds results back into the memory system

### Intelligence
- **Three-Layer Memory System** — Episodic (raw events) -> Semantic (voice profile, preferences) -> Procedural (learned rules) with nightly consolidation
- **Voice Learning** — Learns your writing style from edits, approvals, and rejections; builds a structured voice profile that evolves over time
- **Proactive Agent** — Daily content suggestions, weekly retros, trend monitoring, and autonomous posting of high-confidence content
- **Dynamic Prompts** — Generation prompts are built on the fly using voice profile, procedural rules, recent performance data, and context

### Interfaces
- **Slack Bot** — Interactive Slack messages with approve/edit/skip/pause buttons; slash commands (`/schedule`, `/generate`, `/ping`, etc.)
- **Command Center Dashboard** — Full web-based control panel with 11 pages (see below)

## Command Center

The Command Center is a Next.js web dashboard for managing the agent without Slack. It connects to the same Supabase database and agent REST API.

### Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Agent health, queue summary counts, next 5 posts, engagement sparklines, live activity feed |
| **Chat** | Natural language command interface to the agent (queue status, approve, reject, generate, analytics) |
| **Queue** | Drag-and-drop Kanban board: pending -> generating -> awaiting_approval -> ready -> posted/failed |
| **Calendar** | Week/month grid with drag-to-reschedule and content type color coding |
| **Analytics** | Engagement trends, platform comparison, content type performance, timing heatmap, top posts |
| **Video Studio** | Video project pipeline, series management, idea approval, render progress |
| **Engagement** | Twitter mentions/replies with AI-drafted responses, approve/edit/dismiss |
| **Memory** | Voice profile viewer, learned rules, procedural rules, performance insights |
| **Discovery** | RSS discoveries with relevance scores, queue/dismiss actions |
| **Settings** | Schedule config, auto-approve toggles, model preferences |
| **Activity Feed** | Real-time SSE-powered log of all agent actions |

## Architecture

```
                         ┌──────────────────┐
                         │  Command Center  │
                         │  (Next.js :3000) │
                         └────────┬─────────┘
                                  │
┌─────────────┐     ┌─────────────┴──────────────┐     ┌─────────────────┐
│   Slack UI   │────>│       Agent Core           │────>│  Twitter / LI   │
│  (approve/   │<────│  (Claude + Express :3002)  │     │  APIs           │
│   edit/skip) │     └──────┬──────────────┬──────┘     └─────────────────┘
└─────────────┘            │              │
                    ┌──────┴───────┐      │
                    │   Supabase   │      │
                    │  (Postgres + │      │
                    │   Storage +  │      │
                    │   Realtime)  │      │
                    └──────────────┘      │
                                          │
                    ┌─────────────────────┬┘
                    │                     │
              ┌─────┴─────┐         ┌────┴────┐
              │  Remotion  │         │  fal.ai │
              │  Renderer  │         │ (TTS +  │
              │  (:3010)   │         │  image) │
              └────────────┘         └─────────┘
```

### Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `agent` | 3002 | Main agent process — Slack bot, scheduler, content generation, posting, REST API |
| `remotion` | 3010 | Remotion video rendering microservice (Chrome Headless Shell) |
| `dashboard` | 3000 | Command Center web UI (Next.js standalone) |

### Agent Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `slack-listener.ts` | Slack Bolt app with ExpressReceiver — slash commands and interactive actions |
| `slack-handlers.ts` | Builds and sends Slack review cards, failure cards, success cards |
| `api-router.ts` | REST API for the Command Center (25+ endpoints) |
| `activity-bus.ts` | EventEmitter-based activity bus for SSE real-time streaming |
| `content-generator.ts` | Claude API content generation with dynamic prompts |
| `content-queue.ts` | Supabase CRUD for `content_queue` table — full lifecycle management |
| `posting-service.ts` | Posts to Twitter API v2 and LinkedIn API with media validation |
| `scheduler.ts` | 20+ node-cron jobs for generation, posting, metrics, consolidation |
| `intake-service.ts` | Ingests content ideas from RSS feeds, scraping, manual input |
| `content-discovery.ts` | Discovers trending topics and content ideas |
| `engagement-monitor.ts` | Monitors Twitter mentions and drafts AI replies |
| `metrics-collector.ts` | Collects engagement metrics from posted content |
| `proactive-agent.ts` | Daily suggestions, weekly retros, trend monitoring |
| `agent-memory.ts` | Three-layer memory (episodic, semantic, procedural) |
| `memory-consolidation.ts` | Nightly voice profile consolidation and rule promotion |
| `dynamic-prompt-builder.ts` | Builds prompts with voice profile, rules, and context |
| `video-editor-agent.ts` | AI video editing with critique loops and EDL generation |
| `fal-service.ts` | fal.ai integration (MiniMax Speech-2.8 HD TTS, Flux 2 Flex images) |
| `remotion-service.ts` | Remotion video rendering microservice client |

## Tech Stack

### Agent
- **Runtime**: Node.js 20, TypeScript, Express
- **AI**: Anthropic Claude API (generation), Google Gemini Pro (analysis/consolidation)
- **Database**: Supabase (PostgreSQL + Storage + Realtime)
- **Social APIs**: Twitter API v2, LinkedIn API
- **Video**: Remotion (rendering), FFmpeg (editing), fal.ai (TTS + image gen)
- **Messaging**: Slack Bolt SDK
- **Scheduling**: node-cron
- **Containerization**: Docker + Docker Compose

### Command Center
- **Framework**: Next.js 14 (App Router, standalone output)
- **UI**: Tailwind CSS, Lucide React icons
- **Charts**: Recharts
- **Drag & Drop**: @dnd-kit
- **Real-time**: Supabase Realtime subscriptions + SSE from agent
- **Auth**: Cookie session with shared secret (`DASHBOARD_SECRET`)

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn (for the agent) and npm (for the command center)
- Docker & Docker Compose
- A Supabase project
- API keys for: Anthropic, Twitter, LinkedIn, Slack, fal.ai (optional), FireCrawl (optional)

### 1. Clone the Repository

```bash
git clone https://github.com/ChrisVivasAI/social-agent-cloud.git
cd social-agent-cloud
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values:

```bash
# ── Core AI ──
ANTHROPIC_API_KEY=              # Required — Claude API key from console.anthropic.com
GOOGLE_VERTEX_AI_WEB_CREDENTIALS=  # Optional — Gemini Pro for memory consolidation

# ── Supabase ──
SUPABASE_URL=                   # Required — https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=      # Required — service_role key (not anon key)
SUPABASE_ANON_KEY=              # Required — anon/public key (for Command Center)

# ── Twitter ──
TWITTER_API_KEY=                # Required — from developer.twitter.com
TWITTER_API_KEY_SECRET=         # Required
TWITTER_USER_TOKEN=             # Required — OAuth 1.0a user token
TWITTER_USER_TOKEN_SECRET=      # Required
TWITTER_USER_ID=                # Required — your Twitter user ID

# ── LinkedIn ──
LINKEDIN_ACCESS_TOKEN=          # Required — OAuth 2.0 token
LINKEDIN_USER_ID=               # Required
LINKEDIN_ORGANIZATION_ID=       # Optional — for posting as an organization
POST_TO_LINKEDIN_ORGANIZATION=false

# ── Slack ──
SLACK_BOT_OAUTH_TOKEN=          # Required — xoxb-... bot token
SLACK_SIGNING_SECRET=           # Required
SLACK_CHANNEL_ID=               # Required — channel for review cards
SLACK_EVENTS_PORT=3002

# ── Content Discovery ──
FIRECRAWL_API_KEY=              # Optional — enables web scraping

# ── Video Pipeline ──
FAL_KEY=                        # Optional — enables TTS and image generation
FAL_TTS_VOICE_ID=English_Male-Jing
REMOTION_RENDERER_URL=http://remotion:3010

# ── Command Center ──
DASHBOARD_SECRET=               # Required — shared secret for dashboard auth
                                # Generate with: openssl rand -hex 32

# ── Scheduling ──
POST_TIMEZONE=America/New_York

# ── Debug ──
DRY_RUN=false                   # Set to true to disable actual posting
LOG_LEVEL=info
```

### 3. Set Up Supabase

Create the following tables in your Supabase project. Migrations are in the project root:

```bash
# Apply migrations sequentially via Supabase SQL editor or CLI
supabase-migration.sql          # v1: Base schema (content_queue, post_history)
supabase-migration-v2.sql       # v2: Queue enhancements
supabase-migration-v3.sql       # v3: Content discovery
supabase-migration-v4.sql       # v4: Engagement monitoring
supabase-migration-v5.sql       # v5: Video pipeline tables
supabase-migration-v6.sql       # v6: Agent settings
supabase-migration-v7.sql       # v7: Three-layer memory columns
```

Key tables:
- `content_queue` — Content items with status lifecycle: `pending` -> `generated` -> `rendering` -> `awaiting_approval` -> `ready` -> `posted`/`failed`
- `post_history` — Published posts with engagement metrics
- `agent_memory` — Three-layer memory system
- `processed_mentions` — Twitter mentions and drafted replies
- `video_projects` / `video_ideas` — Video pipeline
- `discovered_content` — RSS/web discoveries
- `agent_settings` — Key-value config store

### 4. Local Development

```bash
# Install agent dependencies
yarn install

# Install command center dependencies
cd command-center && npm install && cd ..

# Run agent in dev mode (with hot reload)
yarn dev

# Run command center in dev mode
cd command-center && npm run dev
```

The agent runs on `http://localhost:3002` and the command center on `http://localhost:3000`.

### 5. Docker Deployment

Build and start all three services:

```bash
# Build and start
docker compose up --build -d

# Check that all services are running
docker compose ps

# View agent logs
docker compose logs -f agent

# View dashboard logs
docker compose logs -f dashboard

# Stop everything
docker compose down
```

### 6. GCP Deployment (Production)

The project is designed to run on a GCP Compute Engine VM:

```bash
# SSH into the VM
gcloud compute ssh social-agent --zone us-central1-b

# Navigate to the project
cd /opt/social-agent

# Pull latest changes and rebuild
sudo git pull
sudo docker compose up --build -d

# Check logs
sudo docker compose logs --tail 50

# Look for "Slack listener started on port 3002"
```

**Firewall rules** — Ensure these ports are open:
- `3002` — Agent (Slack events URL)
- `3000` — Command Center dashboard

```bash
gcloud compute firewall-rules create allow-agent --allow tcp:3002
gcloud compute firewall-rules create allow-dashboard --allow tcp:3000
```

**Slack Events URL** — Set your Slack app's Request URL to:
```
http://<VM-EXTERNAL-IP>:3002/slack/events
```

## Project Structure

```
social-agent-cloud/
├── src/                          # Agent source code
│   ├── index.ts                  # Entry point — wires up all services
│   ├── services/                 # Core services (see table above)
│   ├── clients/                  # API clients (Twitter, LinkedIn, Slack, Supabase)
│   ├── config/                   # Environment config, schedule config
│   ├── prompts/                  # Claude prompt templates
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utilities (logger, date helpers, Slack blocks)
├── command-center/               # Command Center dashboard (Next.js)
│   ├── src/app/                  # App Router pages (11 pages + API routes)
│   ├── src/components/           # React components (dashboard, queue, analytics, etc.)
│   ├── src/hooks/                # Custom hooks (use-queue, use-realtime, use-chat, etc.)
│   ├── src/lib/                  # Supabase clients, auth, agent API helpers
│   └── Dockerfile                # Multi-stage Next.js standalone build
├── remotion-renderer/            # Remotion video renderer microservice
│   ├── src/                      # Express server + Remotion compositions
│   └── Dockerfile                # Node + Chrome Headless Shell
├── skills/                       # Agent skill definitions
├── docker-compose.yml            # All 3 services
├── Dockerfile                    # Agent Dockerfile
├── .env.example                  # Environment variable template
├── supabase-migration*.sql       # Database migrations (v1-v7)
└── package.json                  # Agent dependencies
```

## Memory System

The agent uses a three-layer memory architecture:

1. **Episodic** — Raw events: edits, approvals, rejections, performance data, video feedback
2. **Semantic** — Extracted knowledge: voice profile (per-platform style), content preferences, audience insights
3. **Procedural** — Learned rules: explicit instructions derived from repeated patterns (e.g., "For Twitter: no hashtags, lead with insight")

A nightly consolidation pipeline (2 AM) analyzes recent episodes with Gemini Pro to update the voice profile. Weekly (Sunday 10 AM), high-confidence patterns are promoted to procedural rules that get injected directly into generation prompts.

## API Endpoints

The agent exposes a REST API on port 3002 (authenticated with `Bearer <DASHBOARD_SECRET>`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Agent health + queue summary |
| GET | `/api/queue` | List queue items (filterable by status) |
| GET | `/api/queue/:id` | Get single queue item |
| POST | `/api/queue/:id/approve` | Approve a queue item |
| POST | `/api/queue/:id/reject` | Reject/skip a queue item |
| POST | `/api/queue/:id/edit` | Edit post text |
| POST | `/api/queue/:id/reschedule` | Change scheduled time |
| POST | `/api/queue/:id/post-now` | Post immediately |
| POST | `/api/queue/:id/pause` | Pause a queue item |
| POST | `/api/queue/:id/resume` | Resume a paused item |
| POST | `/api/queue/:id/retry` | Retry a failed item |
| GET | `/api/schedule` | Upcoming posts for the week |
| GET | `/api/activity` | SSE stream of real-time agent events |
| POST | `/api/generate` | Trigger content generation |
| POST | `/api/chat` | Natural language command interface |
| GET | `/api/engagement` | List processed mentions |
| POST | `/api/engagement/:id/approve` | Post a drafted reply |
| POST | `/api/engagement/:id/edit` | Edit a draft reply |
| POST | `/api/engagement/:id/dismiss` | Dismiss a mention |
| GET | `/api/video-ideas` | List video ideas |
| POST | `/api/video-ideas/:id/approve` | Approve a video idea |
| POST | `/api/video-ideas/:id/reject` | Reject a video idea |
| GET | `/api/video-projects` | List video projects |
| GET | `/api/video-projects/:id` | Get video project detail |
| POST | `/api/video-projects/:id/feedback` | Add feedback to a project |
| GET | `/api/discovery` | List discovered content |
| POST | `/api/discovery/:id/queue` | Queue a discovery as content |
| POST | `/api/discovery/:id/dismiss` | Dismiss a discovery |
| PUT | `/api/settings` | Update agent settings |

## License

See [LICENSE](./LICENSE) for details.
