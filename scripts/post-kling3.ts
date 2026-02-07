/**
 * LIVE POST: Kling 3.0 article to Twitter + LinkedIn
 */
import "dotenv/config";
import { ContentQueueService } from "../src/services/content-queue.js";
import { ContentGeneratorService } from "../src/services/content-generator.js";
import { PostingService } from "../src/services/posting-service.js";
import { createSupabaseClient } from "../src/utils/supabase.js";

async function main() {
  const queue = new ContentQueueService();
  const generator = new ContentGeneratorService(queue);
  const poster = new PostingService();

  console.log("=== LIVE POST TEST: Kling 3.0 ===\n");

  // Step 1: Add to queue
  console.log("1. Adding Kling 3.0 article to queue...");
  const item = await queue.addItem({
    type: "link",
    content_url: "https://bestphoto.ai/blog/kling-3-0-now-available",
    source_text:
      "Kling 3.0 just launched - native 4K, multi-shot storyboards, 15-second videos",
    platform: "both",
  });
  console.log("   Queued:", item.id);

  // Step 2: Generate content
  console.log("\n2. Generating post with Claude...");
  await generator.processQueueItem(item);

  // Re-fetch the updated item
  const supabase = createSupabaseClient();
  const { data: ready } = await supabase
    .from("content_queue")
    .select("*")
    .eq("id", item.id)
    .single();

  console.log("   Status:", ready?.status);
  console.log("   Image:", ready?.image_url || "(none)");
  console.log("\n--- Generated Post ---");
  console.log(ready?.generated_post);
  console.log("--- End Post ---");
  console.log("   Length:", ready?.generated_post?.length, "chars");

  if (ready?.status !== "ready" || !ready?.generated_post) {
    console.error("\nGeneration failed - aborting post.");
    process.exit(1);
  }

  // Step 3: LIVE POST
  console.log("\n3. POSTING LIVE to Twitter + LinkedIn...");
  const result = await poster.postToAll(ready);
  console.log("\n   Success:", result.success);
  if (result.twitterPostId)
    console.log(
      "   Twitter: https://twitter.com/i/status/" + result.twitterPostId,
    );
  if (result.linkedinPostId)
    console.log("   LinkedIn:", result.linkedinPostId);
  if (result.errors.length > 0) console.log("   Errors:", result.errors);

  // Step 4: Mark as posted
  if (result.success) {
    await queue.markPosted(item.id, {
      twitter_post_id: result.twitterPostId,
      linkedin_post_id: result.linkedinPostId,
    });
    console.log("\n   Marked as posted in DB");
  }

  console.log("\n=== LIVE POST TEST COMPLETE ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
