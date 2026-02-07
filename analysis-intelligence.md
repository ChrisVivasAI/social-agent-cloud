# AI/Reasoning Capabilities Analysis

## 1. Current Capabilities

### 1.1 Memory Architecture (Three-Tier: Episodic -> Semantic -> Procedural)

The agent implements a biologically-inspired memory consolidation pipeline modeled loosely after human long-term memory formation.

**Episodic Memory (Raw Events)**
- Records individual feedback events: edits, approvals, rejections, video critiques (`src/services/agent-memory.ts:214-263`)
- Each episode carries metadata: `episodeType`, `emotionalSalience` (0-1 float), `sourceContent` (original/edited diff), platform, confidence (`src/types/index.ts:282-308`)
- Episodes decay: old episodes (>30 days) with low emotional salience are compressed -- content_text truncated to 100 chars, source diffs dropped (`src/services/agent-memory.ts:610-648`)
- Recent episodes retrievable by type and time window (`src/services/agent-memory.ts:576-604`)

**Semantic Memory (Extracted Knowledge)**
- Voice Profile: a structured JSON fingerprint of the user's writing style with per-platform preferences (`src/types/index.ts:310-339`)
  - Captures tone, formality, humor style, sentence length, vocabulary level
  - Platform-specific sections for Twitter (max length, emoji/hashtag policy, thread preference) and LinkedIn (length, structure, CTA style)
  - Hard rules: `never_do` and `always_do` arrays
  - Confidence scales with episode count: `Math.min(1.0, totalEpisodes / 10)` (`src/services/memory-consolidation.ts:281`)
- Performance Insights: structured observations about what content works, stored in `performance_insights` table (`src/types/index.ts:341-362`)
  - Types: engagement_pattern, content_type_performance, timing_optimization, audience_preference, template_performance, topic_performance
  - Each insight has confidence score and applicability scope (platform/content_type/template)
- User Preferences: learned from consolidation of edit patterns (`src/services/memory-consolidation.ts:287-299`)

**Procedural Memory (Promoted Rules)**
- High-confidence patterns (3+ episodes, >0.8 confidence) are promoted to procedural rules (`src/services/memory-consolidation.ts:70-169`)
- Rules are concrete and actionable (e.g., "For Twitter: keep posts under 200 characters, no hashtags")
- Injected directly into generation prompts via `<rules>` XML tags (`src/services/dynamic-prompt-builder.ts:487-493`)
- Context-filtered by platform and content type (`src/services/agent-memory.ts:533-571`)

### 1.2 Hybrid Search (Vector + Keyword)

- Uses Gemini text-embedding model for vector embeddings stored in Supabase pgvector (`src/services/agent-memory.ts:54-93`)
- Hybrid search via `search_agent_memory` Supabase RPC function combining cosine similarity + full-text search (`src/services/agent-memory.ts:99-138`)
- Configurable vector weight (`MEMORY_VECTOR_WEIGHT`) for tuning relevance vs keyword matching
- Graceful fallback to text-only search when embeddings unavailable (`src/services/agent-memory.ts:143-179`)

### 1.3 Dual-Model LLM Architecture

**Claude (Anthropic) -- Primary Content Generation**
- Model: `claude-sonnet-4-5-20250929` (`src/utils/model.ts:22`)
- Used for: post generation, report writing, captions, video scripts, template selection, intake classification
- Single-shot generation with system+user prompt pattern (`src/utils/model.ts:15-34`)
- No multi-turn reasoning, no tool use, no self-critique

**Gemini (Google Vertex AI) -- Intelligence Layer**
- Dual model: Pro (complex reasoning) and Flash (fast classification) (`src/services/gemini-service.ts:7-9`)
- Used for: embeddings, voice profile consolidation, procedural rule extraction, footage analysis, performance analysis
- Supports thinking levels (minimal/low/medium/high) for Gemini 2.5+ (`src/services/gemini-service.ts:108-110`)
- Agentic Vision: code_execution tool for auto-zoom/crop image analysis (`src/services/gemini-service.ts:183-281`)
- JSON mode generation with fallback regex extraction (`src/services/gemini-service.ts:158-178`)

### 1.4 Dynamic Prompt Construction

The `DynamicPromptBuilder` (`src/services/dynamic-prompt-builder.ts`) assembles context-rich prompts by layering 7 components:

1. **Skill instructions** -- loaded from `skills/*.md` files, cached in memory (`src/services/dynamic-prompt-builder.ts:593-614`)
2. **Performance insights** -- top 5 active insights filtered by platform/content type (`src/services/dynamic-prompt-builder.ts:52-59`)
3. **Relevant memories** -- hybrid search for contextually similar past experience (`src/services/dynamic-prompt-builder.ts:63-79`)
4. **Top-performing posts** -- last 30 days, sorted by likes, for style reference (`src/services/dynamic-prompt-builder.ts:82-85`)
5. **Voice profile** -- structured personality injected as natural-language instructions (`src/services/dynamic-prompt-builder.ts:88-97`)
6. **Procedural rules** -- explicit instructions from learned patterns (`src/services/dynamic-prompt-builder.ts:100-106`)
7. **User preferences** -- recent learned preferences from feedback (`src/services/dynamic-prompt-builder.ts:109-112`)

Specialized prompt builders exist for: template selection, scheduling, discovery, analysis, footage analysis, video editing, and idea pitching.

### 1.5 Skills System

11 skill files define detailed workflows as markdown:

| Skill | File | Purpose |
|-------|------|---------|
| generate-content | `skills/generate-content.md` | Quality-gated post generation workflow |
| analyze-performance | `skills/analyze-performance.md` | Statistical insight extraction from metrics |
| analyze-footage | `skills/analyze-footage.md` | Multi-pass video analysis (scan -> deep -> key moments) |
| apply-feedback | `skills/apply-feedback.md` | Edit pattern detection and preference learning |
| create-edit | `skills/create-edit.md` | EDL construction from footage analysis |
| discover-content | `skills/discover-content.md` | Scored content discovery with queue-aware thresholds |
| schedule-content | `skills/schedule-content.md` | Platform-optimal timing with personalized overrides |
| select-template | `skills/select-template.md` | Template matching via content structure classification |
| pitch-idea | `skills/pitch-idea.md` | Weekly creative video ideation pipeline |
| proactive-partner | `skills/proactive-partner.md` | Personality-driven Slack interaction patterns |
| voice-learning | `skills/voice-learning.md` | Edit diff analysis and voice profile construction |

Skills are loaded at prompt-build time and injected as `<skill_instructions>` XML blocks.

### 1.6 Nightly Consolidation Pipeline

Runs on a cron schedule (`src/services/memory-consolidation.ts:29-64`):

1. **Voice profile consolidation** -- analyzes 7 days of edit/approve/reject episodes, rebuilds voice profile using Gemini Pro
2. **Video preference consolidation** -- extracts editing style preferences from video_feedback episodes
3. **Episode compression** -- truncates old, low-salience episodes to save storage
4. **Procedural rule promotion** (weekly) -- promotes high-confidence patterns to explicit rules

---

## 2. Competitor Comparison

### 2.1 vs OpenClaw (Autonomous AI Agent)

| Dimension | Social Media Agent | OpenClaw |
|-----------|-------------------|----------|
| Memory | Three-tier (episodic/semantic/procedural) with vector search | Long-term memory with retrieval, but less structured consolidation |
| Autonomy | Semi-autonomous (HITL approval gate) | Fully autonomous task execution |
| Self-improvement | Nightly consolidation learns from feedback | Real-time learning from task outcomes |
| Tool use | No runtime tool use during generation | Web browsing, code execution, file manipulation |
| Planning | Single-step generation per task | Multi-step planning with reflection |

**Key gap**: The agent lacks runtime tool use. It cannot search the web, execute code, or access external APIs during content generation. OpenClaw can dynamically gather information mid-task.

### 2.2 vs AutoGPT (Autonomous Task Completion)

| Dimension | Social Media Agent | AutoGPT |
|-----------|-------------------|---------|
| Task decomposition | Fixed pipeline per content type | Dynamic task breakdown with sub-goals |
| Self-critique | None -- single-shot generation | Built-in self-evaluation loops |
| Web access | None during generation | Full web browsing for research |
| Memory | Sophisticated vector+keyword hybrid | Simple long-term memory store |
| Domain focus | Narrow (social media) | General purpose |

**Key gap**: No self-critique loop. The agent generates content in a single pass with no self-evaluation before presenting to the user. AutoGPT uses iterative refinement cycles.

### 2.3 vs LangGraph (Stateful Agent Workflows)

| Dimension | Social Media Agent | LangGraph |
|-----------|-------------------|-----------|
| Workflow engine | Hardcoded TypeScript pipelines | Graph-based state machines with conditional edges |
| State management | Supabase DB + in-memory caches | First-class state management with checkpointing |
| Branching logic | If/else in code | Declarative conditional routing |
| Human-in-the-loop | Slack-based approval gate | Native HITL nodes with interrupt/resume |
| Streaming | Not supported | Native streaming with partial results |
| Retry/recovery | Basic retry_count field | Built-in fault tolerance and recovery |

**Key gap**: Workflows are rigid TypeScript pipelines, not configurable graphs. Adding a new content type or changing the generation flow requires code changes. LangGraph's declarative approach makes agent behavior more composable and debuggable.

### 2.4 vs CrewAI (Multi-Agent Orchestration)

| Dimension | Social Media Agent | CrewAI |
|-----------|-------------------|--------|
| Agent count | Single agent with multiple skills | Multiple specialized agents collaborating |
| Role specialization | One agent switches "hats" via skill files | Dedicated agents for research, writing, editing, QA |
| Delegation | N/A | Agents can delegate tasks to each other |
| Collaboration | N/A | Agents review each other's work |
| Memory sharing | Single memory store | Shared memory across agents |

**Key gap**: Single-agent architecture. There is no writer/editor/reviewer separation. A multi-agent setup where a "researcher" gathers context, a "writer" drafts content, and an "editor" critiques it before HITL review could significantly improve output quality.

### 2.5 vs Claude Code / Aider (AI Coding Agents with Memory & Tools)

| Dimension | Social Media Agent | Claude Code / Aider |
|-----------|-------------------|---------------------|
| Memory | Vector-augmented three-tier system | CLAUDE.md files, conversation context, project memory |
| Tool use | None during generation | File read/write, shell execution, web search |
| Self-correction | None | Iterative: run tests, fix, re-run |
| Context assembly | 7-layer dynamic prompt builder | Repo-map + file reads + conversation |
| Learning | Nightly consolidation from feedback | Per-session learning, persistent memory files |

**Key gap**: No iterative self-correction. Claude Code runs tests and fixes its own mistakes. The social media agent has no equivalent quality assurance loop -- it generates once and hands to the human.

---

## 3. Improvement Opportunities (Ranked by Impact)

### HIGH Impact

#### 3.1 RAG for Content Generation Using Existing Embeddings

**Current state**: The agent already has a hybrid vector+keyword search system (`src/services/agent-memory.ts:99-138`) and stores embeddings for all memories. However, `DynamicPromptBuilder.buildContentGenerationPrompt` only searches memories with a generic query string (`src/services/dynamic-prompt-builder.ts:63-75`). It does not perform RAG against the actual source content, past posts, or external knowledge bases.

**Opportunity**: Leverage the existing embedding infrastructure to:
- Index all past posts with their performance metrics for true few-shot retrieval
- Index scraped article content so the generation model can reference specific facts
- Retrieve the most stylistically similar high-performing posts (not just top by likes) as examples
- Use the existing `search_agent_memory` RPC for retrieval, feeding results as grounded context

**Estimated effort**: Medium. Infrastructure exists; needs new indexing and smarter retrieval queries.

#### 3.2 Self-Critique Loop Before HITL

**Current state**: Content is generated in a single Claude API call (`src/utils/model.ts:15-34`) and immediately sent to the user for review. There is no intermediate quality check.

**Opportunity**: Add a self-critique step after generation:
1. Generate draft (Claude)
2. Score draft against quality gates defined in `skills/generate-content.md:22-31` (relevance, tone, length, originality, CTA, proofread)
3. If any gate fails, revise automatically (Claude with critique feedback)
4. Only present the refined version to the user

This directly mirrors what AutoGPT and Claude Code do with their iterative loops. The quality gates are already defined in the skill file but are not enforced programmatically.

**Estimated effort**: Low-Medium. The quality gate criteria exist in skill docs; needs a scoring pass + conditional retry in the generation pipeline.

#### 3.3 Tool Use / Web Search During Generation

**Current state**: The agent generates content based solely on pre-fetched context (reports, memories, insights). It cannot look up facts, verify claims, check trending topics, or access real-time information during the generation step.

**Opportunity**: Integrate Claude's tool-use capability to:
- Search the web for current context when generating about trending topics
- Verify facts and statistics mentioned in the source report
- Check competitor posts on the same topic to ensure differentiation
- Look up platform-specific trending hashtags for LinkedIn posts

**Estimated effort**: Medium-High. Requires Claude tool-use integration (message API with tools), defining tool schemas, and handling tool call results in the generation pipeline.

### MEDIUM Impact

#### 3.4 Multi-Agent Content Pipeline

**Current state**: Single agent handles all tasks via skill switching.

**Opportunity**: Decompose the generation pipeline into specialized roles:
- **Researcher agent**: Gathers context, searches web, pulls memory
- **Writer agent**: Generates draft using researcher's brief
- **Editor agent**: Critiques, checks facts, enforces voice profile rules
- **Scheduler agent**: Optimizes timing using performance data

This would improve output quality through separation of concerns and inter-agent review.

**Estimated effort**: High. Requires architectural changes to support multi-agent orchestration.

#### 3.5 Graph-Based Workflow Engine

**Current state**: Content pipelines are hardcoded TypeScript functions. Adding a new content type or modifying the flow requires code changes.

**Opportunity**: Replace rigid pipelines with a graph-based workflow engine (similar to LangGraph):
- Define content flows as state machines with conditional edges
- Enable runtime workflow modification without code changes
- Built-in checkpointing for long-running video workflows
- Better error recovery and partial completion handling

**Estimated effort**: High. Significant refactor of the pipeline architecture.

#### 3.6 Performance-Driven Content Strategy

**Current state**: Performance insights are generated and stored (`src/services/agent-memory.ts:308-343`) but are only injected as passive context. The agent does not proactively adjust its content strategy based on performance trends.

**Opportunity**: Close the feedback loop:
- Automatically adjust content mix ratios based on what performs best
- Shift posting times based on engagement data (the scheduling skill describes this but it relies on LLM interpretation rather than algorithmic optimization)
- A/B test different approaches by generating multiple variants and tracking which variant style performs better over time
- Proactively suggest content types that are underrepresented but high-performing

**Estimated effort**: Medium. Requires adding algorithmic decision logic alongside the LLM-driven approach.

### LOW Impact

#### 3.7 Streaming Generation

**Current state**: No streaming support. Users wait for the full generation to complete before seeing anything.

**Opportunity**: Stream partial results to Slack as they generate. Show the user the draft forming in real-time, which improves perceived responsiveness and allows early intervention.

**Estimated effort**: Low-Medium. Anthropic SDK supports streaming; Slack supports message updates.

#### 3.8 Enhanced Embedding Model

**Current state**: Uses Gemini's embedding model for memory vectors (`src/services/gemini-service.ts:286-319`).

**Opportunity**: Evaluate newer/better embedding models (e.g., Gemini's latest, or specialized social media embeddings) that might improve memory retrieval relevance. The existing architecture supports model swapping via config.

**Estimated effort**: Low. Config change + evaluation.

#### 3.9 Confidence-Gated Autonomy

**Current state**: All generated content goes through HITL approval regardless of quality.

**Opportunity**: When voice profile confidence is high (>0.9), procedural rules are well-established, and the content matches a high-confidence pattern, allow the agent to auto-publish without approval. This graduated autonomy mirrors how trust builds between human collaborators.

**Estimated effort**: Low. Add a confidence threshold check before the approval gate.

---

## 4. Summary

The Social Media Agent has a **notably sophisticated memory and learning system** that rivals or exceeds what most comparable tools offer. Its three-tier memory architecture (episodic -> semantic -> procedural), hybrid vector+keyword search, nightly consolidation pipeline, and structured voice profiles represent genuine intelligence infrastructure. The 11-skill system with dynamic prompt assembly is well-designed for domain-specific reasoning.

However, the agent's **generation pipeline is comparatively simple**: single-shot, no self-critique, no tool use, no multi-agent collaboration. This is the primary gap compared to competitors like AutoGPT (self-critique loops), Claude Code (iterative tool use), CrewAI (multi-agent review), and LangGraph (composable workflows).

The three highest-impact improvements are:

1. **Self-critique loop** (LOW effort, HIGH impact) -- the quality gates already exist in skill docs; enforcing them programmatically before HITL review would catch most issues that users currently fix via edits, reducing edit frequency and accelerating voice learning.

2. **RAG for content generation** (MEDIUM effort, HIGH impact) -- the vector search infrastructure already exists; using it to retrieve style-matched high-performing posts as few-shot examples during generation would improve quality immediately.

3. **Tool use during generation** (MEDIUM-HIGH effort, HIGH impact) -- enabling web search and fact-checking during generation would bring the agent closer to autonomous research capability and significantly improve content accuracy and relevance.

The agent's existing memory infrastructure is a strong foundation. The primary opportunity is to make the generation step smarter by leveraging what the memory system already knows, adding self-evaluation before human review, and enabling real-time information access.
