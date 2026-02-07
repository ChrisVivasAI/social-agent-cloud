# Schedule Content

Workflow for deciding when to publish a post.

## Inputs

- `post`: The content to schedule (includes platform and content type)
- `queue`: Current queue state (pending items, their types, priorities)
- `schedule`: Existing scheduled posts with their times

## Step 1: Platform Optimal Windows

Start with known high-engagement windows per platform:

| Platform | Best Days | Best Times (UTC) | Avoid |
|----------|-----------|-------------------|-------|
| Twitter/X | Tue-Thu | 13:00-16:00 | Weekends before 10:00 |
| LinkedIn | Tue-Wed | 10:00-12:00 | Sat-Sun |
| Instagram | Mon, Wed, Fri | 11:00-13:00, 19:00-21:00 | 01:00-06:00 |
| TikTok | Tue-Thu | 19:00-22:00 | Mornings |
| YouTube | Thu-Sat | 14:00-17:00 | Mon mornings |

These are defaults. Override with actual engagement data when available (see Step 2).

## Step 2: Personalized Timing

Query `post_performance` grouped by day-of-week and hour-bucket:
- If sufficient data exists (10+ posts), replace default windows with the user's actual best-performing times.
- Weight recent data (last 30 days) 2x over older data.
- Identify the user's top 3 time slots per platform.

## Step 3: Content-Type Priority

Assign scheduling priority based on content type:

| Priority | Content Type | Slot Preference |
|----------|-------------|-----------------|
| High | Video, carousel | Peak engagement window |
| Medium | Educational, story | Second-best window |
| Low | Reposts, engagement-bait | Off-peak or fill slots |

Higher-priority content gets first pick of optimal time slots.

## Step 4: Queue-Aware Frequency

Adjust posting frequency based on queue depth:

| Queue Size | Frequency | Rationale |
|------------|-----------|-----------|
| 0-2 items | 1 post/day max | Conserve content |
| 3-7 items | 1-2 posts/day | Normal cadence |
| 8-15 items | 2-3 posts/day | Increase output |
| 15+ items | 3 posts/day max | Drain without spamming |

## Step 5: Spacing Rules

Hard constraints that override all other logic:

- **Minimum gap**: 3 hours between posts on the same platform
- **Cross-platform buffer**: 30 minutes between posts on different platforms
- **No duplicate types**: Do not schedule the same content type within 12 hours
- **Video cooldown**: At least 24 hours between video posts on the same platform

## Step 6: Conflict Resolution

If the ideal slot is taken:
1. Try the next-best slot on the same day
2. Try the same slot on the next-best day
3. If all top slots taken for 48 hours, use the best available off-peak slot

## Output

Return:
- `scheduled_time`: ISO 8601 timestamp
- `platform`: Target platform
- `slot_quality`: score 0-1 indicating how optimal this slot is
- `rationale`: Why this time was selected
- `next_available_slot`: When the next open optimal slot is
