# Select Template

Workflow for choosing the right Remotion video template for a given post.

## Inputs

- `content_type`: The category of content (educational, opinion, promo, story, etc.)
- `content_brief`: The text and talking points for the video
- `platform`: Target platform (determines aspect ratio and duration)
- `available_templates`: List of registered Remotion compositions

## Step 1: Evaluate Content Structure

Classify the content along these dimensions:

| Dimension | Options |
|-----------|---------|
| Depth | shallow (single point) / medium (2-3 points) / deep (tutorial, breakdown) |
| Pacing | fast (meme, reaction) / moderate (explainer) / slow (story, cinematic) |
| Visual needs | text-heavy / image-heavy / mixed / talking-head |
| Duration target | short (<30s) / medium (30-90s) / long (90s+) |

## Step 2: Match Template to Structure

Map the classified dimensions to template capabilities:

- **Text-heavy + shallow + fast** -> Quote card, tweet screenshot, bold text overlay
- **Image-heavy + moderate** -> Slideshow, before/after, side-by-side
- **Deep + slow** -> Tutorial layout, step-by-step, screen recording composite
- **Mixed + moderate** -> Standard video with lower thirds, b-roll cuts
- **Talking-head + any depth** -> Speaker layout with supporting visuals

## Step 3: Check Past Performance

Query `template_performance` for the candidate templates:
- Look at engagement rate, completion rate, and share rate
- Weight recent data (last 14 days) more heavily than older data
- If a template has fewer than 5 uses, treat it as neutral (no bonus or penalty)

## Step 4: Balance Variety

- Check the last 5 published videos for which templates were used
- Penalize templates used in the last 3 videos (reduce score by 30%)
- Bonus for templates not used in 14+ days (increase score by 15%)

## Step 5: Platform Constraints

Apply hard constraints based on platform:

| Platform | Aspect Ratio | Max Duration | Notes |
|----------|-------------|-------------|-------|
| Twitter/X | 16:9 or 1:1 | 140s | Autoplay, sound off default |
| LinkedIn | 16:9 or 1:1 | 600s | Professional tone expected |
| Instagram Reels | 9:16 | 90s | Hook in first 1s |
| YouTube Shorts | 9:16 | 60s | Loop-friendly endings help |
| TikTok | 9:16 | 180s | Fast pacing preferred |

## Output

Return:
- `template_id`: Selected Remotion composition ID
- `rationale`: Why this template was chosen
- `config_overrides`: Any template-specific settings to adjust
- `fallback_template_id`: Second choice if primary has issues
