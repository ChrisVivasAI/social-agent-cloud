import { AgentMemoryService } from "./agent-memory.js";
import { GeminiService } from "./gemini-service.js";
import { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";
import { logger } from "../utils/logger.js";
import type { AgentMemoryEntry, VoiceProfile } from "../types/index.js";

/**
 * Memory consolidation pipeline.
 *
 * Runs nightly to transform raw episodic memories into semantic knowledge
 * and procedural rules:
 *
 *   Episodic → Semantic:  Analyze edit/feedback episodes, extract voice patterns,
 *                         update voice profile and preferences.
 *   Semantic → Procedural: When a pattern reaches high confidence (3+ episodes),
 *                          promote to a procedural rule.
 *   Compression:           Old episodes (>30 days) get truncated to save space.
 */
export class MemoryConsolidationService {
  constructor(
    private memory: AgentMemoryService,
    private gemini: GeminiService,
    private promptBuilder: DynamicPromptBuilder,
  ) {}

  /**
   * Full nightly consolidation run.
   */
  async runConsolidation(): Promise<{
    voiceProfileUpdated: boolean;
    preferencesExtracted: number;
    episodesCompressed: number;
  }> {
    logger.info("Starting memory consolidation pipeline...");

    const results = {
      voiceProfileUpdated: false,
      preferencesExtracted: 0,
      episodesCompressed: 0,
    };

    try {
      // Step 1: Analyze edit episodes and update voice profile
      const voiceResult = await this.consolidateVoiceProfile();
      results.voiceProfileUpdated = voiceResult.updated;
      results.preferencesExtracted = voiceResult.preferencesExtracted;

      // Step 2: Analyze video feedback episodes
      await this.consolidateVideoPreferences();

      // Step 3: Compress old episodes
      results.episodesCompressed = await this.memory.compressOldEpisodes(30);

      logger.info(
        `Consolidation complete: voice=${results.voiceProfileUpdated}, ` +
        `preferences=${results.preferencesExtracted}, ` +
        `compressed=${results.episodesCompressed}`,
      );
    } catch (err) {
      logger.error(`Consolidation pipeline failed: ${err}`);
    }

    return results;
  }

  /**
   * Promote high-confidence semantic patterns to procedural rules.
   * Runs weekly.
   */
  async promoteToProceduralRules(): Promise<number> {
    logger.info("Running procedural rule promotion...");

    try {
      // Get edit episodes from last 30 days
      const editEpisodes = await this.memory.getRecentEpisodes("edit", 30);
      const approveEpisodes = await this.memory.getRecentEpisodes("approve", 30);
      const rejectEpisodes = await this.memory.getRecentEpisodes("reject", 30);

      if (editEpisodes.length + approveEpisodes.length + rejectEpisodes.length < 3) {
        logger.info("Not enough episodes for procedural rule promotion");
        return 0;
      }

      // Get existing procedural rules to avoid duplication
      const existingRules = await this.memory.getProceduralRules();
      const existingRuleTexts = existingRules.map((r) => r.content_text);

      const skill = this.promptBuilder.loadSkill("voice-learning");

      const prompt = `${skill || ""}

You are analyzing user feedback patterns to extract PROCEDURAL RULES — concrete, actionable instructions for content generation.

A procedural rule is promoted when a pattern has 3+ supporting episodes and high confidence.

<edit_episodes>
${this.formatEpisodesForPrompt(editEpisodes.slice(0, 20))}
</edit_episodes>

<approval_episodes>
${this.formatEpisodesForPrompt(approveEpisodes.slice(0, 10))}
</approval_episodes>

<rejection_episodes>
${this.formatEpisodesForPrompt(rejectEpisodes.slice(0, 10))}
</rejection_episodes>

<existing_rules>
${existingRuleTexts.length > 0 ? existingRuleTexts.join("\n") : "None yet"}
</existing_rules>

Extract NEW procedural rules that are NOT already in the existing rules list.
Each rule must be:
- Specific and actionable (not vague)
- Supported by 3+ episodes
- Platform-tagged if platform-specific

Respond in JSON:
{
  "rules": [
    {
      "rule_text": "For Twitter: keep posts under 200 characters, no hashtags",
      "platform": "twitter" | "linkedin" | null,
      "content_type": "text" | "link" | "image" | "video" | null,
      "confidence": 0.0-1.0,
      "supporting_episode_count": 3,
      "reasoning": "User shortened 4 out of 5 Twitter posts and removed hashtags in 3 edits"
    }
  ]
}

If no patterns are strong enough yet, return {"rules": []}.`;

      const result = await this.gemini.generateJSON<{
        rules: Array<{
          rule_text: string;
          platform: string | null;
          content_type: string | null;
          confidence: number;
          supporting_episode_count: number;
          reasoning: string;
        }>;
      }>(prompt, "Extract procedural rules from feedback patterns.", {
        model: "pro",
        temperature: 0.3,
      });

      let promoted = 0;
      for (const rule of result.rules) {
        if (rule.confidence < 0.8 || rule.supporting_episode_count < 3) continue;

        await this.memory.storeProcedural({
          ruleText: rule.rule_text,
          platform: rule.platform || undefined,
          contentType: rule.content_type || undefined,
          confidence: rule.confidence,
          supportingEpisodeCount: rule.supporting_episode_count,
        });
        promoted++;
        logger.info(`Promoted procedural rule: "${rule.rule_text}" (${rule.reasoning})`);
      }

      logger.info(`Promoted ${promoted} new procedural rules`);
      return promoted;
    } catch (err) {
      logger.error(`Procedural rule promotion failed: ${err}`);
      return 0;
    }
  }

  // ─── Private Consolidation Steps ───

  /**
   * Analyze recent edit episodes and build/update voice profile.
   */
  private async consolidateVoiceProfile(): Promise<{
    updated: boolean;
    preferencesExtracted: number;
  }> {
    const editEpisodes = await this.memory.getRecentEpisodes("edit", 7);
    const approveEpisodes = await this.memory.getRecentEpisodes("approve", 7);
    const rejectEpisodes = await this.memory.getRecentEpisodes("reject", 7);

    const totalEpisodes = editEpisodes.length + approveEpisodes.length + rejectEpisodes.length;
    if (totalEpisodes === 0) {
      logger.info("No recent episodes for voice consolidation");
      return { updated: false, preferencesExtracted: 0 };
    }

    // Get current voice profile for comparison
    const currentProfile = await this.memory.getVoiceProfile();
    const skill = this.promptBuilder.loadSkill("voice-learning");

    const prompt = `${skill || ""}

You are analyzing user behavior to build a voice profile — a linguistic fingerprint that captures how they want their social media posts to sound.

<edit_episodes>
${this.formatEpisodesForPrompt(editEpisodes.slice(0, 20))}
</edit_episodes>

<approval_episodes>
${this.formatEpisodesForPrompt(approveEpisodes.slice(0, 10))}
</approval_episodes>

<rejection_episodes>
${this.formatEpisodesForPrompt(rejectEpisodes.slice(0, 10))}
</rejection_episodes>

${currentProfile ? `<current_voice_profile>\n${JSON.stringify(currentProfile, null, 2)}\n</current_voice_profile>` : "<current_voice_profile>None — this is the first voice profile.</current_voice_profile>"}

Analyze the edit diffs carefully:
- What did the user add? (preferred elements)
- What did the user remove? (disliked elements)
- Did they shorten or lengthen posts?
- Did they change tone? (more formal, more casual, more technical?)
- Platform-specific patterns?
- Emoji/hashtag usage changes?

Respond in JSON:
{
  "voice_profile": {
    "general": {
      "tone": "description of overall tone",
      "formality_level": "casual/semi-formal/formal",
      "humor_style": "none/subtle/playful/sarcastic",
      "sentence_length_preference": "short/medium/long/varied",
      "vocabulary_level": "simple/moderate/advanced/technical"
    },
    "twitter": {
      "max_length": 280,
      "opening_style": "description of how they like to open tweets",
      "emoji_usage": "none/minimal/moderate/heavy",
      "hashtag_usage": "none/minimal/moderate",
      "thread_preference": "single/threads"
    },
    "linkedin": {
      "typical_length": "short/medium/long",
      "structure": "description of preferred structure",
      "professional_vs_casual": "description",
      "cta_style": "description of call-to-action style"
    },
    "topics": {
      "preferred_framings": { "topic": "framing style" }
    },
    "never_do": ["list of things the user consistently removes or dislikes"],
    "always_do": ["list of things the user consistently adds or keeps"]
  },
  "preferences": [
    {
      "text": "Description of a learned preference",
      "platform": "twitter" | "linkedin" | null,
      "confidence": 0.0-1.0
    }
  ]
}

Be specific. Ground every observation in actual edit patterns you can see.
If you don't have enough data for a section, use reasonable defaults and note low confidence.`;

    try {
      const result = await this.gemini.generateJSON<{
        voice_profile: Omit<VoiceProfile, "updated_at" | "episode_count" | "confidence">;
        preferences: Array<{
          text: string;
          platform: string | null;
          confidence: number;
        }>;
      }>(prompt, "Build voice profile from edit patterns.", {
        model: "pro",
        maxTokens: 4096,
        temperature: 0.3,
      });

      // Store the voice profile
      const profile: VoiceProfile = {
        ...result.voice_profile,
        updated_at: new Date().toISOString(),
        episode_count: totalEpisodes,
        confidence: Math.min(1.0, totalEpisodes / 10), // confidence grows with data
      };

      await this.memory.storeVoiceProfile(profile);
      logger.info(`Updated voice profile (${totalEpisodes} episodes, confidence: ${profile.confidence.toFixed(2)})`);

      // Store extracted preferences
      let preferencesStored = 0;
      for (const pref of result.preferences) {
        if (pref.confidence < 0.5) continue;

        await this.memory.store({
          category: "preference",
          content: { preference: pref.text, source: "consolidation" },
          contentText: pref.text,
          relevanceTags: ["voice_learning", pref.platform || "all"],
          platform: pref.platform || undefined,
          confidence: pref.confidence,
        });
        preferencesStored++;
      }

      return { updated: true, preferencesExtracted: preferencesStored };
    } catch (err) {
      logger.error(`Voice profile consolidation failed: ${err}`);
      return { updated: false, preferencesExtracted: 0 };
    }
  }

  /**
   * Analyze video feedback episodes and extract editing style preferences.
   */
  private async consolidateVideoPreferences(): Promise<void> {
    const videoEpisodes = await this.memory.getRecentEpisodes("video_feedback", 14);
    if (videoEpisodes.length < 2) return;

    const prompt = `Analyze these video editing feedback episodes and extract style preferences.

<video_feedback_episodes>
${this.formatEpisodesForPrompt(videoEpisodes.slice(0, 15))}
</video_feedback_episodes>

Extract video editing style preferences in JSON:
{
  "preferences": [
    {
      "text": "Preference description (e.g., 'Prefers fast cuts of 2-3 seconds')",
      "confidence": 0.0-1.0
    }
  ]
}

Only include preferences with clear supporting evidence.`;

    try {
      const result = await this.gemini.generateJSON<{
        preferences: Array<{ text: string; confidence: number }>;
      }>(prompt, "Extract video editing style preferences.", {
        model: "flash",
        temperature: 0.3,
      });

      for (const pref of result.preferences) {
        if (pref.confidence < 0.6) continue;

        await this.memory.store({
          category: "editing_style",
          content: { preference: pref.text, source: "video_consolidation" },
          contentText: pref.text,
          relevanceTags: ["video_editing", "style_preference"],
          confidence: pref.confidence,
        });
      }

      logger.info(`Extracted ${result.preferences.length} video style preferences`);
    } catch (err) {
      logger.error(`Video preference consolidation failed: ${err}`);
    }
  }

  // ─── Helpers ───

  private formatEpisodesForPrompt(episodes: AgentMemoryEntry[]): string {
    if (episodes.length === 0) return "No episodes.";

    return episodes.map((ep) => {
      const content = ep.content as Record<string, unknown>;
      const sourceContent = ep.source_content as Record<string, unknown> | undefined;
      const lines: string[] = [
        `- [${ep.episode_type || content.action || "unknown"}] ${ep.content_text.substring(0, 300)}`,
      ];

      if (sourceContent?.original && sourceContent?.edited) {
        lines.push(`  Original: "${(sourceContent.original as string).substring(0, 200)}"`);
        lines.push(`  Edited: "${(sourceContent.edited as string).substring(0, 200)}"`);
      }

      if (ep.platform) lines.push(`  Platform: ${ep.platform}`);
      return lines.join("\n");
    }).join("\n");
  }
}
