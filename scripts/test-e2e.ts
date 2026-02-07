/**
 * Full end-to-end test of the social media agent pipeline.
 * Tests: Queue -> Content Generation -> Platform Auth
 *
 * Usage: npx tsx scripts/test-e2e.ts
 */
import "dotenv/config";
import { ContentQueueService } from "../src/services/content-queue.js";
import { ContentGeneratorService } from "../src/services/content-generator.js";
import { TwitterClient } from "../src/clients/twitter.js";
import { LinkedInClient } from "../src/clients/linkedin.js";

async function main() {
  console.log("=== Full E2E Test ===\n");

  const queue = new ContentQueueService();
  const generator = new ContentGeneratorService(queue);

  // Step 1: Add a link to the queue
  console.log("1. Adding URL to queue...");
  const item = await queue.addItem({
    type: "link",
    content_url: "https://www.anthropic.com/news/claude-for-enterprise",
    source_text: "Check out this article",
  });
  console.log("   Queued:", item.id, "status:", item.status);

  // Step 2: Process queue item (generate content)
  console.log("\n2. Generating content with Claude...");
  await generator.processQueueItem(item);
  // Re-fetch the updated item from DB
  const dueItems = await queue.getDueItems();
  const readyItems = dueItems.filter((i) => i.id === item.id);
  // Also check generated items in case it's not yet due
  const { createSupabaseClient } = await import("../src/utils/supabase.js");
  const supabase = createSupabaseClient();
  const { data: processed } = await supabase
    .from("content_queue")
    .select("*")
    .eq("id", item.id)
    .single();
  console.log("   Status:", processed?.status);
  console.log(
    "   Post preview:",
    processed?.generated_post?.substring(0, 150) + "...",
  );
  console.log("   Post length:", processed?.generated_post?.length);

  // Step 3: Test platform connections
  console.log("\n3. Testing platform connections...");

  const twitter = TwitterClient.fromEnv();
  const twitterOk = await twitter.testAuthentication();
  console.log("   Twitter auth:", twitterOk ? "PASS" : "FAIL");

  const linkedin = LinkedInClient.fromEnv();
  const linkedinOk = await linkedin.testAuthentication();
  console.log("   LinkedIn auth:", linkedinOk ? "PASS" : "FAIL");

  // Step 4: Check queue summary
  console.log("\n4. Queue summary:");
  const summary = await queue.getQueueSummary();
  console.log("   Pending:", summary.pending);
  console.log("   Generating:", summary.generating);
  console.log("   Ready:", summary.ready);
  console.log("   Posted today:", summary.posted_today);

  const allPassed = twitterOk && linkedinOk && processed?.generated_post;
  console.log(
    `\n=== E2E Test ${allPassed ? "PASSED" : "FAILED"} ===`,
  );
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
