import type { KnownBlock } from "@slack/types";
import type {
  ContentQueueItem,
  QueueSummary,
  DiscoveredContent,
  VideoIdea,
  VideoProject,
} from "../types/index.js";
import type { DraftedEngagement } from "../services/engagement-monitor.js";

type Block = KnownBlock;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + "...";
}

function formatSchedule(item: ContentQueueItem): string {
  if (!item.scheduled_for) return "Not scheduled";
  const d = new Date(item.scheduled_for);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function platformLabel(item: ContentQueueItem): string {
  const p = item.platform || "both";
  if (p === "both") return "Twitter + LinkedIn";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function captionPreview(item: ContentQueueItem): string {
  const twitter = item.generated_post_twitter || item.generated_post || "";
  const linkedin = item.generated_post_linkedin || item.generated_post || "";
  const parts: string[] = [];
  if (twitter) parts.push(`*Twitter:* ${truncate(twitter, 200)}`);
  if (linkedin && linkedin !== twitter)
    parts.push(`*LinkedIn:* ${truncate(linkedin, 200)}`);
  return parts.join("\n") || "_No captions generated yet_";
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    pending: ":hourglass:",
    generating: ":gear:",
    generated: ":page_facing_up:",
    rendering: ":movie_camera:",
    awaiting_approval: ":eyes:",
    ready: ":white_check_mark:",
    posting: ":rocket:",
    posted: ":tada:",
    failed: ":x:",
    skipped: ":fast_forward:",
    paused: ":double_vertical_bar:",
  };
  return map[status] || ":grey_question:";
}

export function buildReviewCard(item: ContentQueueItem): Block[] {
  const blocks: Block[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `New Post Ready for Review`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        { type: "mrkdwn", text: `*Scheduled:* ${formatSchedule(item)}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${item.id.substring(0, 8)}\``,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
  ];

  if (item.content_url) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Source: ${item.content_url}` },
      ],
    });
  }

  if (item.image_url || item.media_url) {
    const imgUrl = item.image_url || item.media_url;
    if (imgUrl) {
      const isVideo = item.media_mime_type?.startsWith("video/") || imgUrl.includes("video");
      if (isVideo) {
        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `:movie_camera: <${imgUrl}|View attached video>` },
          ],
        });
      } else {
        blocks.push({
          type: "image",
          image_url: imgUrl,
          alt_text: "Post media",
        });
      }
    }
  }

  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          style: "primary",
          action_id: "approve_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Edit", emoji: true },
          action_id: "edit_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reschedule", emoji: true },
          action_id: "reschedule_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Skip", emoji: true },
          style: "danger",
          action_id: "skip_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Pause", emoji: true },
          action_id: "pause_item",
          value: item.id,
        },
      ],
    },
  );

  return blocks;
}

export function buildApprovedCard(item: ContentQueueItem): Block[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Post Approved",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        { type: "mrkdwn", text: `*Scheduled:* ${formatSchedule(item)}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${item.id.substring(0, 8)}\``,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:white_check_mark: *Approved* — posting at ${formatSchedule(item)}`,
        },
      ],
    },
  ];
}

export function buildAutoApprovedCard(item: ContentQueueItem): Block[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Post Auto-Approved",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        { type: "mrkdwn", text: `*Scheduled:* ${formatSchedule(item)}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${item.id.substring(0, 8)}\``,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:zap: *Auto-approved* — posting at ${formatSchedule(item)}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Pause", emoji: true },
          style: "danger",
          action_id: "pause_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Skip", emoji: true },
          action_id: "skip_item",
          value: item.id,
        },
      ],
    },
  ];
}

export function buildPostedCard(
  item: ContentQueueItem,
  twitterUrl?: string,
  linkedinId?: string,
): Block[] {
  const links: string[] = [];
  if (twitterUrl) links.push(`<${twitterUrl}|View on Twitter>`);
  if (linkedinId) links.push(`LinkedIn post ID: ${linkedinId}`);

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Post Published", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:tada: *Posted!* ${links.join(" | ") || ""}`,
        },
      ],
    },
  ];
}

export function buildSkippedCard(item: ContentQueueItem): Block[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Post Skipped", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${item.id.substring(0, 8)}\``,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          item.generated_post_twitter || item.generated_post || "_No caption_",
          150,
        ),
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: ":fast_forward: *Skipped*" },
      ],
    },
  ];
}

export function buildPausedCard(item: ContentQueueItem): Block[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Post Paused", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        { type: "mrkdwn", text: `*Scheduled:* ${formatSchedule(item)}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${item.id.substring(0, 8)}\``,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":double_vertical_bar: *Paused* — will not post until resumed",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Resume", emoji: true },
          style: "primary",
          action_id: "resume_item",
          value: item.id,
        },
      ],
    },
  ];
}

export function buildFailedCard(item: ContentQueueItem): Block[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Post Failed", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        {
          type: "mrkdwn",
          text: `*Error:* ${item.error_message || "Unknown"}`,
        },
        {
          type: "mrkdwn",
          text: `*Retries:* ${item.retry_count}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Retry", emoji: true },
          style: "primary",
          action_id: "retry_item",
          value: item.id,
        },
      ],
    },
  ];
}

export function buildQueueList(items: ContentQueueItem[]): Block[] {
  if (items.length === 0) {
    return [
      {
        type: "section",
        text: { type: "mrkdwn", text: "_No items in queue._" },
      },
    ];
  }

  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Content Queue", emoji: true },
    },
  ];

  for (const item of items) {
    const caption = truncate(
      item.generated_post_twitter || item.generated_post || item.content_url || "_No content_",
      100,
    );
    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji(item.status)} \`${item.id.substring(0, 8)}\` *${item.type}* — ${platformLabel(item)}\n${caption}\n_${formatSchedule(item)}_`,
        },
        accessory: {
          type: "overflow",
          action_id: `queue_overflow_${item.id}`,
          options: [
            {
              text: { type: "plain_text", text: "Approve" },
              value: `approve:${item.id}`,
            },
            {
              text: { type: "plain_text", text: "Edit" },
              value: `edit:${item.id}`,
            },
            {
              text: { type: "plain_text", text: "Skip" },
              value: `skip:${item.id}`,
            },
          ],
        },
      },
      { type: "divider" },
    );
  }

  return blocks;
}

function buildScheduleItemActions(item: ContentQueueItem): Block {
  type ButtonElement = {
    type: "button";
    text: { type: "plain_text"; text: string; emoji: true };
    action_id: string;
    value: string;
    style?: "primary" | "danger";
  };

  const btn = (
    label: string,
    actionId: string,
    style?: "primary" | "danger",
  ): ButtonElement => ({
    type: "button",
    text: { type: "plain_text", text: label, emoji: true },
    action_id: actionId,
    value: item.id,
    ...(style && { style }),
  });

  let elements: ButtonElement[];

  switch (item.status) {
    case "awaiting_approval":
      elements = [
        btn("Approve", "approve_item", "primary"),
        btn("Edit", "edit_item"),
        btn("Reschedule", "reschedule_item"),
        btn("Skip", "skip_item", "danger"),
        btn("Pause", "pause_item"),
      ];
      break;
    case "ready":
      elements = [
        btn("Edit", "edit_item"),
        btn("Reschedule", "reschedule_item"),
        btn("Post Now", "post_now_item"),
        btn("Pause", "pause_item"),
        btn("Skip", "skip_item", "danger"),
      ];
      break;
    case "generated":
    case "rendering":
      elements = [
        btn("Edit", "edit_item"),
        btn("Reschedule", "reschedule_item"),
        btn("Skip", "skip_item", "danger"),
        btn("Pause", "pause_item"),
      ];
      break;
    case "pending":
      elements = [
        btn("Reschedule", "reschedule_item"),
        btn("Skip", "skip_item", "danger"),
      ];
      break;
    case "paused":
      elements = [
        btn("Resume", "resume_item", "primary"),
        btn("Edit", "edit_item"),
        btn("Reschedule", "reschedule_item"),
        btn("Skip", "skip_item", "danger"),
      ];
      break;
    default:
      elements = [
        btn("Edit", "edit_item"),
        btn("Reschedule", "reschedule_item"),
        btn("Skip", "skip_item", "danger"),
      ];
      break;
  }

  return {
    type: "actions",
    elements,
  } as Block;
}

function getWeekRange(weekOffset: number): { monday: Date; sunday: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatDateRange(monday: Date, sunday: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function buildScheduleList(items: ContentQueueItem[], weekOffset: number = 0): Block[] {
  const { monday, sunday } = getWeekRange(weekOffset);
  const rangeLabel = formatDateRange(monday, sunday);

  if (items.length === 0) {
    const blocks: Block[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Schedule: ${rangeLabel}*\n_No scheduled posts this week._` },
      },
    ];
    // Still show nav buttons even when empty
    const buttons: Array<{
      type: "button";
      text: { type: "plain_text"; text: string; emoji: true };
      action_id: string;
      value: string;
    }> = [];
    if (weekOffset > -4) {
      buttons.push({
        type: "button",
        text: { type: "plain_text", text: "\u2190 Previous Week", emoji: true },
        action_id: "schedule_prev",
        value: String(weekOffset - 1),
      });
    }
    if (weekOffset < 8) {
      buttons.push({
        type: "button",
        text: { type: "plain_text", text: "Next Week \u2192", emoji: true },
        action_id: "schedule_next",
        value: String(weekOffset + 1),
      });
    }
    if (buttons.length > 0) {
      blocks.push({ type: "actions", elements: buttons } as Block);
    }
    return blocks;
  }

  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Schedule: ${rangeLabel}`, emoji: true },
    },
  ];

  // Group by day
  const byDay = new Map<string, ContentQueueItem[]>();
  for (const item of items) {
    const day = item.scheduled_for
      ? new Date(item.scheduled_for).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "Unscheduled";
    const list = byDay.get(day) || [];
    list.push(item);
    byDay.set(day, list);
  }

  for (const [day, dayItems] of byDay) {
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: day,
        emoji: true,
      },
    });

    for (const item of dayItems) {
      const time = item.scheduled_for
        ? new Date(item.scheduled_for).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "TBD";
      const caption = truncate(
        item.generated_post_twitter || item.generated_post || item.content_url || "_No content_",
        100,
      );
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${statusEmoji(item.status)} *${time}* — ${item.type} · ${platformLabel(item)} · \`${item.id.substring(0, 8)}\`\n${caption}`,
          },
        },
        buildScheduleItemActions(item),
      );
    }

    blocks.push({ type: "divider" });
  }

  // Navigation buttons
  const navButtons: Array<{
    type: "button";
    text: { type: "plain_text"; text: string; emoji: true };
    action_id: string;
    value: string;
  }> = [];
  if (weekOffset > -4) {
    navButtons.push({
      type: "button",
      text: { type: "plain_text", text: "\u2190 Previous Week", emoji: true },
      action_id: "schedule_prev",
      value: String(weekOffset - 1),
    });
  }
  if (weekOffset < 8) {
    navButtons.push({
      type: "button",
      text: { type: "plain_text", text: "Next Week \u2192", emoji: true },
      action_id: "schedule_next",
      value: String(weekOffset + 1),
    });
  }
  if (navButtons.length > 0) {
    blocks.push({ type: "actions", elements: navButtons } as Block);
  }

  return blocks;
}

export function buildStatusSummary(summary: QueueSummary): Block[] {
  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Queue Status", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `:hourglass: *Pending:* ${summary.pending}` },
        { type: "mrkdwn", text: `:gear: *Generating:* ${summary.generating}` },
        {
          type: "mrkdwn",
          text: `:eyes: *Awaiting Approval:* ${summary.awaiting_approval}`,
        },
        {
          type: "mrkdwn",
          text: `:white_check_mark: *Ready:* ${summary.ready}`,
        },
        {
          type: "mrkdwn",
          text: `:double_vertical_bar: *Paused:* ${summary.paused}`,
        },
        { type: "mrkdwn", text: `:tada: *Posted Today:* ${summary.posted_today}` },
        { type: "mrkdwn", text: `:x: *Failed:* ${summary.failed}` },
      ],
    },
  ];

  if (summary.upcoming.length > 0) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Upcoming Posts:*" },
      },
    );
    for (const u of summary.upcoming.slice(0, 5)) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${statusEmoji(u.status)} \`${u.id.substring(0, 8)}\` ${u.type} — ${u.scheduled_for ? new Date(u.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "TBD"}`,
          },
        ],
      });
    }
  }

  return blocks;
}

export function buildWeeklyDigest(items: ContentQueueItem[]): Block[] {
  const blocks: Block[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Weekly Schedule Digest",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `You have *${items.length}* post${items.length !== 1 ? "s" : ""} scheduled this week.`,
      },
    },
    { type: "divider" },
  ];

  // Reuse schedule list format for the items
  blocks.push(...buildScheduleList(items));

  return blocks;
}

export function buildPrePostNotification(item: ContentQueueItem): Block[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:clock3: *Posting in ~30 minutes*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:* ${item.type}` },
        { type: "mrkdwn", text: `*Platform:* ${platformLabel(item)}` },
        { type: "mrkdwn", text: `*Scheduled:* ${formatSchedule(item)}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: captionPreview(item),
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Pause", emoji: true },
          style: "danger",
          action_id: "pause_item",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Post Now", emoji: true },
          action_id: "post_now_item",
          value: item.id,
        },
      ],
    },
  ];
}

export function buildEditCaptionsModal(item: ContentQueueItem): Block[] {
  return [
    {
      type: "input",
      block_id: "twitter_caption",
      label: { type: "plain_text", text: "Twitter Caption (280 max)" },
      element: {
        type: "plain_text_input",
        action_id: "twitter_caption_input",
        initial_value:
          item.generated_post_twitter || item.generated_post || "",
        max_length: 280,
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "linkedin_caption",
      label: { type: "plain_text", text: "LinkedIn Caption" },
      element: {
        type: "plain_text_input",
        action_id: "linkedin_caption_input",
        initial_value:
          item.generated_post_linkedin || item.generated_post || "",
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "platform_select",
      label: { type: "plain_text", text: "Post To" },
      element: {
        type: "static_select",
        action_id: "platform_select_input",
        initial_option: {
          text: {
            type: "plain_text",
            text: platformLabel(item),
          },
          value: item.platform || "both",
        },
        options: [
          {
            text: { type: "plain_text", text: "Twitter + LinkedIn" },
            value: "both",
          },
          {
            text: { type: "plain_text", text: "Twitter" },
            value: "twitter",
          },
          {
            text: { type: "plain_text", text: "LinkedIn" },
            value: "linkedin",
          },
        ],
      },
    },
  ];
}

export function buildRescheduleModal(item: ContentQueueItem): Block[] {
  const current = item.scheduled_for ? new Date(item.scheduled_for) : new Date();
  const dateStr = current.toISOString().split("T")[0];
  const timeStr = current.toTimeString().substring(0, 5);

  return [
    {
      type: "input",
      block_id: "reschedule_date",
      label: { type: "plain_text", text: "Date" },
      element: {
        type: "datepicker",
        action_id: "reschedule_date_input",
        initial_date: dateStr,
      },
    },
    {
      type: "input",
      block_id: "reschedule_time",
      label: { type: "plain_text", text: "Time" },
      element: {
        type: "timepicker",
        action_id: "reschedule_time_input",
        initial_time: timeStr,
      },
    },
  ];
}

export function buildDiscoveryCard(item: DiscoveredContent): Block[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Content Discovery",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${truncate(item.title || "Untitled", 150)}*\n${truncate(item.summary || "", 300)}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:mag: Source: ${item.source_feed} | Relevance: ${((item.relevance_score || 0) * 100).toFixed(0)}%`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `<${item.url}|View article>` },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Queue This", emoji: true },
          style: "primary",
          action_id: "queue_discovery",
          value: item.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          action_id: "dismiss_discovery",
          value: item.id,
        },
      ],
    },
  ];
}

export function buildVideoIdeaCard(idea: VideoIdea): Block[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Video Idea", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${truncate(idea.concept, 200)}*`,
      },
    },
    ...(idea.rationale
      ? [
          {
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: truncate(idea.rationale, 300),
            },
          },
        ]
      : []),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            idea.target_platform && `:movie_camera: Platform: ${idea.target_platform}`,
            idea.estimated_duration_sec && `Duration: ~${idea.estimated_duration_sec}s`,
            idea.style_notes && `Style: ${truncate(idea.style_notes, 50)}`,
          ]
            .filter(Boolean)
            .join(" | "),
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve & Produce", emoji: true },
          style: "primary",
          action_id: "approve_video_idea",
          value: idea.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Critique", emoji: true },
          action_id: "critique_video_idea",
          value: idea.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject", emoji: true },
          style: "danger",
          action_id: "reject_video_idea",
          value: idea.id,
        },
      ],
    },
  ];
}

export function buildVideoReviewCard(project: VideoProject): Block[] {
  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Video Ready for Review", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Title:* ${project.title}` },
        { type: "mrkdwn", text: `*Status:* ${project.status}` },
        {
          type: "mrkdwn",
          text: `*ID:* \`${project.id.substring(0, 8)}\``,
        },
      ],
    },
  ];

  if (project.goal) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Goal:* ${truncate(project.goal, 200)}` },
    });
  }

  if (project.output_url) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `:movie_camera: <${project.output_url}|Watch video>` },
      ],
    });
  }

  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          style: "primary",
          action_id: "approve_video_project",
          value: project.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Request Changes", emoji: true },
          action_id: "feedback_video_project",
          value: project.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject", emoji: true },
          style: "danger",
          action_id: "reject_video_project",
          value: project.id,
        },
      ],
    },
  );

  return blocks;
}

export function buildVideoStatusCard(project: VideoProject): Block[] {
  const statusMap: Record<string, string> = {
    draft: ":pencil:",
    analyzing: ":mag:",
    editing: ":scissors:",
    rendering: ":movie_camera:",
    review: ":eyes:",
    approved: ":white_check_mark:",
    posted: ":tada:",
    archived: ":file_folder:",
  };
  const emoji = statusMap[project.status] || ":grey_question:";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Video Project Status", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Title:* ${project.title}` },
        { type: "mrkdwn", text: `${emoji} *Status:* ${project.status}` },
        {
          type: "mrkdwn",
          text: `*Footage:* ${project.footage_asset_ids.length} clips`,
        },
        {
          type: "mrkdwn",
          text: `*Revisions:* ${project.feedback_history.length}`,
        },
      ],
    },
    ...(project.output_url
      ? [
          {
            type: "context" as const,
            elements: [
              {
                type: "mrkdwn" as const,
                text: `:movie_camera: <${project.output_url}|Watch latest render>`,
              },
            ],
          },
        ]
      : []),
  ];
}

export function buildEngagementCard(engagement: DraftedEngagement): Block[] {
  const sentimentEmoji: Record<string, string> = {
    positive: ":green_heart:",
    neutral: ":white_circle:",
    negative: ":warning:",
    question: ":question:",
  };
  const emoji = sentimentEmoji[engagement.sentiment] || ":speech_balloon:";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New Engagement",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*From:* @${engagement.mention.authorUsername}`,
        },
        {
          type: "mrkdwn",
          text: `${emoji} *Sentiment:* ${engagement.sentiment}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Their message:*\n>${truncate(engagement.mention.text, 500).replace(/\n/g, "\n>")}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested reply:*\n${truncate(engagement.draftReply, 300)}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Tweet ID: \`${engagement.mention.id}\` | ${new Date(engagement.mention.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve & Reply", emoji: true },
          style: "primary",
          action_id: "approve_engagement",
          value: engagement.mention.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Edit Reply", emoji: true },
          action_id: "edit_engagement",
          value: engagement.mention.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          action_id: "dismiss_engagement",
          value: engagement.mention.id,
        },
      ],
    },
  ];
}

export function buildEditEngagementModal(
  _mentionId: string,
  currentDraft: string,
): Block[] {
  return [
    {
      type: "input",
      block_id: "engagement_reply",
      label: { type: "plain_text", text: "Reply (280 max)" },
      element: {
        type: "plain_text_input",
        action_id: "engagement_reply_input",
        initial_value: currentDraft,
        max_length: 280,
        multiline: true,
      },
    },
  ];
}

export function buildRepostSuggestionCard(
  record: Record<string, unknown>,
): Block[] {
  const postText = (record.post_text as string) || "";
  const platform = (record.platform as string) || "unknown";
  const likes = (record.likes as number) || 0;
  const retweets = (record.retweets as number) || 0;
  const comments = (record.comments as number) || 0;
  const postedAt = record.posted_at
    ? new Date(record.posted_at as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Unknown";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Evergreen Repost Suggestion",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(postText, 300),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:chart_with_upwards_trend: ${platform} | ${postedAt} | ${likes} likes, ${retweets} RTs, ${comments} comments`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Repost", emoji: true },
          style: "primary",
          action_id: "repost_item",
          value: record.id as string,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Cross-post", emoji: true },
          action_id: "crosspost_item",
          value: record.id as string,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          action_id: "dismiss_repost",
          value: record.id as string,
        },
      ],
    },
  ];
}
