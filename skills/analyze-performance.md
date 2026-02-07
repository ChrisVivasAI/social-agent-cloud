# Analyze Performance

Workflow for extracting actionable insights from post and video metrics.

## Data Collection

1. Pull metrics from the `post_performance` table for the requested time range (default: last 30 days).
2. Include: impressions, engagements, engagement rate, clicks, shares, saves, comments, video completion rate, follower delta.
3. Join with post metadata: content type, template used, platform, posting time, hashtags, media type.

## Comparison Dimensions

Analyze performance across each of these dimensions independently:

| Dimension | Group By | Key Metric |
|-----------|----------|------------|
| Content type | educational, opinion, promo, story, engagement | Engagement rate |
| Template | Remotion composition ID | Completion rate, shares |
| Platform | twitter, linkedin, instagram, tiktok, youtube | Impressions, engagement rate |
| Posting time | Day of week + hour bucket (morning/afternoon/evening) | Engagement rate |
| Media type | video, image, text-only, carousel | Engagement rate, saves |
| Length | short/medium/long (platform-relative) | Completion rate |

## Pattern Detection

For each dimension:

1. **Calculate baselines** — Mean and median engagement rate across all posts.
2. **Identify outliers** — Posts performing >1.5x or <0.5x the baseline.
3. **Look for clusters** — Do outliers share common traits across dimensions?
4. **Check statistical significance** — Require at least 5 data points per group before drawing conclusions.
5. **Trend detection** — Is performance improving or declining over time for any group?

## Insight Generation

Each insight must include:

- `finding`: One-sentence description of the pattern
- `evidence`: The specific numbers supporting it
- `confidence`: low (<10 data points), medium (10-25), high (25+)
- `action`: A concrete recommendation
- `dimension`: Which comparison dimension it relates to

### Rules

- Do not repeat insights already stored in `known_insights`. Check before generating.
- Prioritize actionable insights over observations. "Engagement is higher on Tuesdays" is only useful if paired with "Schedule more posts on Tuesdays."
- Flag contradictions with previous insights explicitly.
- Limit output to the top 5 most impactful insights per analysis run.

## Output

Return:
- `insights`: Array of insight objects (max 5)
- `summary`: 2-3 sentence executive summary
- `period`: The date range analyzed
- `total_posts_analyzed`: Count
- `top_performer`: The single best-performing post with its metrics
- `underperformer`: The single worst-performing post with its metrics
