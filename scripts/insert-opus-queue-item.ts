/**
 * Insert queue item for Opus 4.6 announcement video.
 * Run: npx tsx scripts/insert-opus-queue-item.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Schedule 15 minutes from now
  const scheduledFor = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const heroImageUrl =
    "https://cmuohezhukzzhrstbhbp.supabase.co/storage/v1/object/public/images/opus-4-6-hero.png";
  const logoUrl =
    "https://cmuohezhukzzhrstbhbp.supabase.co/storage/v1/object/public/images/claude-logo.png";

  const { data, error } = await supabase
    .from("content_queue")
    .insert({
      type: "remotion",
      content_url: "https://www.anthropic.com/news/claude-opus-4-6",
      platform: "both",
      status: "pending",
      scheduled_for: scheduledFor,
      priority: 1,
      remotion_props: {
        logoUrl,
        heroImageUrl,
      },
    })
    .select()
    .single();

  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }

  console.log("Queue item inserted successfully!");
  console.log(`  ID: ${data.id}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Scheduled for: ${scheduledFor}`);
  console.log(`  Content URL: ${data.content_url}`);
  console.log(`  Logo URL: ${data.remotion_props.logoUrl}`);
  console.log(`  Hero Image URL: ${data.remotion_props.heroImageUrl}`);
  console.log(`\nPipeline will process this within ~5 minutes (next processQueueItems cron).`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
