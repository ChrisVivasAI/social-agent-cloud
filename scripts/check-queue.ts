import "dotenv/config";
import { createSupabaseClient } from "../src/utils/supabase.js";

async function main() {
  const supabase = createSupabaseClient();

  // Check for any Slack-originated items
  const { data: slackItems, error: e1 } = await supabase
    .from("content_queue")
    .select("id, type, status, content_url, scheduled_for, created_at, slack_channel_id, slack_message_ts, error_message")
    .not("slack_channel_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("=== SLACK-ORIGINATED ITEMS ===");
  if (e1) {
    console.error(e1);
  } else if (!slackItems || slackItems.length === 0) {
    console.log("None found");
  } else {
    for (const row of slackItems) {
      console.log("---");
      console.log("ID:", row.id);
      console.log("Type:", row.type);
      console.log("Status:", row.status);
      console.log("URL:", row.content_url);
      console.log("Created:", row.created_at);
      console.log("Slack Channel:", row.slack_channel_id);
      console.log("Error:", row.error_message || "none");
    }
  }

  // All items from last 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: e2 } = await supabase
    .from("content_queue")
    .select("id, type, status, content_url, created_at, slack_channel_id, source_text, error_message")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  console.log("\n=== ALL ITEMS (LAST 48H) ===");
  console.log("Count:", recent?.length || 0);
  if (recent) {
    for (const row of recent) {
      console.log("---");
      console.log("ID:", row.id);
      console.log("Type:", row.type, "| Status:", row.status);
      console.log("URL:", row.content_url || "n/a");
      console.log("Created:", row.created_at);
      console.log("Slack:", row.slack_channel_id || "n/a");
      if (row.error_message) console.log("Error:", row.error_message);
    }
  }

  // Check post_history for recent posts
  const { data: posts, error: e3 } = await supabase
    .from("post_history")
    .select("*")
    .order("posted_at", { ascending: false })
    .limit(5);

  console.log("\n=== RECENT POST HISTORY ===");
  if (posts && posts.length > 0) {
    for (const p of posts) {
      console.log("---");
      console.log("Queue ID:", p.queue_item_id);
      console.log("Platform:", p.platform);
      console.log("Posted at:", p.posted_at);
      console.log("Twitter ID:", p.twitter_post_id || "n/a");
      console.log("LinkedIn ID:", p.linkedin_post_id || "n/a");
    }
  } else {
    console.log("None found");
  }
}

main();
