/**
 * Upload user-provided media (image + video) to Supabase and queue for posting.
 *
 * Usage:
 *   npx tsx scripts/add-media.ts \
 *     --video "/path/to/video.mp4" \
 *     --image "/path/to/image.jpeg" \
 *     --context "Description of the content" \
 *     --platform both
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    parsed[key] = args[i + 1];
  }
  return parsed;
}

async function uploadFile(bucket: string, localPath: string): Promise<string> {
  const filename = path.basename(localPath);
  const timestamp = Date.now();
  const storagePath = `user-uploads/${timestamp}-${filename}`;
  const fileBuffer = fs.readFileSync(localPath);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType: bucket === "videos" ? "video/mp4" : "image/jpeg",
      upsert: false,
    });

  if (error) throw new Error(`Failed to upload to ${bucket}/${storagePath}: ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function main() {
  const args = parseArgs();

  if (!args.video && !args.image) {
    console.error("At least --video or --image is required.");
    process.exit(1);
  }

  const platform = args.platform || "both";
  const context = args.context || "";

  let videoUrl: string | undefined;
  let imageUrl: string | undefined;

  // Upload video
  if (args.video) {
    if (!fs.existsSync(args.video)) {
      console.error(`Video file not found: ${args.video}`);
      process.exit(1);
    }
    console.log("Uploading video...");
    videoUrl = await uploadFile("videos", args.video);
    console.log(`  Video URL: ${videoUrl}`);
  }

  // Upload image
  if (args.image) {
    if (!fs.existsSync(args.image)) {
      console.error(`Image file not found: ${args.image}`);
      process.exit(1);
    }
    console.log("Uploading image...");
    imageUrl = await uploadFile("images", args.image);
    console.log(`  Image URL: ${imageUrl}`);
  }

  // Schedule 10 minutes from now
  const scheduledFor = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("content_queue")
    .insert({
      type: "video",
      media_url: videoUrl || null,
      image_url: imageUrl || null,
      media_mime_type: videoUrl ? "video/mp4" : "image/jpeg",
      source_text: context || null,
      platform,
      status: "pending",
      scheduled_for: scheduledFor,
      priority: 1,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create queue item:", error);
    process.exit(1);
  }

  console.log("\nQueue item created successfully!");
  console.log(`  ID: ${data.id}`);
  console.log(`  Type: ${data.type}`);
  console.log(`  Platform: ${data.platform}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Scheduled for: ${scheduledFor}`);
  if (videoUrl) console.log(`  Video: ${videoUrl}`);
  if (imageUrl) console.log(`  Image: ${imageUrl}`);
  if (context) console.log(`  Context: ${context}`);
  console.log(`\nPipeline will process this within ~5 minutes (next cron cycle).`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
