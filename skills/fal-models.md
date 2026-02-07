# fal.ai Models Reference

Guide for selecting and using fal.ai models at runtime. Covers every available model, when to use each one, parameter best practices, and production workflow patterns.

## Model Catalog

### Image Generation — Nano Banana Pro (Primary)

**Model slug:** `fal-ai/nano-banana-pro`
**What it does:** Generates photorealistic images from text prompts using Google DeepMind Gemini 3 Pro Image. High-quality text rendering, diverse aspect ratios, up to 4K resolution.

**When to use:**
- Hero images for social posts
- Thumbnails and cover art
- Product mockups and lifestyle shots
- Background art for video compositions
- Any prompt-to-image task where quality matters

**When NOT to use:**
- If you need to modify an existing image (use Image Edit instead)
- If you already have a low-res image that just needs sharpening (use Topaz Upscaler)
- If cost is critical and quality can be lower (use Flux 2 Flex fallback)

**Quality/speed:** High quality, moderate speed. 1K resolution is fast; 4K takes longer.
**Cost:** $0.15/image (1K), $0.30/image (4K)

**Key parameters:**

| Parameter | Default | Recommended | Notes |
|---|---|---|---|
| `prompt` | — | Be specific and descriptive | 3-50,000 chars. More detail = better results |
| `aspect_ratio` | `"1:1"` | Match target platform | Options: 1:1, 16:9, 9:16, 4:3, 3:2, 21:9, and inverses |
| `resolution` | `"1K"` | `"1K"` for social, `"2K"` for video frames | 4K only when needed — doubles cost |
| `num_images` | 1 | 1 | Generate 2-4 only if you need variations to pick from |
| `output_format` | `"png"` | `"png"` for transparency, `"jpeg"` for photos | WebP also available |
| `safety_tolerance` | 4 | 4 | 1=strictest, 6=most permissive |
| `seed` | random | Set for reproducibility | Use when regenerating variants of a good result |

---

### Image Generation — Flux 2 Flex (Fallback)

**Model slug:** `fal-ai/flux-2-flex`
**What it does:** Generates images from text prompts. Our previous primary model, now kept as fallback.

**When to use:**
- As a fallback if Nano Banana Pro is unavailable or rate-limited
- Quick draft images where photorealism is not critical
- When you need a stylistically different output for comparison

**When NOT to use:**
- For production hero images (use Nano Banana Pro)
- For anything requiring text rendering in the image

**Quality/speed:** Good quality, fast. Less photorealistic than Nano Banana Pro.
**Cost:** Lower than Nano Banana Pro.

**Key parameters:**

| Parameter | Default | Notes |
|---|---|---|
| `prompt` | — | Required |
| `image_size` | `{ width: 1080, height: 1080 }` | Set to match platform needs |

---

### Image Editing — Nano Banana Pro Edit

**Model slug:** `fal-ai/gemini-3-pro-image-preview/edit`
**What it does:** Edits existing images using natural language instructions. No masks needed — the model understands context. Can handle background replacement, object removal, lighting fixes, style transfer, and compositing.

**When to use:**
- Removing unwanted objects or backgrounds from photos
- Replacing backgrounds (e.g., product on white → product on beach)
- Fixing lighting, color, or quality issues in existing images
- Combining elements from two reference images
- Adapting images for different platforms (change aspect, extend background)

**When NOT to use:**
- Generating images from scratch (use Nano Banana Pro text-to-image)
- Pure upscaling without content changes (use Topaz Upscaler)
- If no reference image exists yet

**Quality/speed:** High quality. Natural language instructions make it very flexible.
**Cost:** $0.15/edit (1K), $0.30/edit (4K)

**Key parameters:**

| Parameter | Default | Notes |
|---|---|---|
| `prompt` | — | Natural language edit instruction. Be specific about what to change |
| `image_urls` | — | 1-2 reference images. First is the main image, second is optional reference |
| `aspect_ratio` | `"auto"` | Set if you need a specific crop |
| `resolution` | `"1K"` | Use `"2K"` for video frame backgrounds |
| `num_images` | 1 | Generate 2-4 for A/B comparisons |

**Prompt tips for editing:**
- Be explicit: "Remove the person on the left side" not "Clean up the image"
- For background replacement: "Remove the background and replace with [detailed description]"
- For style transfer: "Make this photo look like a [style] painting while keeping the subject intact"
- For cleanup: "Remove noise and artifacts, enhance colors and sharpness"

---

### Image Upscaling — Topaz Upscaler

**Model slug:** `fal-ai/topaz/upscale/image`
**What it does:** Professional-grade image upscaling with face enhancement. Multiple model variants tuned for different content types.

**When to use:**
- Upscaling AI-generated images for higher resolution output
- Cleaning up compressed or low-resolution source images
- Enhancing faces in portrait content
- Preparing images for large-format display or print
- Post-processing step after image generation

**When NOT to use:**
- If the image needs content changes (use Image Edit)
- If you need to generate an image from scratch (use Nano Banana Pro)
- If the source image is already high resolution

**Quality/speed:** Excellent quality. Multiple model variants for different use cases.
**Cost:** $0.08/image (up to 24MP), $0.16/image (up to 48MP)

**Key parameters:**

| Parameter | Default | Recommended | Notes |
|---|---|---|---|
| `image_url` | — | — | Required. URL of image to upscale |
| `model` | `"Standard V2"` | Varies by content | See model selection table below |
| `upscale_factor` | 2 | 2 | Range 1-4. 2x is usually sufficient |
| `output_format` | `"jpeg"` | `"png"` if transparency needed | |
| `face_enhancement` | true | true for portraits, false for landscapes | |
| `face_enhancement_strength` | 0.8 | 0.8 | 0-1, higher = more aggressive enhancement |

**Model variant selection:**

| Variant | Best For |
|---|---|
| `Standard V2` | General purpose — default choice |
| `High Fidelity V2` | Photos where detail preservation is critical |
| `Low Resolution V2` | Very low-res source images (thumbnails, icons) |
| `Recovery` | Heavily compressed JPEGs, screenshots |
| `Recovery V2` | Even more damaged/compressed sources |
| `CGI` | AI-generated images, renders, digital art |
| `Text Refine` | Images containing text, UI screenshots, memes |
| `Redefine` | Creative upscaling with more AI interpretation |

---

### Video Generation — Kling v3 Text-to-Video

**Model slug (Standard):** `fal-ai/kling-video/v3/standard/text-to-video`
**Model slug (Pro):** `fal-ai/kling-video/v3/pro/text-to-video`
**What it does:** Generates video clips from text descriptions. Supports 3-15 second clips, native audio synthesis, multi-shot storyboarding (up to 6 shots), and camera control.

**When to use:**
- B-roll clips for video edits (cityscapes, nature, abstract motion)
- Establishing shots and scene-setting footage
- Animated backgrounds for text overlays
- Short promotional clips
- Concept visualization and mood boards
- Any situation where filming is not possible

**When NOT to use:**
- If you have a specific still image to animate (use Image-to-Video instead)
- If you need precise, frame-accurate control (AI video has inherent variation)
- For long-form content (max 15 seconds per clip)

**Quality/speed:**
- Standard: Good quality, faster, cheaper. Use for most content.
- Pro: Highest fidelity, slower, more expensive. Use for hero shots and cinematic output only.

**Cost:**

| Duration | Standard (no audio) | Standard (audio) | Pro (no audio) | Pro (audio) |
|---|---|---|---|---|
| 5s | $0.84 | $1.26 | $1.12 | $1.68 |
| 10s | $1.68 | $2.52 | $2.24 | $3.36 |
| 15s | $2.52 | $3.78 | $3.36 | $5.04 |

**Key parameters:**

| Parameter | Default | Recommended | Notes |
|---|---|---|---|
| `prompt` | — | Describe scene, camera, lighting, mood | Be cinematic and specific |
| `duration` | 5 | 5-10 for most use cases | Range: 3-15 seconds |
| `aspect_ratio` | `"16:9"` | Match platform | `"9:16"` for Reels/Shorts/TikTok |
| `generate_audio` | false | true for standalone clips | Adds ~50% to cost |
| `negative_prompt` | `"blur, distort, and low quality"` | Add `"jitter"` for smoother motion | |
| `cfg_scale` | 0.5 | 0.5 | 0-1. Higher = stricter prompt adherence |
| `multi_prompt` | — | Use for multi-scene clips | Array of up to 6 shot descriptions |

**Multi-shot example:**
```
multi_prompt: [
  { prompt: "Wide establishing shot of a mountain at sunrise", duration: 3 },
  { prompt: "Close-up of wildflowers swaying in the wind", duration: 4 },
  { prompt: "Person standing at summit, looking at view", duration: 3 }
]
```

---

### Video Generation — Kling v3 Image-to-Video

**Model slug (Standard):** `fal-ai/kling-video/v3/standard/image-to-video`
**Model slug (Pro):** `fal-ai/kling-video/v3/pro/image-to-video`
**What it does:** Animates a still image into a video clip. Supports start frame, optional end frame (for transitions), motion description, native audio, and character/object insertion.

**When to use:**
- Animating AI-generated hero images into video intros
- Creating Ken Burns / parallax effects from photos
- Building transitions between two key frames (start + end image)
- Bringing product shots to life
- Converting static social posts into short video clips

**When NOT to use:**
- If you have no reference image (use Text-to-Video instead)
- If the image needs editing first (edit the image, then animate)

**Quality/speed:** Same tiers as Text-to-Video. Standard for most content, Pro for hero shots.
**Cost:** Same pricing table as Text-to-Video above.

**Key parameters:**

| Parameter | Default | Recommended | Notes |
|---|---|---|---|
| `start_image_url` | — | — | Required. The still image to animate |
| `prompt` | — | Describe the motion and camera movement | Do NOT re-describe the image content |
| `duration` | 12 | 5-10 | Range: 3-15 seconds |
| `end_image_url` | — | Use for transitions | Optional end frame |
| `aspect_ratio` | `"16:9"` | Match the input image ratio | |
| `generate_audio` | false | true if standalone | |
| `cfg_scale` | 0.5 | 0.5 | |
| `elements` | — | For inserting custom characters | Array of `{ image_url, description }` |

**Prompt tips for Image-to-Video:**
- Focus on MOTION, not appearance: "Camera slowly pulls back, clouds drift across sky"
- Describe camera movement: "Slow orbit", "Push in", "Dolly left", "Static with subtle parallax"
- Avoid contradicting what is in the image

---

### Text-to-Speech — MiniMax Speech-2.8 HD

**Model slug:** `fal-ai/minimax/speech-2.8-hd`
**What it does:** Generates natural-sounding speech audio from text. Multiple voice presets, configurable speed and pitch.

**When to use:**
- Voiceover narration for video content
- Audio tracks for Remotion compositions
- Any TTS need in the content pipeline

**When NOT to use:**
- If you have recorded audio already
- If the content is music or sound effects (this is speech only)

**Quality/speed:** High-quality natural speech. Fast generation.
**Cost:** Low per generation.

**Key parameters:**

| Parameter | Default | Notes |
|---|---|---|
| `prompt` | — | The text to speak |
| `voice_setting.voice_id` | `"Casual_Guy"` | Configurable via `FAL_TTS_VOICE_ID` env var |
| `voice_setting.speed` | 1 | Range varies. 1 = normal speed |
| `voice_setting.vol` | 1 | Volume level |
| `voice_setting.pitch` | 0 | Pitch adjustment |
| `output_format` | `"url"` | Returns a downloadable URL |

---

### Audio Transcription — Whisper

**Model slug:** `fal-ai/whisper`
**What it does:** Transcribes audio to text with word-level timestamps. Used for generating captions and subtitle overlays.

**When to use:**
- Generating word-level captions for video content
- Syncing text overlays to voiceover timing
- Extracting transcript from audio/video for repurposing

**When NOT to use:**
- If you need to generate speech (use MiniMax TTS)
- If you already have a timed transcript

**Quality/speed:** Industry-standard accuracy. Fast.
**Cost:** Very low per transcription.

**Key parameters:**

| Parameter | Default | Notes |
|---|---|---|
| `audio_url` | — | URL or base64 data URI of audio |
| `task` | `"transcribe"` | Use `"transcribe"` (not `"translate"` unless language conversion needed) |
| `chunk_level` | `"word"` | Always use `"word"` for caption sync |

---

## Model Selection Decision Tree

Use this to pick the right model for any asset generation need:

```
Need an asset? Start here:
|
+-- Need VIDEO?
|   |
|   +-- Have a still image to animate?
|   |   --> Kling v3 Image-to-Video (Standard)
|   |       Use Pro only for cinematic hero shots
|   |
|   +-- No reference image?
|       --> Kling v3 Text-to-Video (Standard)
|           Use Pro only for cinematic hero shots
|
+-- Need an IMAGE?
|   |
|   +-- Generating from scratch?
|   |   |
|   |   +-- Need photorealism or text in image?
|   |   |   --> Nano Banana Pro
|   |   |
|   |   +-- Quick draft / stylized?
|   |       --> Flux 2 Flex (fallback)
|   |
|   +-- Modifying an existing image?
|   |   |
|   |   +-- Content changes (remove/replace/edit)?
|   |   |   --> Nano Banana Pro Edit
|   |   |
|   |   +-- Just upscaling / sharpening?
|   |       --> Topaz Upscaler
|   |           Model: "Standard V2" (default)
|   |           Model: "CGI" (for AI-generated images)
|   |           Model: "Text Refine" (for images with text)
|   |           Model: "Recovery" (for compressed sources)
|   |
|   +-- Need to upscale + enhance after generation?
|       --> Generate with Nano Banana Pro at 1K
|           then upscale with Topaz (model: "CGI")
|
+-- Need AUDIO?
|   |
|   +-- Need voiceover / narration?
|   |   --> MiniMax Speech-2.8 HD
|   |
|   +-- Need captions / transcription?
|       --> Whisper
|
+-- Need video WITH native audio?
    --> Kling v3 with generate_audio: true
        (adds ~50% to video cost)
```

---

## Parameter Best Practices

### Image Generation

**Prompt engineering:**
- Lead with the subject, then style, then details: "A professional headshot of a woman in a modern office, soft natural lighting, shallow depth of field, 85mm lens look"
- Include lighting and mood: "golden hour", "dramatic shadows", "soft diffused light", "neon-lit"
- Include camera/lens language for photorealism: "shot on 35mm", "wide angle", "macro close-up"
- Avoid vague prompts like "a nice picture" — be specific about every visual element

**Aspect ratios by platform:**

| Platform | Content Type | Aspect Ratio |
|---|---|---|
| Twitter/X | Feed image | `"16:9"` or `"1:1"` |
| LinkedIn | Feed image | `"16:9"` or `"1:1"` |
| Instagram | Feed post | `"1:1"` or `"4:5"` |
| Instagram | Story / Reel cover | `"9:16"` |
| TikTok | Thumbnail | `"9:16"` |
| YouTube | Thumbnail | `"16:9"` |
| General | Square social post | `"1:1"` |

**Resolution strategy:**
- Social media posts: `"1K"` is sufficient ($0.15)
- Video frame backgrounds: `"2K"` for clarity when animated ($0.30)
- Print or large display: `"4K"` only when needed ($0.30)
- Budget strategy: Generate at 1K, upscale with Topaz if more resolution needed (total: $0.23 vs $0.30 for native 4K, and Topaz adds enhancement)

### Video Generation

**Duration guidelines:**
- Hook clips (scroll-stoppers): 3-5 seconds
- B-roll inserts: 5-8 seconds
- Standalone short clips: 10-15 seconds
- Keep total cost in mind: every second costs money

**Camera and motion prompting:**
- Describe camera movement explicitly: "slow dolly forward", "aerial tracking shot", "static tripod shot with subtle zoom"
- Describe subject motion: "clouds rolling", "waves crashing", "person walking left to right"
- Avoid conflicting motion (moving camera + fast subject = artifacts)

**Negative prompts for video:**
- Always include: `"blur, distort, low quality, jitter"`
- For people: add `"deformed hands, extra fingers, unnatural movement"`
- For text overlays in video: add `"illegible text, garbled letters"`

**Standard vs Pro decision:**

| Scenario | Tier |
|---|---|
| B-roll, background clips | Standard |
| Social media short clips | Standard |
| Hero intro/outro for a series | Pro |
| Client-facing commercial content | Pro |
| Quick draft for approval | Standard |
| Final render after client approval | Pro |

### Image Editing

**Edit prompt strategies:**
- Be surgical: "Remove the coffee cup from the table" not "Clean up the scene"
- For background replacement: "Replace the background with [specific description], maintain the subject's lighting and shadows"
- For style changes: "Convert to [style] while preserving the composition and subject details"
- For compositing: Provide two images and say "Place the subject from image 1 into the scene from image 2, match the lighting"

### Image Upscaling

**Model selection by source type:**

| Source | Topaz Model | Reason |
|---|---|---|
| AI-generated image | `"CGI"` | Optimized for rendered/synthetic content |
| Photograph | `"Standard V2"` | Best all-around for real photos |
| Screenshot or text-heavy | `"Text Refine"` | Preserves text clarity |
| Heavily compressed JPEG | `"Recovery"` | Repairs compression artifacts |
| Very low-res (< 256px) | `"Low Resolution V2"` | Specializes in extreme upscaling |
| Portrait / headshot | `"High Fidelity V2"` + face_enhancement | Best facial detail preservation |

**Upscale factor guidance:**
- 2x is almost always enough. Going to 4x rarely improves perceived quality and increases processing time.
- For AI-generated images: generate at 1K, upscale 2x with Topaz CGI model for best results.

---

## Quality Tips

### Getting the best results from each model

**Nano Banana Pro (image generation):**
- Use `seed` when you find a good result and want slight variations — regenerate with small prompt tweaks and same seed
- Generate 2-4 images (`num_images: 2`) for important hero shots, then pick the best
- Enable `enable_web_search: true` when generating images of real places, products, or people for better accuracy

**Kling v3 (video generation):**
- `cfg_scale: 0.5` is the sweet spot — going higher makes videos look rigid, going lower makes them ignore your prompt
- For smooth motion: keep camera movements simple (one direction at a time)
- Multi-shot mode is powerful but each shot transition can be jarring — use it for distinct scene changes, not subtle camera moves within one scene
- Generate audio only when the clip will be used standalone. For clips going into a Remotion composition with voiceover, skip audio to save cost

**Topaz Upscaler:**
- Set `face_enhancement: false` for landscape and product images to avoid hallucinated face detail
- The `CGI` model is the best match for upscaling AI-generated content (Nano Banana Pro or Flux outputs)
- For images that will be used as video backgrounds, upscale to 2x before feeding to Image-to-Video for sharper results

**Image Edit (Nano Banana Pro Edit):**
- Include the second reference image when doing compositing — it dramatically improves results
- For object removal, be specific about location: "Remove the sign in the upper-right corner"
- Chain edits rather than doing everything at once: remove background first, then color-correct, then add new background

### Common pitfalls

| Pitfall | Fix |
|---|---|
| Video looks jittery or glitchy | Add "jitter, flicker" to negative prompt. Reduce motion complexity |
| Image has wrong aspect ratio for platform | Set `aspect_ratio` explicitly — do not rely on defaults |
| Generated text in image is garbled | Use Nano Banana Pro (best at text). Keep text short. Use overlays instead for longer text |
| Upscaled image looks over-sharpened | Reduce `upscale_factor` to 2x. Try `"Standard V2"` model |
| Video too expensive for draft content | Use Standard tier, 5s duration, no audio for drafts. Pro + audio for finals only |
| Image edit changes too much | Be more specific in the edit prompt. Focus edits on one change at a time |
| Image-to-video ignores the source image | Keep `cfg_scale` at 0.5. Describe motion only, do not re-describe image content |

### When to use enhancement as a post-processing step

Apply Topaz upscaling after generation when:
- The final output needs to be higher resolution than the generation model supports efficiently
- You generated at 1K for cost savings but need 2K+ output
- The generated image will be printed or displayed at large size
- The image contains faces that need enhancement

Skip post-processing when:
- The image is for social media at standard resolution (1K is fine)
- The image is a draft for approval (save cost, upscale the final only)
- The content is video (Kling already generates at good resolution)

---

## Production Workflow Patterns

### Commercial / Product Shot Workflow

Goal: Create a polished product visual for social media promotion.

1. **Generate hero image** — Nano Banana Pro
   - Prompt: detailed product description + setting + lighting
   - Resolution: 1K, aspect ratio matches target platform
2. **Edit if needed** — Nano Banana Pro Edit
   - Swap background, remove distractions, adjust lighting
3. **Upscale for quality** — Topaz Upscaler
   - Model: `"CGI"` (for AI-generated source)
   - Factor: 2x
4. **Add text overlay** — Remotion composition
   - Product name, price, CTA
5. **Optional: animate** — Kling v3 Image-to-Video
   - Subtle motion: "Camera slowly pushes in, soft light shifts"
   - Duration: 5s for a scroll-stopping clip

**Estimated cost per product shot:**
- Static image: ~$0.23 (generate $0.15 + upscale $0.08)
- Animated clip: ~$1.07 (generate $0.15 + upscale $0.08 + 5s video $0.84)

### Short Film / Narrative Workflow

Goal: Create a multi-scene short video (30-90s) for social platforms.

1. **Plan scenes** — Define 4-8 shots with descriptions, durations, and purposes
2. **Generate hero images** — Nano Banana Pro
   - Create key frame images for each major scene
   - Use `seed` to maintain visual consistency (similar lighting, color palette)
   - Resolution: 2K for video frames
3. **Generate video clips** — Kling v3
   - Image-to-Video for scenes with hero images
   - Text-to-Video for b-roll and establishing shots
   - Standard tier for most clips, Pro for the hero/climax shot
   - Multi-shot mode for complex sequences
4. **Generate voiceover** — MiniMax Speech-2.8 HD
   - Full narration script
5. **Transcribe for captions** — Whisper
   - Word-level timestamps for overlay sync
6. **Assemble in Remotion** — Build EDL per `create-edit.md`
   - Layer video clips, voiceover, captions, transitions
7. **Final enhancement** — Topaz upscale any frames that need it

**Estimated cost for 60s short film (8 clips):**
- 8 hero images at 1K: ~$1.20
- 6 video clips at 5s Standard: ~$5.04
- 2 video clips at 10s Standard: ~$3.36
- 1 voiceover: ~$0.05
- 1 transcription: ~$0.02
- Total: ~$9.67 (without Pro tier or audio on video)

### Series / Episodic Workflow

Goal: Maintain visual and tonal consistency across multiple episodes.

1. **Establish style bible** — First episode
   - Generate 3-4 key images with specific prompt formula
   - Record the `seed` values and exact prompts that produced the best results
   - Define the color palette, lighting style, camera angles in the episode notes
2. **Lock character/setting references**
   - Save hero images as reference for Image-to-Video and Image Edit
   - Use the same `seed` + similar prompt structure for new episodes
   - Use `elements` parameter in Kling v3 Image-to-Video for recurring characters
3. **Template the EDL structure** — Consistent pacing
   - Same intro/outro pattern each episode
   - Consistent lower-third style and caption positioning
   - Same voiceover voice and speed settings
4. **Per-episode generation**
   - Re-use the prompt formula with episode-specific content
   - Match aspect ratios and resolutions to the series standard
   - Generate new b-roll as needed but maintain the established look
5. **Quality check**
   - Compare new episode frames against episode 1 for visual drift
   - Re-generate any frames that break the style consistency

**Cost control for series:**
- Use Standard tier Kling for all episodes except premieres/finales
- Generate at 1K and upscale only the final selects
- Re-use b-roll clips across episodes when appropriate
- Skip audio on video clips — use separate TTS voiceover for better control

---

## Cost Control Rules

Follow these rules to manage fal.ai spend:

1. **Draft first, polish later** — Generate at lowest settings (1K, Standard tier, no audio, 5s) for approval. Only use premium settings for final renders.
2. **Avoid unnecessary Pro tier** — Standard Kling v3 is good enough for 90% of social content. Reserve Pro for client work and hero shots.
3. **Skip audio on video when compositing** — If the clip goes into a Remotion composition with voiceover, do not pay for native audio.
4. **Generate, then upscale** — 1K image ($0.15) + Topaz upscale ($0.08) = $0.23 is cheaper than native 4K ($0.30) and the result is often better.
5. **Limit video duration** — 5s clips are half the cost of 10s clips. Use the shortest duration that serves the purpose.
6. **Batch similar generations** — When generating multiple images for a series, use the same prompt template with only the specific content swapped to minimize do-overs.

**Budget benchmarks:**

| Content Type | Typical Cost |
|---|---|
| Single static post with image | $0.15 - $0.23 |
| Static post with edited/composited image | $0.30 - $0.45 |
| Short video clip (5s) for social | $0.84 - $1.26 |
| Full 30s video with voiceover | $4 - $8 |
| Full 60s short film | $8 - $15 |
| Episodic content (per episode, 60s) | $6 - $12 |
