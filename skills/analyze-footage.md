# Analyze Footage

Workflow for analyzing uploaded video footage to prepare it for editing.

## Inputs

- `footage_path`: Path or URL to the uploaded video file
- `metadata`: Duration, resolution, codec, file size
- `context`: Optional user notes about what the footage contains

## Step 1: Quick Scan (First Pass)

Perform a fast initial analysis to get the big picture:

1. **Sample frames** at 1-second intervals throughout the video
2. **Detect scene boundaries** — Identify cuts, transitions, and significant visual changes
3. **Extract audio track** — Separate audio for independent analysis
4. **Generate thumbnail strip** — Create a visual timeline overview
5. **Estimate overall quality** — Resolution, bitrate, stability assessment

Output a scene list with timestamps and brief descriptions.

## Step 2: Deep Analysis (Per Scene)

For each detected scene, analyze in detail:

### Visual Assessment
| Check | What to Look For |
|-------|-----------------|
| Resolution | Native resolution, any upscaling artifacts |
| Stability | Camera shake, smooth vs handheld, stabilization potential |
| Lighting | Exposure level, consistency, harsh shadows, backlit subjects |
| Focus | Sharp vs soft, rack focus moments, out-of-focus segments |
| Composition | Rule of thirds, headroom, leading lines, visual interest |
| Color | White balance consistency, color cast, grading potential |

### Content Tagging
| Tag Category | Examples |
|-------------|----------|
| Subject | Person speaking, product demo, landscape, screen recording |
| Action | Walking, talking, demonstrating, reacting, transitioning |
| Emotion | Excited, serious, contemplative, humorous, dramatic |
| Setting | Indoor/outdoor, office, studio, casual, professional |
| Text/Graphics | On-screen text, logos, UI elements, captions |

### Audio Assessment
- Speech detection: Is someone talking? Transcribe key segments.
- Background noise level: Clean, moderate, noisy
- Music presence: Background music, its mood and tempo
- Audio quality: Clipping, hiss, echo, wind noise

## Step 3: Identify Key Moments

Flag segments that stand out:

- **Hooks** — Visually striking or attention-grabbing moments (first 3 seconds of potential clips)
- **Highlights** — Peak energy, best quotes, most visually interesting shots
- **Reactions** — Genuine emotional reactions, laughter, surprise
- **B-roll opportunities** — Atmospheric shots, detail shots, transitions
- **Cut points** — Natural pauses, scene changes, action completions

Rate each moment: `must-use`, `strong`, `usable`, `weak`

## Step 4: Technical Notes

Flag any issues that affect editing:

- Segments with audio sync problems
- Footage that needs stabilization
- Sections requiring color correction
- Areas where AI upscaling would help
- Segments to avoid (blurry, overexposed, corrupted)

## Output

Return:
- `duration`: Total footage length
- `scene_count`: Number of detected scenes
- `scenes`: Array of scene objects with timestamps, descriptions, tags, quality scores
- `key_moments`: Array of flagged moments with ratings
- `technical_issues`: Array of problems and their timestamps
- `usable_ratio`: Percentage of footage rated `usable` or better
- `recommended_clips`: Top 5 suggested clip ranges for the intended content
