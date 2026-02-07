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

Construct the EDL as a JSON object with three track arrays: `video`, `audio`, and `overlays`. Each item must use the **exact** field names and types shown below.

**DO NOT use any of these wrong field names:** `sequence_number`, `source`, `source_path`, `in_point`, `out_point`, `duration` (without `_ms`), `phase`, `setup`.

**All timestamps are in MILLISECONDS (ms).**

### EDL JSON Structure

```json
{
  "version": 1,
  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "type": "video_clip",
        "source_asset_id": "uuid-of-footage-asset",
        "start_ms": 0,
        "duration_ms": 3000,
        "in_point_ms": 15000,
        "out_point_ms": 18000,
        "properties": {
          "speed": 1,
          "transition_type": "crossfade",
          "transition_duration_ms": 500
        },
        "narrative_role": "hook",
        "reasoning": "Strong opening visual — grabs attention immediately"
      },
      {
        "id": "clip-2",
        "type": "video_clip",
        "source_asset_id": "uuid-of-footage-asset",
        "start_ms": 3000,
        "duration_ms": 8000,
        "in_point_ms": 42000,
        "out_point_ms": 50000,
        "properties": { "speed": 1 },
        "narrative_role": "buildup",
        "reasoning": "Core content delivery — demonstrates the key topic"
      },
      {
        "id": "clip-3",
        "type": "video_clip",
        "source_asset_id": "uuid-of-another-asset",
        "start_ms": 11000,
        "duration_ms": 5000,
        "in_point_ms": 0,
        "out_point_ms": 5000,
        "properties": { "speed": 1 },
        "narrative_role": "climax",
        "reasoning": "Peak moment — strongest visual payoff"
      }
    ],
    "audio": [
      {
        "id": "vo-1",
        "type": "audio",
        "start_ms": 0,
        "duration_ms": 16000,
        "properties": {
          "volume": 1,
          "text": "Write the full voiceover narration script here. This text will be converted to speech via TTS automatically."
        },
        "narrative_role": "buildup",
        "reasoning": "Narration ties the visual story together"
      }
    ],
    "overlays": [
      {
        "id": "title-1",
        "type": "text_overlay",
        "start_ms": 0,
        "duration_ms": 3000,
        "properties": {
          "text": "Title Text Here",
          "font_size": 64,
          "position": { "x": 0.5, "y": 0.2 }
        },
        "narrative_role": "hook",
        "reasoning": "Title card establishes the topic"
      }
    ]
  },
  "total_duration_ms": 16000,
  "output_format": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "codec": "h264"
  },
  "narrative_structure": [
    { "role": "hook", "start_ms": 0, "end_ms": 3000 },
    { "role": "buildup", "start_ms": 3000, "end_ms": 11000 },
    { "role": "climax", "start_ms": 11000, "end_ms": 16000 }
  ],
  "metadata": {}
}
```

### Critical Rules

- **`source_asset_id`** must be a UUID from the footage analysis — copy it exactly as provided
- **`type`** for video clips must be `"video_clip"` (not `"footage"`, `"source"`, or `"generated"`)
- **`narrative_role`** valid values: `"hook"`, `"buildup"`, `"climax"`, `"resolution"` (NOT `"setup"`)
- **Voiceover**: Add an item to `tracks.audio` with `type: "audio"`, NO `source_url`, NO `source_asset_id`, and `properties.text` containing the narration script. The system will generate TTS automatically.
- **`in_point_ms` / `out_point_ms`**: Where to start/end in the SOURCE clip (not timeline position). `start_ms` is the TIMELINE position.
- All durations and timestamps are in **milliseconds** — multiply seconds by 1000

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

Return the complete EDL JSON object directly (as shown in Step 4). Do NOT wrap it in another structure — the top-level object should have `version`, `tracks`, `total_duration_ms`, `output_format`, `narrative_structure`, and `metadata`.
