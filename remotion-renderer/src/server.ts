import "dotenv/config";
import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getCompositions } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

interface RenderJob {
  id: string;
  status: "pending" | "rendering" | "completed" | "failed";
  progress: number;
  outputUrl?: string;
  error?: string;
  startedAt: Date;
}

const jobs = new Map<string, RenderJob>();
let bundleLocation: string | null = null;

// Pre-bundle the Remotion project on startup
async function initBundle() {
  try {
    // Try .tsx source first (tsx watch / dev), then .js (compiled / dist)
    let entryPoint = path.resolve(__dirname, "compositions/index.tsx");
    if (!fs.existsSync(entryPoint)) {
      entryPoint = path.resolve(__dirname, "compositions/index.js");
    }
    if (!fs.existsSync(entryPoint)) {
      console.log("No compositions entry point found, skipping pre-bundle");
      return;
    }
    bundleLocation = await bundle({ entryPoint });
    console.log("Remotion bundle ready");
  } catch (error) {
    console.error("Failed to create Remotion bundle:", error);
  }
}

// List available compositions
app.get("/compositions", async (_req, res) => {
  try {
    if (!bundleLocation) {
      return res.json([]);
    }
    const compositions = await getCompositions(bundleLocation);
    res.json(
      compositions.map((c) => ({
        id: c.id,
        name: c.id,
        durationInFrames: c.durationInFrames,
        fps: c.fps,
        width: c.width,
        height: c.height,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start a render job
app.post("/render", async (req, res) => {
  const { compositionId, props } = req.body;

  if (!compositionId) {
    return res.status(400).json({ error: "compositionId is required" });
  }

  if (!bundleLocation) {
    return res.status(503).json({ error: "Remotion bundle not ready" });
  }

  const jobId = uuidv4();
  const job: RenderJob = {
    id: jobId,
    status: "pending",
    progress: 0,
    startedAt: new Date(),
  };
  jobs.set(jobId, job);

  // Start render in background
  renderInBackground(jobId, compositionId, props || {});

  res.json({ jobId });
});

// Get render status
app.get("/render/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({
    status: job.status,
    progress: job.progress,
    outputUrl: job.outputUrl,
    error: job.error,
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", bundleReady: !!bundleLocation });
});

async function renderInBackground(
  jobId: string,
  compositionId: string,
  inputProps: Record<string, unknown>,
) {
  const job = jobs.get(jobId)!;
  job.status = "rendering";

  try {
    const composition = await selectComposition({
      serveUrl: bundleLocation!,
      id: compositionId,
      inputProps,
    });

    const outputPath = path.join("/tmp", `${jobId}.mp4`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation!,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        job.progress = Math.round(progress * 100);
      },
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
    });

    // Upload to Supabase Storage
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const fileBuffer = fs.readFileSync(outputPath);
      const storagePath = `remotion/${jobId}.mp4`;

      const { error } = await supabase.storage
        .from("videos")
        .upload(storagePath, fileBuffer, {
          contentType: "video/mp4",
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("videos").getPublicUrl(storagePath);

      job.outputUrl = publicUrl;
    } else {
      job.outputUrl = outputPath;
    }

    job.status = "completed";
    job.progress = 100;

    // Clean up local file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  } catch (error) {
    job.status = "failed";
    job.error = String(error);
    console.error(`Render job ${jobId} failed:`, error);
  }
}

const PORT = parseInt(process.env.REMOTION_PORT || "3010", 10);

initBundle().then(() => {
  app.listen(PORT, () => {
    console.log(`Remotion renderer listening on port ${PORT}`);
  });
});
