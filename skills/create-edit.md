# Create Edit

Workflow for building an Edit Decision List (EDL) from analyzed footage and a content goal.

## Inputs

- `footage_analysis`: Output from `analyze-footage.md` (scenes, key moments, technical notes)
- `goal`: What the final video should achieve (educate, entertain, promote, tell a story)
- `platform`: Target platform (determines duration, aspect ratio, pacing)
- `style`: Desired editing style (fast-cut, cinematic, documentary, vlog, tutorial)
- `assets`: Available supplementary assets (music, graphics, logos, b-roll library)

## Step 1: Define Structure

Every edit follows a narrative arc. Map the structure based on content type:

| Phase | Duration | Purpose | Source Priority |
|-------|----------|---------|-----------------|
| Hook | 0-3s | Stop the scroll, create curiosity | Best visual moment or provocative statement |
| Setup | 3-10s | Establish context, introduce topic | Clear explanation or scene-setting footage |
| Buildup | 10s-60% mark | Deliver value, build tension | Core content, best quotes, demonstrations |
| Climax | 60-80% mark | Peak moment, key insight, payoff | Strongest footage, biggest reaction |
| Resolution | Final 20% | Wrap up, CTA, satisfying ending | Summary shot, call to action, logo |

Adjust percentages based on total target duration.

## Step 2: Select Footage

For each phase of the structure:

1. Pull candidate clips from `key_moments` that match the phase's purpose
2. Rank candidates by: moment rating > visual quality > audio quality
3. Select the best clip for each phase
4. Ensure variety — avoid using clips from the same scene consecutively
5. Check total duration against platform limits

### Clip Selection Rules
- Hook clip must be rated `must-use` or `strong`
- Never use footage flagged with technical issues unless no alternative exists
- Prefer clips with clean audio when speech is involved
- B-roll should complement, not distract from, the narrative

## Step 3: Generate Missing Assets

If the edit needs assets that don't exist in the footage:

| Need | Solution | Tool |
|------|----------|------|
| Voiceover / TTS | Generate narration from script | MiniMax Speech-2.8 HD via fal.ai |
| B-roll images | Generate contextual images | Flux 2 Flex via fal.ai |
| Background music | Select from licensed library or generate | Music library / AI generation |
| Text overlays | Create captions, titles, lower thirds | Remotion compositions |
| Transitions | Apply platform-appropriate transitions | Remotion effects |

## Step 4: Build the EDL

Construct the edit decision list as an ordered array of entries:

```
{
  sequence_number: number,
  source: "footage" | "generated" | "asset",
  source_path: string,
  in_point: timestamp,
  out_point: timestamp,
  duration: seconds,
  phase: "hook" | "setup" | "buildup" | "climax" | "resolution",
  overlays: [{ type, content, position, timing }],
  transitions: { in: type, out: type },
  audio: { source, volume, fade_in, fade_out },
  effects: [{ type, parameters }],
  notes: string
}
```

## Step 5: Pacing Check

Validate the edit's pacing matches the target:

| Style | Avg Cut Length | Max Static Shot | Notes |
|-------|---------------|-----------------|-------|
| Fast-cut | 1-3s | 4s | High energy, lots of movement |
| Standard | 3-6s | 8s | Balanced, natural rhythm |
| Cinematic | 5-12s | 15s | Slow, intentional, atmospheric |
| Tutorial | 5-15s | 20s | Holds on important visuals |

If pacing is off, adjust clip durations or add/remove cuts.

## Step 6: Platform Compliance

Final check against platform requirements:

| Platform | Aspect Ratio | Max Duration | Safe Zones | Audio |
|----------|-------------|-------------|------------|-------|
| Instagram Reels | 9:16 | 90s | Top/bottom 15% clear | Sound-on optimized |
| TikTok | 9:16 | 180s | Top 10%, bottom 20% clear | Sound-on required |
| YouTube Shorts | 9:16 | 60s | Top/bottom 10% clear | Sound-on preferred |
| Twitter/X | 16:9 or 1:1 | 140s | No overlays in corners | Sound-off friendly |
| LinkedIn | 16:9 | 600s | Standard safe zones | Captions recommended |

## Output

Return:
- `edl`: The complete edit decision list
- `total_duration`: Final video length
- `generated_assets`: List of assets that need to be created
- `render_config`: Remotion composition settings (resolution, fps, codec)
- `preview_storyboard`: Key frames from each phase for user review
