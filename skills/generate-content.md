# Generate Content

Workflow for generating a social media post with quality gates.

## Pre-Generation

1. **Review past performance** — Query the `post_performance` table for the last 30 days. Identify which content types, tones, and lengths drove the highest engagement rates on the target platform.
2. **Check content mix** — Query the last 5 published posts. Do not generate the same content type as the most recent post. Aim for variety across: educational, opinion, promotional, storytelling, engagement-bait.
3. **Load user preferences** — Read stored preferences from memory: preferred tone, banned phrases, hashtag policy, emoji usage, signature style.
4. **Gather source material** — Pull the content brief from the queue item. Include any linked articles, notes, or talking points.

## Generation

5. **Draft the post** using these platform-specific constraints:
   - **Twitter/X**: Max 280 chars. Lead with a hook. No more than 2 hashtags. Threads allowed for long-form.
   - **LinkedIn**: 1300 char sweet spot. Professional but not stiff. Use line breaks for readability. 3-5 hashtags at the end.
   - **Instagram**: Caption under 2200 chars. Front-load the message before the fold. 20-30 hashtags in a comment, not the caption.
6. **Apply learned patterns** — Reference `apply-feedback.md` for any accumulated style adjustments.

## Quality Gates

Run each gate sequentially. If any gate fails, revise and re-check.

| Gate | Check | Fail Action |
|------|-------|-------------|
| Relevance | Does the post align with the account's niche and audience? | Rewrite with tighter focus |
| Tone | Does it match the user's established voice? | Adjust register and word choice |
| Length | Is it within platform limits and optimal range? | Trim or expand as needed |
| Originality | Is it meaningfully different from the last 10 posts? | Find a fresh angle |
| CTA | Does it have a clear purpose (engage, inform, convert)? | Add or clarify the call to action |
| Proofread | Grammar, spelling, formatting correct? | Fix errors |

## Output

Return the final post with:
- `content`: The post text
- `platform`: Target platform
- `content_type`: Category label
- `hashtags`: Array of hashtags (if applicable)
- `suggested_media`: Description of ideal accompanying media
- `confidence`: 0-1 score based on how well it matches past top performers
