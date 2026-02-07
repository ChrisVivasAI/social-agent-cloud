/**
 * Parse the LLM generation to extract the post from inside the <post> tag.
 * If the post cannot be parsed, the original generation is returned.
 */
export function parsePost(generation: string): string {
  const match = generation.match(/<post>([\s\S]*?)<\/post>/);
  if (!match) {
    console.warn("Could not parse post from generation");
  }
  return match ? match[1].trim() : generation;
}

/**
 * Parse the LLM generation to extract the Twitter post from inside the <twitter_post> tag.
 * Falls back to <post> tag, then to the full generation.
 */
export function parseTwitterPost(generation: string): string {
  const match = generation.match(/<twitter_post>([\s\S]*?)<\/twitter_post>/);
  if (match) return match[1].trim();
  return parsePost(generation);
}

/**
 * Parse the LLM generation to extract the LinkedIn post from inside the <linkedin_post> tag.
 * Falls back to <post> tag, then to the full generation.
 */
export function parseLinkedinPost(generation: string): string {
  const match = generation.match(/<linkedin_post>([\s\S]*?)<\/linkedin_post>/);
  if (match) return match[1].trim();
  return parsePost(generation);
}

/**
 * Parse the LLM generation to extract the report from inside the <report> tag.
 */
export function parseReport(generation: string): string {
  const match = generation.match(/<report>([\s\S]*?)<\/report>/);
  if (!match) {
    console.warn("Could not parse report from generation");
  }
  return match ? match[1].trim() : generation;
}

/**
 * Parse the LLM generation to extract a video script JSON from inside the <video_script> tag.
 */
export function parseVideoScript(generation: string): Record<string, unknown> | null {
  const match = generation.match(/<video_script>([\s\S]*?)<\/video_script>/);
  if (!match) {
    console.warn("Could not parse video script from generation");
    return null;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.warn("Failed to parse video script JSON:", error);
    return null;
  }
}

/**
 * Parse the LLM generation to extract the template selection from inside the <template_selection> tag.
 */
export function parseTemplateSelection(generation: string): string | null {
  const match = generation.match(/<template_selection>([\s\S]*?)<\/template_selection>/);
  if (!match) {
    console.warn("Could not parse template selection from generation");
    return null;
  }
  return match[1].trim();
}

/**
 * Parse the LLM generation to extract a quote card JSON from inside the <quote_card> tag.
 */
export function parseQuoteCard(generation: string): Record<string, unknown> | null {
  const match = generation.match(/<quote_card>([\s\S]*?)<\/quote_card>/);
  if (!match) {
    console.warn("Could not parse quote card from generation");
    return null;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.warn("Failed to parse quote card JSON:", error);
    return null;
  }
}

/**
 * Parse the LLM generation to extract a product showcase JSON from inside the <product_showcase> tag.
 */
export function parseProductShowcase(generation: string): Record<string, unknown> | null {
  const match = generation.match(/<product_showcase>([\s\S]*?)<\/product_showcase>/);
  if (!match) {
    console.warn("Could not parse product showcase from generation");
    return null;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.warn("Failed to parse product showcase JSON:", error);
    return null;
  }
}

/**
 * Parse the LLM generation to extract an intake JSON from inside the <intake> tag.
 */
export function parseIntake(generation: string): Record<string, unknown> | null {
  const match = generation.match(/<intake>([\s\S]*?)<\/intake>/);
  if (!match) {
    console.warn("Could not parse intake from generation");
    return null;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.warn("Failed to parse intake JSON:", error);
    return null;
  }
}

/**
 * Parse thread parts from LLM generation. Extracts <thread_part_N> tags.
 */
export function parseThreadParts(generation: string): string[] {
  const parts: string[] = [];
  const regex = /<thread_part_\d+>([\s\S]*?)<\/thread_part_\d+>/g;
  let match;
  while ((match = regex.exec(generation)) !== null) {
    const text = match[1].trim();
    if (text) parts.push(text);
  }
  return parts;
}

/**
 * Truncate text to fit within a character limit, preserving whole words
 */
export function truncateToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const truncated = text.substring(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
}
