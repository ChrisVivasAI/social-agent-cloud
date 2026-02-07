# Discover Content

Workflow for finding and evaluating content ideas for the queue.

## Sources

Pull potential content from these feeds in order of reliability:

1. **Curated RSS feeds** — Industry blogs, newsletters, news sites configured by the user
2. **Social listening** — Trending topics and conversations in the user's niche
3. **Competitor watch** — What similar accounts are posting (for inspiration, not copying)
4. **Evergreen bank** — Previously saved ideas that haven't been used
5. **User submissions** — Ideas or links the user has manually added

## Step 1: Gather Candidates

Collect up to 20 candidate ideas per discovery run. For each candidate, extract:
- `title`: Short description of the idea
- `source`: Where it came from
- `url`: Link to source material (if applicable)
- `freshness`: How recent the topic is (hours/days old)
- `topic_tags`: Relevant topic categories

## Step 2: Score Each Candidate

Score each idea on a 0-100 scale using these weighted criteria:

| Criterion | Weight | How to Evaluate |
|-----------|--------|-----------------|
| Audience relevance | 30% | Does it match the account's niche and audience interests? |
| Timeliness | 20% | Is it trending now or still relevant? Decay score for older topics. |
| Novelty | 20% | Has the account covered this topic before? Check last 60 days of posts. |
| Engagement potential | 15% | Based on similar past content, is this likely to perform well? |
| Effort-to-value | 15% | How much work vs. expected return? Quick wins score higher. |

## Step 3: Apply Source Weighting

Adjust scores based on historical source performance:
- Track which sources have produced top-performing content
- Multiply candidate score by the source's success rate (0.5-1.5x)
- New sources start at 1.0x (neutral)
- Update source weights weekly based on published post performance

## Step 4: Queue-Aware Threshold

Adjust the acceptance threshold based on current queue state:

| Queue Size | Min Score to Accept | Rationale |
|------------|-------------------|-----------|
| 0 items | 40 | Accept more liberally to avoid empty queue |
| 1-3 items | 55 | Slightly relaxed |
| 4-7 items | 65 | Standard threshold |
| 8+ items | 75 | Only accept strong ideas |

## Step 5: Learn from Dismissals

When the user dismisses a suggested idea:
- Record the dismissal with the idea's topic tags
- After 3+ dismissals of the same tag, reduce weight for that tag by 20%
- After 5+ dismissals from the same source, reduce source weight by 30%
- Periodically reset penalties (every 30 days) to allow re-evaluation

## Step 6: Deduplicate

Before adding to queue:
- Check for semantic similarity with existing queue items (reject if >80% similar)
- Check for similarity with posts from the last 30 days
- If similar content exists, only accept if the new angle is meaningfully different

## Output

Return:
- `accepted_ideas`: Array of ideas above threshold, sorted by score
- `rejected_ideas`: Array with rejection reasons (for learning)
- `queue_status`: Current queue depth after additions
- `source_performance`: Updated source reliability scores
