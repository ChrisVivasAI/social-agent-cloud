# Social Posting & Engagement Analysis

## Current Capabilities

### Platform Support
- **Twitter (X)**: Full posting via Twitter API v2 (`src/clients/twitter.ts:15-135`), including text tweets, media (image/video) upload (`twitter.ts:50-59`), threaded replies (`twitter.ts:81-106`), and metric retrieval (likes, retweets, comments, impressions) (`twitter.ts:62-79`).
- **LinkedIn**: Full posting via LinkedIn REST API v2 (`src/clients/linkedin.ts:13-363`), including text-only posts (`linkedin.ts:77-114`), image posts with registered uploads (`linkedin.ts:116-231`), video posts (`linkedin.ts:233-348`), and partial metric retrieval (likes, comments only -- no impressions) (`linkedin.ts:44-75`).
- **Platform routing**: PostingService dispatches to one or both platforms per queue item (`src/services/posting-service.ts:44-88`). Platform-specific text variants are generated (`posting-service.ts:48-51`): Twitter gets a 280-char version, LinkedIn gets the full post.

### Content Ingestion & Discovery
- **RSS-based content discovery**: Polls 6 hardcoded RSS feeds (HN, TechCrunch, The Verge, Ars Technica, OpenAI Blog, Anthropic Blog) every 2 hours (`src/services/content-discovery.ts:8-33`, `src/services/scheduler.ts:117-123`).
- **AI relevance scoring**: Each discovered article is scored 0.0-1.0 by Claude for developer/AI audience relevance (`content-discovery.ts:35-47`). Dynamic threshold adjusts based on queue fullness (0.5 when empty, 0.85 when full) (`content-discovery.ts:104-111`).
- **Deduplication**: New articles are checked against existing `discovered_content` table to prevent re-processing (`content-discovery.ts:93-99`).
- **Slack-based intake**: Users send messages via Slack; IntakeService classifies content type (link/image/video/remotion/text/video_edit), scheduling intent, platform target, and priority (`src/services/intake-service.ts:9-208`). Supports Gemini vision analysis for attached images (`intake-service.ts:86-117`).

### Content Generation Pipeline
- **Multi-step generation**: Link posts go through scrape -> marketing report -> platform-specific post generation (`src/services/content-generator.ts:135-188`). Generates separate Twitter and LinkedIn variants.
- **Content types supported**: link, image, video, remotion (AI video), text, video_edit (`content-generator.ts:979-1141`).
- **Thread generation**: Automatic Twitter thread (3-5 tweets) when content exceeds 280 chars (`content-generator.ts:246-265`).
- **Video pipeline**: Full Remotion video generation with 6 templates (TechNewsVideo, QuoteCard, ProductShowcase, AudiogramVideo, StoryVideo, ShortFormVideo), AI-generated TTS via fal.ai MiniMax Speech, AI images via fal.ai Flux 2 Flex, image quality gating via Gemini vision (`content-generator.ts:391-564`, `74-130`).
- **Dynamic prompt augmentation**: DynamicPromptBuilder injects performance insights, voice profile, procedural rules, user preferences, and skill instructions into all generation prompts (`src/services/dynamic-prompt-builder.ts:34-115`).

### Scheduling & Queue Management
- **4 posts/week default schedule**: Mon 9AM, Tue 10AM, Thu 9AM, Fri 10AM (`src/config/schedule.ts:26-51`).
- **Content mix balancing**: Soft weekly quota per type (1 link, 1 media, 1 remotion, 1 text) with automatic overflow to next week (`src/services/content-queue.ts:22-48`).
- **Status lifecycle**: pending -> generating -> generated -> rendering -> awaiting_approval -> ready -> posted/failed (`content-queue.ts`).
- **Approval workflow**: Generated items go to Slack for human review with approve/reject/edit buttons; auto-approval option for configured content types (`src/services/scheduler.ts:368-423`).
- **Pre-post notifications**: 35 minutes before posting, Slack notification sent (`scheduler.ts:479-494`).
- **Failed item retry**: Every 30 min, failed items retry up to 3 times with smart error classification (permanent vs. transient vs. rate-limit) (`scheduler.ts:425-466`).
- **Adaptive scheduling config**: Supports dynamic slot count (up to 8/week), analysis window of 30 days for timing optimization (`schedule.ts:62-74`).

### Metrics & Analytics
- **Engagement collection**: Hourly cron collects 24h and 72h metrics from Twitter (likes, retweets, comments, impressions, engagement rate) and LinkedIn (likes, comments) (`src/services/metrics-collector.ts:34-88`).
- **Post history tracking**: Each post recorded with platform, timestamp, day-of-week, hour-of-day for pattern analysis (`content-queue.ts:131-165`).
- **Performance analysis**: Weekly Gemini Flash analysis of last 30 days of metrics to extract actionable insights (topic performance, timing optimization, template performance, audience preferences) (`metrics-collector.ts:173-237`).
- **Evergreen repost suggestions**: Sunday 6PM job surfaces high-performing posts (5+ likes, 2+ weeks old) for potential reposting (`scheduler.ts:524-556`).

### Memory & Learning System
- **Hybrid vector+keyword memory**: AgentMemoryService stores feedback, performance, preferences, patterns with pg_vector embeddings via Gemini for semantic search (`src/services/agent-memory.ts:43-649`).
- **Voice profile learning**: Nightly consolidation pipeline analyzes edit/feedback episodes to build structured voice profile (tone, formality, humor style, platform-specific styles, topic framings, hard rules) (`src/services/memory-consolidation.ts:19-60`).
- **Procedural rule promotion**: When a pattern reaches 3+ episodes, it becomes a strict rule injected into all generation prompts (`agent-memory.ts:504-528`).
- **Episode compression**: Old low-salience episodes (>30 days) get truncated to save space (`agent-memory.ts:610-648`).

### Proactive Agent Personality
- **Morning briefing** (8:30 AM weekdays): Streak data, today's plan, insights, motivational close (`src/services/proactive-agent.ts:67-80`, `scheduler.ts:169-173`).
- **Smart nudges** (3 PM weekdays): Context-aware reminders (`scheduler.ts:176-180`).
- **Milestone celebrations**: Streak tracking, total posts, engagement milestones (`proactive-agent.ts:28-32`, `scheduler.ts:183-188`).
- **Trend alerts** (3x daily weekdays): Surfacing trending topics (`scheduler.ts:190-195`).
- **Weekly retrospective** (Friday 4 PM): Evolving voice, performance reflection (`scheduler.ts:197-203`).

---

## Competitor Comparison

### Buffer
| Capability | This Agent | Buffer |
|---|---|---|
| Platforms supported | Twitter, LinkedIn (2) | Twitter, LinkedIn, Instagram, Facebook, Pinterest, TikTok, Mastodon, Bluesky, Threads, YouTube (10+) |
| Scheduling | 4 fixed weekly slots, adaptive config | Flexible calendar UI, drag-and-drop, best-time suggestions |
| Content queue | Supabase-backed with status lifecycle | Visual queue with drag reordering, pause/resume |
| Analytics | 24h/72h metric pulls, weekly AI analysis | Real-time dashboards, custom date ranges, exportable reports |
| AI content generation | Claude-powered full pipeline (scrape->report->post) | AI Assistant for captions/rephrasing |
| Engagement/replies | Not supported | Engagement inbox for replies across platforms |
| Team collaboration | Single-user Slack-based | Multi-user with approval workflows, roles, permissions |
| Content calendar | Week view via Slack | Visual calendar with month/week/day views |
| Hashtag suggestions | Not supported | AI-powered hashtag suggestions |
| Link shortening/tracking | Not supported | Built-in link shortening with click tracking |

### Hootsuite
| Capability | This Agent | Hootsuite |
|---|---|---|
| Platforms supported | 2 | 10+ including YouTube, TikTok |
| Social listening | RSS feed discovery only | Full social listening (keyword monitoring, sentiment analysis, brand mentions) |
| Engagement monitoring | Metric collection only, no reply monitoring | Unified inbox for all platforms, auto-assignment, sentiment tagging |
| Team workflow | Single-user | Enterprise: team roles, approval chains, asset library |
| Analytics | Weekly AI batch analysis | Real-time dashboards, ROI tracking, competitive benchmarking |
| Content curation | 6 RSS feeds | Streams, content suggestions, RSS, content library |
| Ad management | Not supported | Paid social ad management integration |
| CRM integration | Not supported | Salesforce, HubSpot integrations |

### Sprout Social
| Capability | This Agent | Sprout Social |
|---|---|---|
| Social listening | RSS discovery | Deep listening: brand mentions, competitor tracking, sentiment analysis, crisis detection |
| Engagement | Post-and-forget | Smart Inbox: unified cross-platform inbox with reply, like, retweet directly |
| Reply automation | Not supported | Suggested replies, saved replies, chatbot flows |
| Audience analytics | Day/hour engagement patterns | Demographic data, audience growth tracking, follower analysis |
| Competitive intelligence | Not supported | Competitor benchmarking, share-of-voice analysis |
| Reporting | Internal AI analysis | Presentation-ready reports, custom report builder, export to PDF/CSV |
| Employee advocacy | Not supported | Employee advocacy platform for content amplification |

### LangChain Social Agent / AI-powered Social Tools
| Capability | This Agent | LangChain-style AI Agents |
|---|---|---|
| AI backbone | Claude (Anthropic) + Gemini Flash for analysis/vision | Modular LLM (OpenAI, Anthropic, etc.) with tool chains |
| Content generation | Full pipeline with dynamic prompts, voice learning, feedback loop | Typically single-shot generation without persistent memory |
| Memory system | Hybrid vector+keyword with consolidation, procedural rules, voice profiles | Typically conversation-window memory or external vector store |
| Video generation | Full Remotion pipeline with TTS, AI images, quality gating | Rare; most focus on text/image only |
| Proactive behavior | Morning briefings, trend alerts, milestone celebrations | Typically reactive only |
| Learning loop | Feedback -> episodes -> consolidation -> rules -> improved generation | Basic RAG; few have closed-loop learning from post-performance |
| Observability | Slack-based with review cards | Varies; LangSmith/LangFuse for traces |

### Later / SocialBee
| Capability | This Agent | Later / SocialBee |
|---|---|---|
| Content recycling | Evergreen repost suggestions (Sunday cron) | Full content recycling: category-based queues, automatic resharing on schedule |
| Visual planning | Text-based Slack interface | Visual Instagram grid planner, media library |
| Content categories | Soft type mix (link/media/remotion/text) | Category-based queues with custom ratios and rotation |
| Best time to post | Adaptive scheduling config (not yet active on enough data) | Data-driven best time recommendations per platform |
| Link in bio | Not supported | Linkin.bio / Smart.bio landing pages |
| Bulk scheduling | One-at-a-time via Slack | CSV bulk upload, bulk scheduling |
| Content variations | Thread generation | A/B testing of post variants, content variations per platform |

---

## Improvement Opportunities (Ranked by Impact)

### HIGH Impact

1. **Engagement/Reply Monitoring & Social Inbox**
   - **Gap**: The agent posts content and collects metrics, but never monitors replies, mentions, or DMs. Twitter client has `replyToTweet` (`twitter.ts:81-106`) but it is only used for threads, never for community engagement. LinkedIn client has no reply capability at all.
   - **Competitor reference**: Buffer, Hootsuite, Sprout Social all have unified engagement inboxes. Sprout Social's Smart Inbox is a core differentiator.
   - **Recommended approach**: Add a `mentions-monitor` cron that polls Twitter mentions/replies via `v2.userMentionTimeline()` and LinkedIn notifications. Surface new mentions in Slack with one-click reply buttons. Use Claude to draft reply suggestions.
   - **Why HIGH**: Community engagement is the single biggest driver of organic growth. Posting without engaging is like broadcasting into a void. This is the most glaring gap vs. every competitor.

2. **A/B Variant Testing**
   - **Gap**: The agent generates one Twitter and one LinkedIn variant per post. There is no mechanism to test multiple variants of the same post and measure which performs better. The content generator could easily produce 2-3 variants, but the infrastructure to split-test and track winners does not exist.
   - **Competitor reference**: Later and SocialBee offer content variations. Buffer has experimented with A/B testing. Sprout Social tracks variant performance.
   - **Recommended approach**: Generate 2 variants per post at content-generation time. Post variant A, then variant B a week later (or on different platforms). Track which gets better engagement, feed results back into the memory/insights system.
   - **Why HIGH**: The entire learning loop (memory -> insights -> prompt augmentation) already exists. A/B testing would dramatically accelerate learning about what works, multiplying the value of the existing intelligence infrastructure.

3. **Additional Platform Support (Instagram, Bluesky, Threads)**
   - **Gap**: Only Twitter and LinkedIn are supported. PostingService (`posting-service.ts:10-17`) hardcodes two clients. IntakeService platform validation only allows "both", "twitter", "linkedin" (`intake-service.ts:197-201`).
   - **Competitor reference**: Buffer supports 10+ platforms. Hootsuite supports 10+. Even niche tools like Later started as Instagram-first.
   - **Recommended approach**: Start with Bluesky (AT Protocol, open API, growing developer audience) and Instagram (Meta Graph API for business accounts, huge reach). Add a `BlueskyClient` following the same interface pattern as TwitterClient. Extend PostingService routing.
   - **Why HIGH**: Platform diversity is a core expectation of any social management tool. The developer audience is increasingly on Bluesky. Instagram is table-stakes for reach.

4. **Real-time Analytics Dashboard**
   - **Gap**: Analytics are only viewable through Slack notifications (weekly digest, morning briefing) and internal AI analysis. No persistent dashboard, no trend visualization, no on-demand reporting.
   - **Competitor reference**: Buffer, Hootsuite, and Sprout Social all have web dashboards with charts, date pickers, and export functionality.
   - **Recommended approach**: Build a lightweight web dashboard (Next.js or similar) that queries `post_history` and `performance_insights` tables directly from Supabase. Show engagement trends, best-performing posts, content type breakdown, posting streaks.
   - **Why HIGH**: Visibility into performance is essential for decision-making. Currently, insights are generated but buried in the system. A dashboard makes the intelligence layer tangible and actionable.

### MEDIUM Impact

5. **Content Calendar UI**
   - **Gap**: The queue is managed entirely through Slack slash commands. There is no visual calendar. The `getItemsForWeekOffset` method exists (`content-queue.ts:242-273`) but only powers Slack text output.
   - **Competitor reference**: Buffer and Later have visual drag-and-drop calendars. Hootsuite has a planner view.
   - **Recommended approach**: Web-based weekly/monthly calendar view showing scheduled, pending, and posted items. Allow drag-to-reschedule and click-to-edit.

6. **Hashtag Strategy & Suggestions**
   - **Gap**: No hashtag generation or optimization. Posts are generated without hashtag consideration. The prompts do not instruct Claude to include or optimize hashtags.
   - **Competitor reference**: Buffer, Later, and Hootsuite all offer hashtag suggestions. Sprout Social tracks hashtag performance.
   - **Recommended approach**: Add hashtag generation to the content generation prompts, with platform-specific strategies (Twitter: 1-3 targeted hashtags, LinkedIn: 3-5 industry hashtags). Track hashtag performance in `post_history`.

7. **Link Tracking & UTM Parameters**
   - **Gap**: URLs are shared as-is. No link shortening, no UTM parameter injection, no click tracking.
   - **Competitor reference**: Buffer has built-in link shortening with analytics. Hootsuite integrates with Bitly.
   - **Recommended approach**: Auto-append UTM parameters (source=social, medium=platform, campaign=content_type) to shared URLs. Integrate with a link shortener API.

8. **Bulk Content Scheduling**
   - **Gap**: Content is added one item at a time through Slack or RSS discovery. No way to upload a batch of content or schedule a week at once.
   - **Competitor reference**: Later and Buffer support CSV bulk upload. SocialBee has category-based batch scheduling.
   - **Recommended approach**: Add a `/bulk` Slack command that accepts multiple URLs or topics, or support CSV upload through Slack file attachment.

9. **Content Recycling with Decay Awareness**
   - **Gap**: Evergreen repost suggestions exist (`scheduler.ts:524-556`) but are basic -- just surfaces posts with 5+ likes that are 2+ weeks old. No intelligent refresh/rephrase, no cooldown tracking, no category rotation.
   - **Competitor reference**: SocialBee's core differentiator is category-based content recycling with automatic rotation. Later offers similar features.
   - **Recommended approach**: Enhance the evergreen system with: content freshness scoring, automatic rephrase via Claude before repost, cooldown periods per post, category-based rotation to ensure variety.

### LOW Impact

10. **Multi-user Team Collaboration**
    - **Gap**: Single-user system controlled via one Slack channel. No role-based access, no multi-approver workflow, no shared content library.
    - **Competitor reference**: Hootsuite and Sprout Social are enterprise-grade with teams, roles, and approval chains.
    - **Recommended approach**: Low priority for a personal/small-team agent. Would require significant auth infrastructure.

11. **Competitive/Brand Monitoring**
    - **Gap**: No social listening beyond RSS feeds. Cannot monitor brand mentions, competitor activity, or industry conversations.
    - **Competitor reference**: Sprout Social and Hootsuite have deep social listening with sentiment analysis and crisis detection.
    - **Recommended approach**: Add Twitter search API queries for brand keywords and competitor handles. Surface in Slack as discovery items.

12. **Employee Advocacy / Content Amplification**
    - **Gap**: Not applicable for current single-user setup.
    - **Competitor reference**: Sprout Social has an employee advocacy module.

---

## Summary

The social media agent has a remarkably strong AI-powered content generation pipeline -- its multi-step generation (scrape -> report -> post), dynamic prompt augmentation with learned voice profiles, and closed-loop performance learning system are more sophisticated than what most competitors offer. The Remotion video pipeline with TTS and AI image generation is a unique differentiator that none of the compared tools match.

**Core strengths vs. competitors:**
- Deepest AI integration (Claude for generation, Gemini for analysis/vision/embeddings, fal.ai for TTS/images)
- Self-improving system (feedback -> memory -> consolidation -> procedural rules -> better output)
- Proactive personality layer (morning briefings, milestone celebrations, smart nudges)
- Full video generation pipeline with quality gating

**Critical gaps (in priority order):**
1. **Engagement monitoring** -- the agent is "post-and-forget" with no community interaction capability
2. **A/B variant testing** -- the learning infrastructure exists but only tests one variant per post
3. **Platform coverage** -- only 2 platforms vs. industry standard of 6-10
4. **Analytics visibility** -- intelligence is generated but locked inside the system with no dashboard

The highest-ROI improvements would be engagement monitoring (drives organic growth) and A/B testing (accelerates the existing learning loop). Platform expansion to Bluesky and Instagram would bring the agent closer to feature parity with competitors on distribution reach.
