# Pitch Idea

Workflow for generating weekly creative video ideas to propose to the user.

## Cadence

Run this workflow once per week (e.g., Monday morning). Generate 3-5 pitched ideas for the user to review, approve, or modify.

## Step 1: Gather Inputs

Before brainstorming, collect context:

1. **Trending topics** — Scan trending hashtags, news, and conversations in the user's niche from the last 7 days.
2. **Audience signals** — Review comments, DMs, and questions from followers. What are they asking about?
3. **Past performance** — Query top 10 performing posts from the last 30 days. What topics and formats resonated?
4. **Content calendar** — Check what's already scheduled or in the queue to avoid overlap.
5. **Seasonal/timely hooks** — Upcoming events, holidays, product launches, industry dates.

## Step 2: Brainstorm Ideas

Generate candidate ideas across varied formats:

| Format | Description | Best For |
|--------|-------------|----------|
| Tutorial | Step-by-step walkthrough | Educational accounts, high save rate |
| Behind-the-scenes | Raw, unpolished look at process | Authenticity, trust building |
| Reaction / Commentary | Response to trending content | Timeliness, engagement |
| Breakdown / Analysis | Deep dive into a topic | Authority building, long watch time |
| Listicle | "5 things you didn't know about..." | Easy consumption, shareability |
| Story / Narrative | Personal experience or case study | Connection, memorability |
| Challenge / Interactive | Audience participation format | Reach, community building |
| Comparison | Side-by-side evaluation | Decision-making content, debate |

Aim for at least 3 different formats per batch.

## Step 3: Evaluate Each Idea

Score each idea on:

| Criterion | Weight | Evaluation |
|-----------|--------|------------|
| Audience interest | 25% | Does this match what the audience engages with? |
| Timeliness | 20% | Is there a reason to post this now vs. later? |
| Uniqueness | 20% | Has the account or competitors covered this recently? |
| Production feasibility | 20% | Can this be produced with available resources and time? |
| Platform fit | 15% | Does this idea work well on the target platform(s)? |

## Step 4: Estimate Effort

For each idea, provide a production estimate:

| Effort Level | Description | Typical Time |
|-------------|-------------|-------------|
| Low | Text-based, existing footage, simple edit | 1-2 hours |
| Medium | Some filming needed, moderate edit, 1-2 generated assets | 3-5 hours |
| High | Full shoot required, complex edit, multiple assets | 6-12 hours |
| Premium | Multi-day production, external resources, heavy post-production | 12+ hours |

Include specific resource needs: filming required, props, locations, guests, special assets.

## Step 5: Platform Targeting

Recommend the best platform(s) for each idea:

- Match content depth to platform attention span
- Consider where the target audience is most active
- Suggest cross-posting strategy if applicable (e.g., full video on YouTube, teaser on TikTok)
- Note platform-specific adaptations needed

## Step 6: Reference Past Wins

For each pitched idea, link it to past successful content:
- "Similar to your [post title] which got [X engagement rate]"
- "This format worked well when you posted [reference]"
- "This is a new format you haven't tried — based on competitor success"

If no relevant reference exists, note it as experimental.

## Output

Return an array of 3-5 ideas, each containing:
- `title`: Catchy working title
- `format`: Video format category
- `concept`: 2-3 sentence description of the idea
- `hook`: Suggested opening line or visual
- `target_platforms`: Recommended platform(s)
- `effort`: Estimated production effort level
- `resources_needed`: Specific requirements (filming, assets, guests)
- `reference`: Link to past content or competitor example
- `score`: Composite evaluation score
- `timeliness`: How time-sensitive this idea is (post this week / this month / evergreen)
