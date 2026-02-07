import * as cheerio from "cheerio";

/**
 * Fetches and extracts the main text content from a webpage.
 * Removes common non-content elements (scripts, styles, nav, footer).
 */
export async function getPageText(url: string): Promise<string | undefined> {
  try {
    new URL(url);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script").remove();
    $("style").remove();
    $("head").remove();
    $("nav").remove();
    $("footer").remove();
    $("header").remove();

    const images = $("img")
      .map((_, img) => {
        const alt = $(img).attr("alt") || "";
        const src = $(img).attr("src") || "";
        return `[Image: ${alt}](${src})`;
      })
      .get();

    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .replace(/\n+/g, " ")
      .trim();

    return `${text}\n\n${images.join("\n")}`;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching page: ${error.message}`);
    }
    return undefined;
  }
}
