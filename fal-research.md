# fal.ai Model Research for Video Editor Upgrade

> Research date: 2026-02-07
> Current `@fal-ai/client` version: `^1.9.0` (no upgrade needed)

---

## 1. Current State

### Models in use today (`fal-service.ts`)

| Capability | Model Slug | Notes |
|---|---|---|
| TTS | `fal-ai/minimax/speech-2.8-hd` | Voice generation with configurable voice_id, speed, vol, pitch |
| Transcription | `fal-ai/whisper` | Word-level timestamps for captions |
| Image Generation | `fal-ai/flux-2-flex` | 1080x1080 images from prompts |

### Pattern used

```typescript
import { fal } from "@fal-ai/client";

// Auth
fal.config({ credentials: process.env.FAL_KEY });

// Every call uses fal.subscribe()
const result = await fal.subscribe("model-slug", {
  input: { /* params */ },
});
const data = result.data as SomeType;
```

All models return URLs that we `fetch()` and convert to `Buffer`.

---

## 2. New Models — Recommended

### 2A. Kling 3.0 — AI Video Generation (NEW CAPABILITY)

Kling 3.0 was released 2026-02-04. It is the latest and most capable version on fal.ai. Supports multi-shot storytelling, native audio, start/end frame conditioning, and clips from 3-15 seconds.

#### Model Slugs

| Mode | Tier | Slug | Price/sec (no audio) | Price/sec (audio) | Price/sec (voice ctrl) |
|---|---|---|---|---|---|
| Text-to-Video | Standard | `fal-ai/kling-video/v3/standard/text-to-video` | $0.168 | $0.252 | $0.308 |
| Text-to-Video | Pro | `fal-ai/kling-video/v3/pro/text-to-video` | $0.224 | $0.336 | $0.392 |
| Image-to-Video | Standard | `fal-ai/kling-video/v3/standard/image-to-video` | $0.168 | $0.252 | $0.308 |
| Image-to-Video | Pro | `fal-ai/kling-video/v3/pro/image-to-video` | $0.224 | $0.336 | $0.392 |

**Recommendation**: Use **Standard** tier for most use cases. Pro only needed for highest-fidelity cinematic output.

#### Input Parameters — Text-to-Video

```typescript
interface KlingTextToVideoInput {
  prompt: string;                    // Required — video description
  duration?: number;                 // Default: 5, range: 3-15 seconds
  aspect_ratio?: string;             // Default: "16:9", options: "16:9", "9:16", "1:1"
  generate_audio?: boolean;          // Default: false — native audio synthesis
  voice_ids?: string[];              // Optional — for voice control with audio
  shot_type?: string;                // Default: "customize" — camera movement
  negative_prompt?: string;          // Default: "blur, distort, and low quality"
  cfg_scale?: number;                // Default: 0.5 — prompt adherence (0-1)
  multi_prompt?: Array<{             // Optional — multi-shot storyboarding (up to 6 shots)
    prompt: string;
    duration?: number;
  }>;
}
```

#### Input Parameters — Image-to-Video

```typescript
interface KlingImageToVideoInput {
  start_image_url: string;           // Required — initial frame (jpg/png/webp/gif/avif)
  prompt: string;                    // Required — motion/camera description
  duration?: number;                 // Default: 12 seconds
  end_image_url?: string;            // Optional — final frame for transitions
  aspect_ratio?: string;             // Default: "16:9"
  generate_audio?: boolean;          // Default: false
  voice_ids?: string[];              // Optional
  negative_prompt?: string;          // Default: "blur, distort, and low quality"
  cfg_scale?: number;                // Default: 0.5
  multi_prompt?: Array<{             // Optional — multi-shot
    prompt: string;
    duration?: number;
  }>;
  elements?: Array<{                 // Optional — custom character/object insertion
    image_url: string;
    description?: string;
  }>;
}
```

#### Output Format

```typescript
interface KlingVideoOutput {
  video: {
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
  };
}
```

#### Code Example

```typescript
// Text-to-Video
const result = await fal.subscribe("fal-ai/kling-video/v3/standard/text-to-video", {
  input: {
    prompt: "A sweeping aerial shot over a neon-lit cyberpunk city at night, flying cars weaving between skyscrapers",
    duration: 10,
    aspect_ratio: "16:9",
    generate_audio: true,
    negative_prompt: "blur, distort, low quality",
    cfg_scale: 0.5,
  },
});
const data = result.data as { video: { url: string } };
const videoUrl = data.video.url;

// Image-to-Video
const result2 = await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video", {
  input: {
    start_image_url: "https://example.com/frame.jpg",
    prompt: "Camera slowly orbits around the subject, soft light shifts across the scene",
    duration: 10,
    generate_audio: false,
  },
});
const data2 = result2.data as { video: { url: string } };
```

#### Quality Tips
- `cfg_scale` near 0.5 balances creativity and prompt adherence
- Use `negative_prompt: "blur, distort, low quality, jitter"` for cleanest results
- For commercials: Pro tier + 10-15 second duration + audio on
- For shorts: Standard tier + 5-10 seconds is sufficient
- Multi-shot with up to 6 prompts enables scene transitions in a single generation

---

### 2B. Nano Banana Pro (Gemini 3 Pro Image) — Upgraded Image Generation

This is what the user called "Gemini 3." The fal.ai name is **Nano Banana Pro**, which is Google DeepMind's Gemini 3 Pro Image model. It produces higher-quality, more photorealistic images than Flux 2 Flex.

#### Model Slugs

| Mode | Slug | Price |
|---|---|---|
| Text-to-Image | `fal-ai/nano-banana-pro` | $0.15/image (1K), $0.30/image (4K) |
| Image Edit | `fal-ai/gemini-3-pro-image-preview/edit` | $0.15/edit (1K), $0.30/edit (4K) |

**Recommendation**: Replace `fal-ai/flux-2-flex` with `fal-ai/nano-banana-pro` for text-to-image. Keep Flux 2 Flex as a fallback.

#### Input Parameters — Text-to-Image

```typescript
interface NanaBananaProInput {
  prompt: string;                    // Required (3-50000 chars)
  num_images?: number;               // Default: 1, range: 1-4
  aspect_ratio?: string;             // Default: "1:1", options: auto/21:9/16:9/3:2/4:3/5:4/1:1/4:5/3:4/2:3/9:16
  resolution?: "1K" | "2K" | "4K";   // Default: "1K"
  output_format?: "jpeg" | "png" | "webp"; // Default: "png"
  safety_tolerance?: number;         // Default: 4, range: 1-6 (1=strictest)
  seed?: number;                     // Optional — for reproducibility
  enable_web_search?: boolean;       // Default: false — uses web data for generation
  sync_mode?: boolean;               // Default: false — returns data URI if true
}
```

#### Input Parameters — Image Edit

```typescript
interface NanaBananaEditInput {
  prompt: string;                    // Required — natural language edit instruction
  image_urls: string[];              // Required — up to 2 reference images
  num_images?: number;               // Default: 1, range: 1-4
  aspect_ratio?: string;             // Default: "auto"
  resolution?: "1K" | "2K" | "4K";  // Default: "1K"
  output_format?: "jpeg" | "png" | "webp"; // Default: "png"
  safety_tolerance?: number;         // Default: 4
  seed?: number;
  enable_web_search?: boolean;       // Default: false
}
```

#### Output Format (both modes)

```typescript
interface NanaBananaOutput {
  images: Array<{
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
    width: number;
    height: number;
  }>;
  description?: string;
}
```

#### Code Example

```typescript
// Text-to-Image (replaces Flux 2 Flex)
const result = await fal.subscribe("fal-ai/nano-banana-pro", {
  input: {
    prompt: "A cinematic still of a woman walking through a neon-lit Tokyo alley at night, rain reflecting city lights",
    aspect_ratio: "16:9",
    resolution: "1K",
    output_format: "png",
    safety_tolerance: 4,
  },
});
const data = result.data as { images: Array<{ url: string }> };
const imageUrl = data.images[0].url;

// Image Edit (new capability)
const editResult = await fal.subscribe("fal-ai/gemini-3-pro-image-preview/edit", {
  input: {
    prompt: "Remove the background and replace it with a sunset beach scene",
    image_urls: ["https://example.com/photo.jpg"],
    resolution: "1K",
    output_format: "png",
  },
});
const editData = editResult.data as { images: Array<{ url: string }> };
```

#### Quality Tips
- `resolution: "2K"` is good balance of quality vs cost for video frames
- For social media thumbnails: `aspect_ratio: "1:1"`, `resolution: "1K"`
- For video backgrounds: `aspect_ratio: "16:9"`, `resolution: "2K"`
- The edit mode uses natural language — no masks needed. Great for cleanup, background replacement, object removal

---

### 2C. Image Cleanup / Enhancement — Multiple Options

The user asked for "Clean Image v3." This likely refers to an image upscaling/restoration/cleanup tool. There is no model literally named "clean-image-v3" on fal.ai. Here are the best candidates:

#### Option 1: Topaz Image Upscaler (RECOMMENDED for quality)

| Slug | Price |
|---|---|
| `fal-ai/topaz/upscale/image` | $0.08 per image (up to 24MP), $0.16 (up to 48MP) |

```typescript
interface TopazUpscaleInput {
  image_url: string;                              // Required
  model?: string;                                 // Default: "Standard V2"
    // Options: "Low Resolution V2", "Standard V2", "CGI", "High Fidelity V2",
    //          "Text Refine", "Recovery", "Redefine", "Recovery V2"
  upscale_factor?: number;                        // Default: 2, range: 1-4
  output_format?: "jpeg" | "png";                 // Default: "jpeg"
  subject_detection?: "All" | "Foreground" | "Background"; // Default: "All"
  face_enhancement?: boolean;                     // Default: true
  face_enhancement_strength?: number;             // Default: 0.8 (0-1)
  face_enhancement_creativity?: number;           // Default: 0.0 (0-1)
}

// Output
interface TopazUpscaleOutput {
  image: {
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
  };
}
```

```typescript
const result = await fal.subscribe("fal-ai/topaz/upscale/image", {
  input: {
    image_url: "https://example.com/low-res.jpg",
    model: "Standard V2",
    upscale_factor: 2,
    output_format: "png",
    face_enhancement: true,
  },
});
const data = result.data as { image: { url: string } };
```

Best for: Professional upscaling, face cleanup, production-ready outputs. Multiple model variants for different content types (CGI for rendered content, Recovery for heavily compressed images, Text Refine for text-heavy images).

#### Option 2: Clarity Upscaler (good all-around)

| Slug | Price |
|---|---|
| `fal-ai/clarity-upscaler` | $0.03 per megapixel |

```typescript
interface ClarityUpscaleInput {
  image_url: string;                    // Required
  prompt?: string;                      // Default: "masterpiece, best quality, highres"
  upscale_factor?: number;              // Default: 2, range: 1-4
  negative_prompt?: string;             // Default: "(worst quality, low quality, normal quality:2)"
  creativity?: number;                  // Default: 0.35 (0-1) — denoise strength
  resemblance?: number;                 // Default: 0.6 (0-1) — ControlNet strength
  guidance_scale?: number;              // Default: 4 (0-20)
  num_inference_steps?: number;         // Default: 18 (4-50)
  seed?: number;
  enable_safety_checker?: boolean;      // Default: true
}

// Output
interface ClarityOutput {
  image: { url: string; content_type: string; file_name: string; file_size: number; width: number; height: number };
  seed: number;
  timings: Record<string, number>;
}
```

Best for: General-purpose upscaling with creative control. The `creativity` and `resemblance` knobs let you tune how much the model enhances vs preserves.

#### Option 3: Nano Banana Pro Edit Mode (AI-powered cleanup)

Already documented above in section 2B. Use the edit endpoint with cleanup prompts like:
- "Clean up this image, remove noise and artifacts, enhance colors"
- "Remove the watermark and enhance the image quality"
- "Fix the lighting and make the image look professional"

Best for: Intelligent cleanup that understands context (remove specific objects, fix lighting, change backgrounds).

**Recommendation**: Use **Topaz** for pure upscaling/enhancement and **Nano Banana Pro Edit** for intelligent cleanup/editing. Together they cover all "clean image" use cases.

---

## 3. Summary — Migration Plan

### What replaces what

| Current | New | Reason |
|---|---|---|
| `fal-ai/flux-2-flex` (image gen) | `fal-ai/nano-banana-pro` | Higher quality, more photorealistic, text rendering, multiple aspect ratios |
| — (no video gen) | `fal-ai/kling-video/v3/standard/text-to-video` | NEW: AI video generation with native audio |
| — (no video gen) | `fal-ai/kling-video/v3/standard/image-to-video` | NEW: Animate still images into video |
| — (no image edit) | `fal-ai/gemini-3-pro-image-preview/edit` | NEW: AI-powered image editing with natural language |
| — (no upscaling) | `fal-ai/topaz/upscale/image` | NEW: Professional image upscaling/cleanup |

### What stays the same

| Model | Reason |
|---|---|
| `fal-ai/minimax/speech-2.8-hd` | Still best-in-class TTS on fal.ai |
| `fal-ai/whisper` | Still the standard for transcription |

### New methods to add to `FalService`

1. **`generateVideo(prompt, options)`** — Kling v3 text-to-video
2. **`imageToVideo(imageUrl, prompt, options)`** — Kling v3 image-to-video
3. **`generateImage(prompt, options)`** — Upgrade to Nano Banana Pro (replace Flux 2 Flex)
4. **`editImage(imageUrls, prompt, options)`** — Nano Banana Pro edit mode
5. **`upscaleImage(imageUrl, options)`** — Topaz upscaler

### Cost Estimates (per asset)

| Asset Type | Estimated Cost |
|---|---|
| Single image (1K) | $0.15 |
| Single image (4K) | $0.30 |
| Image edit | $0.15 |
| Image upscale (Topaz) | $0.08-0.16 |
| 5s video (no audio) | $0.84 |
| 5s video (with audio) | $1.26 |
| 10s video (no audio) | $1.68 |
| 10s video (with audio) | $2.52 |
| 15s video (with audio, Pro) | $5.04 |

---

## 4. API Pattern Reference

All models use the same `@fal-ai/client` pattern we already have:

```typescript
import { fal } from "@fal-ai/client";

// Setup (already done in constructor)
fal.config({ credentials: process.env.FAL_KEY });

// Subscribe pattern (async, waits for result)
const result = await fal.subscribe("model-slug", {
  input: { /* model-specific params */ },
  logs: true,                          // Optional: enable log streaming
  onQueueUpdate: (update) => {         // Optional: progress callback
    if (update.status === "IN_PROGRESS") {
      update.logs?.forEach(log => console.log(log.message));
    }
  },
});

// Access result
const data = result.data;              // Model-specific output
const requestId = result.requestId;    // For tracking/debugging
```

File uploads work with:
- Public URLs (preferred)
- Base64 data URIs (`data:image/png;base64,...`)
- fal.ai file upload API

No changes to the `@fal-ai/client` package version needed — `^1.9.0` supports all these models.
