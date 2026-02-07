/**
 * Extracts URLs from Slack-style message text containing links in the format:
 * <display_text|https://example.com> or <https://example.com>
 */
export function extractUrlsFromSlackText(text: string): string[] {
  const regex = /<(?:([^|>]*)\|)?([^>]+)>/g;
  const matches = [...text.matchAll(regex)];

  return matches
    .map((match) => match[2])
    .filter((url) => {
      if (url.startsWith("@") || url.startsWith("#")) return false;
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

/**
 * Extracts all URLs from a given string
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return text.match(urlRegex) || [];
}

/**
 * Removes all URLs from a given string
 */
export function removeUrls(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return text.replace(urlRegex, "").replace(/\s+/g, " ").trim();
}

/**
 * Checks if a given string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  try {
    new URL(str);
    return true;
  } catch (error: unknown) {
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.message === "Invalid URL")
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Determines the type of URL (github, youtube, twitter, general)
 */
export type UrlType = "github" | "youtube" | "general" | "twitter" | undefined;

export function getUrlType(url: string): UrlType {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("github")) return "github";
    if (
      parsedUrl.hostname.includes("youtube") ||
      parsedUrl.hostname.includes("youtu.be")
    )
      return "youtube";
    if (
      parsedUrl.hostname.includes("twitter") ||
      parsedUrl.hostname.includes("x.com")
    )
      return "twitter";
    return "general";
  } catch {
    return undefined;
  }
}

/**
 * Removes query parameters from a URL
 */
export function removeQueryParams(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return url;
  }
}
