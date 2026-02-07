import { createSupabaseClient } from "./supabase.js";
import { AgentMemoryService } from "../services/agent-memory.js";
import { GeminiService } from "../services/gemini-service.js";
import { logger } from "./logger.js";

/**
 * Backfill posted content into agent memory for RAG retrieval.
 *
 * Reads all posted items from content_queue and indexes them into the
 * agent_memory table as 'posted_content' entries with embeddings.
 * Skips items that are already indexed (by checking source_id).
 *
 * Usage:
 *   import { backfillRAGContent } from "./utils/backfill-rag.js";
 *   await backfillRAGContent();
 */
export async function backfillRAGContent(options?: {
  batchSize?: number;
  dryRun?: boolean;
}): Promise<{ indexed: number; skipped: number; errors: number }> {
  const batchSize = options?.batchSize ?? 50;
  const dryRun = options?.dryRun ?? false;

  const supabase = createSupabaseClient();
  const gemini = new GeminiService();
  const memory = new AgentMemoryService(gemini);

  // Get all posted queue items
  const { data: postedItems, error } = await supabase
    .from("content_queue")
    .select("id, type, platform, generated_post, generated_post_twitter, generated_post_linkedin, posted_at")
    .eq("status", "posted")
    .not("generated_post", "is", null)
    .order("posted_at", { ascending: false });

  if (error) {
    logger.error(`Failed to fetch posted items: ${error.message}`);
    return { indexed: 0, skipped: 0, errors: 1 };
  }

  if (!postedItems || postedItems.length === 0) {
    logger.info("No posted items to backfill");
    return { indexed: 0, skipped: 0, errors: 0 };
  }

  logger.info(`Found ${postedItems.length} posted items to backfill`);

  // Get already-indexed source IDs to avoid duplicates
  const { data: existingMemories } = await supabase
    .from("agent_memory")
    .select("source_id")
    .eq("category", "posted_content")
    .not("source_id", "is", null);

  const indexedSourceIds = new Set(
    (existingMemories || []).map((m) => m.source_id),
  );

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < postedItems.length; i += batchSize) {
    const batch = postedItems.slice(i, i + batchSize);

    for (const item of batch) {
      // Skip if already indexed
      if (indexedSourceIds.has(item.id)) {
        skipped++;
        continue;
      }

      const platform = item.platform || "both";
      const platforms: string[] =
        platform === "both" ? ["twitter", "linkedin"] : [platform];

      for (const plat of platforms) {
        const postText =
          plat === "twitter"
            ? item.generated_post_twitter || item.generated_post
            : item.generated_post_linkedin || item.generated_post;

        if (!postText) continue;

        if (dryRun) {
          logger.info(`[DRY RUN] Would index: ${item.id} (${plat}) - ${postText.substring(0, 60)}...`);
          indexed++;
          continue;
        }

        try {
          await memory.store({
            category: "posted_content",
            content: {
              post_text: postText,
              platform: plat,
              content_type: item.type,
              queue_item_id: item.id,
              posted_at: item.posted_at,
              backfilled: true,
            },
            contentText: postText,
            relevanceTags: [plat, item.type, "posted_content"],
            platform: plat,
            sourceId: item.id,
          });
          indexed++;
        } catch (err) {
          logger.warn(`Failed to index item ${item.id} (${plat}): ${err}`);
          errors++;
        }
      }
    }

    logger.info(`Backfill progress: ${Math.min(i + batchSize, postedItems.length)}/${postedItems.length} processed`);
  }

  logger.info(`Backfill complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors`);
  return { indexed, skipped, errors };
}
