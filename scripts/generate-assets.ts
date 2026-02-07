/**
 * Generate hero image via fal.ai and upload assets to Supabase Storage.
 * Run: npx tsx scripts/generate-assets.ts
 */
import "dotenv/config";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

fal.config({ credentials: process.env.FAL_KEY! });

async function main() {
  // --- 1. Generate hero image via fal.ai ---
  console.log("Generating hero image via fal.ai Flux 2 Flex...");
  const result = await fal.subscribe("fal-ai/flux-2-flex", {
    input: {
      prompt:
        "Abstract futuristic AI neural network visualization, glowing orange and amber nodes connected by luminous threads on a deep dark background, minimal geometric shapes, modern tech aesthetic, cinematic lighting, 4K quality",
      image_size: { width: 1080, height: 1080 },
    },
  });

  const data = result.data as { images: Array<{ url: string }> };
  if (!data?.images?.[0]?.url) {
    throw new Error("fal.ai returned no image URL");
  }

  console.log(`Hero image generated: ${data.images[0].url}`);

  // Download the image
  const heroResp = await fetch(data.images[0].url);
  if (!heroResp.ok) throw new Error(`Failed to download hero: ${heroResp.status}`);
  const heroBuffer = Buffer.from(await heroResp.arrayBuffer());
  console.log(`Hero image downloaded: ${heroBuffer.length} bytes`);

  // Upload to Supabase Storage
  const heroPath = "opus-4-6-hero.png";
  const { error: heroErr } = await supabase.storage
    .from("images")
    .upload(heroPath, heroBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (heroErr) throw new Error(`Hero upload failed: ${heroErr.message}`);

  const { data: heroUrlData } = supabase.storage
    .from("images")
    .getPublicUrl(heroPath);
  console.log(`Hero image uploaded: ${heroUrlData.publicUrl}`);

  // --- 2. Download Claude logo and upload ---
  // Use the official Anthropic favicon/logo (starburst icon)
  console.log("Downloading Claude logo...");
  const logoResp = await fetch(
    "https://www.anthropic.com/favicon.ico",
  );
  if (!logoResp.ok) throw new Error(`Failed to download logo: ${logoResp.status}`);
  const logoBuffer = Buffer.from(await logoResp.arrayBuffer());
  console.log(`Logo downloaded: ${logoBuffer.length} bytes`);

  const logoPath = "claude-logo.png";
  const { error: logoErr } = await supabase.storage
    .from("images")
    .upload(logoPath, logoBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (logoErr) throw new Error(`Logo upload failed: ${logoErr.message}`);

  const { data: logoUrlData } = supabase.storage
    .from("images")
    .getPublicUrl(logoPath);
  console.log(`Logo uploaded: ${logoUrlData.publicUrl}`);

  // --- Summary ---
  console.log("\n=== ASSET URLs ===");
  console.log(`heroImageUrl: ${heroUrlData.publicUrl}`);
  console.log(`logoUrl:      ${logoUrlData.publicUrl}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
