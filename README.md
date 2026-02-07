# Social Agent Cloud

An autonomous social media agent that generates, schedules, and posts content to Twitter and LinkedIn. Powered by Claude (Anthropic), with Slack as the human-in-the-loop interface for reviewing, editing, approving, or rejecting posts before they go live.

## Features

- **Content Discovery** — Automatically finds trending topics and relevant content via RSS feeds, web scraping (FireCrawl), and Slack channel ingestion
- **AI Content Generation** — Claude generates platform-specific posts (Twitter & LinkedIn) with distinct voice and formatting per platform
- **Video Content Pipeline** — End-to-end video creation using fal.ai (TTS + image generation), FFmpeg editing, and Remotion rendering
- **Slack HITL Interface** — Interactive Slack messages with approve/edit/skip/pause buttons; inline editing with per-platform text fields
- **Proactive Agent** — Daily content suggestions, weekly retros, trend monitoring, and autonomous posting of high-confidence content
- **Three-Layer Memory System** — Episodic (raw events) → Semantic (voice profile, preferences) → Procedural (learned rules) memory with nightly consolidation
- **Voice Learning** — Learns your writing style from edits, approvals, and rejections; builds a structured voice profile that evolves over time
- **Scheduling** — 20+ cron jobs handling content generation, posting, metrics collection, memory consolidation, and more
- **Engagement Metrics** — Tracks post performance and feeds results back into the memory system

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Slack UI   │────▶│  Agent Core  │────▶│  Twitter / LI   │
│  (approve/   │◀────│  (Claude)    │     │  APIs           │
│   edit/skip) │     └──────┬───────┘     └─────────────────┘
└─────────────┘            │
                    ┌──────┴───────┐
                    │   Supabase   │
                    │  (memory +   │
                    │   queue +    │
                    │   metrics)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │  Remotion  │ │ fal.ai│ │  FireCrawl │
        │  Renderer  │ │ (TTS +│ │  (scraper) │
        │  (videos)  │ │ image)│ └────────────┘
        └────────────┘ └───────┘
```

### Services

| Service | Description |
|---------|-------------|
| `content-discovery.ts` | RSS + web scraping for trending content |
| `content-generator.ts` | Claude-powered post generation with dynamic prompts |
| `content-queue.ts` | Supabase-backed content queue (pending → approved → posted) |
| `dynamic-prompt-builder.ts` | Builds prompts with voice profile, procedural rules, and context |
| `slack-handlers.ts` | Handles Slack interactive actions (approve, edit, skip, pause) |
| `proactive-agent.ts` | Daily suggestions, weekly retros, trend monitoring |
| `video-editor-agent.ts` | AI video editing with critique loops and EDL generation |
| `agent-memory.ts` | Three-layer memory (episodic, semantic, procedural) |
| `memory-consolidation.ts` | Nightly voice profile consolidation and rule promotion |
| `posting-service.ts` | Posts to Twitter API v2 and LinkedIn API |
| `scheduler.ts` | Cron job orchestration (node-cron) |
| `metrics-collector.ts` | Engagement metrics collection and analysis |
| `fal-service.ts` | fal.ai integration (MiniMax TTS, Flux 2 Flex images) |
| `remotion-service.ts` | Remotion video rendering microservice client |

## Tech Stack

- **Runtime**: Node.js 20, TypeScript
- **AI**: Anthropic Claude API (content generation), Google Gemini Pro (analysis/consolidation)
- **Database**: Supabase (PostgreSQL + Storage)
- **Social APIs**: Twitter API v2, LinkedIn API
- **Video**: Remotion (rendering), FFmpeg (editing), fal.ai (TTS + image gen)
- **Messaging**: Slack Bolt SDK
- **Scheduling**: node-cron
- **Containerization**: Docker + Docker Compose

## Getting Started

### Prerequisites

- Node.js 20+
- Yarn
- Docker & Docker Compose (for deployment)

### Local Development

```bash
# Install dependencies
yarn install

# Copy env template and fill in values
cp .env.example .env

# Run in development mode
yarn dev

# Build
yarn build

# Start production
yarn start
```

### Environment Variables

```bash
# Core
ANTHROPIC_API_KEY=           # Claude API key
GOOGLE_VERTEX_AI_WEB_CREDENTIALS=  # Gemini Pro credentials

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Social Media
TWITTER_API_KEY=
TWITTER_API_KEY_SECRET=
TWITTER_BEARER_TOKEN=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_USER_TOKEN=
TWITTER_USER_TOKEN_SECRET=
TWITTER_USER_ID=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_PERSON_URN=

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_CHANNEL_ID=

# Content Discovery
FIRECRAWL_API_KEY=

# Video Pipeline
FAL_KEY=                     # fal.ai API key
REMOTION_URL=http://remotion:3010  # Remotion renderer URL
```

### Docker Deployment

The project runs as two Docker containers:

| Service | Port | Description |
|---------|------|-------------|
| `agent` | 3002 | Main agent process (content gen, scheduling, Slack bot) |
| `remotion` | 3010 | Remotion video rendering microservice |

```bash
# Build and start both services
docker-compose up --build -d

# View logs
docker-compose logs -f agent

# Stop
docker-compose down
```

## Database

The agent uses Supabase with the following key tables:

- `content_queue` — Content items flowing through the pipeline
- `agent_memory` — Three-layer memory system (episodic, semantic, procedural)
- `post_metrics` — Engagement metrics for posted content

Migrations are in the project root (`supabase-migration*.sql`). Apply them sequentially:

```bash
# Apply via Supabase SQL editor or CLI
supabase-migration.sql    # v1: Base schema
supabase-migration-v2.sql # v2: Queue enhancements
# ... through v7
supabase-migration-v7.sql # v7: Three-layer memory columns
```

## Memory System

The agent uses a three-layer memory architecture:

1. **Episodic** — Raw events: edits, approvals, rejections, performance data, video feedback
2. **Semantic** — Extracted knowledge: voice profile (per-platform style), content preferences, audience insights
3. **Procedural** — Learned rules: explicit instructions derived from repeated patterns (e.g., "For Twitter: no hashtags, lead with insight")

A nightly consolidation pipeline (2 AM) analyzes recent episodes with Gemini Pro to update the voice profile. Weekly (Sunday 10 AM), high-confidence patterns are promoted to procedural rules that get injected directly into generation prompts.

## License

See [LICENSE](./LICENSE) for details.
