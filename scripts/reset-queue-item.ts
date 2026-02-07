/**
 * Reset the failed queue item back to pending for reprocessing.
 * Run: npx tsx scripts/reset-queue-item.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const itemId = "31e275e2-45f8-46d0-a824-4465b2781232";

  // Reset to pending and reschedule 15 min from now
  const scheduledFor = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("content_queue")
    .update({
      status: "pending",
      error_message: null,
      retry_count: 0,
      scheduled_for: scheduledFor,
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    console.error("Reset failed:", error);
    process.exit(1);
  }

  console.log("Queue item reset successfully!");
  console.log(`  ID: ${data.id}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  New scheduled_for: ${scheduledFor}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
