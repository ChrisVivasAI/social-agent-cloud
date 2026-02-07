import { isValidUrl } from "./urls.js";

const BLACKLISTED_MIME_TYPES = [
  "image/svg+xml",
  "image/x-icon",
  "image/bmp",
  "text/",
];

/**
 * Fetches an image from a URL and returns its buffer and content type
 */
export async function imageUrlToBuffer(imageUrl: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  if (!isValidUrl(imageUrl)) {
    throw new Error("Invalid image URL provided");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";

  return { buffer: imageBuffer, contentType };
}

/**
 * Checks if a MIME type is blacklisted (SVG, ICO, BMP, text)
 */
export function isBlacklistedMimeType(mimeType: string): boolean {
  return BLACKLISTED_MIME_TYPES.some((mt) => mimeType.startsWith(mt));
}

/**
 * Extracts all image URLs from markdown text (both markdown and HTML img syntax)
 */
export function extractAllImageUrlsFromMarkdown(text: string): string[] {
  const urls: string[] = [];
  const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const htmlImgRegex = /<img[^>]+src=["']([^"'>]+)["']/g;

  let match;
  while ((match = markdownRegex.exec(text)) !== null) urls.push(match[2]);
  while ((match = htmlImgRegex.exec(text)) !== null) urls.push(match[1]);

  return urls;
}

/**
 * Gets MIME type from URL based on file extension
 */
export function getMimeTypeFromUrl(url: string): string | undefined {
  try {
    const decodedUrl = decodeURIComponent(url);
    const extensionMatch = decodedUrl.match(/\.([^./\\?#]+)(?:[?#].*)?$/i);
    if (!extensionMatch) return undefined;

    const mimeTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
    };

    return mimeTypeMap[extensionMatch[1].toLowerCase()];
  } catch {
    return undefined;
  }
}
