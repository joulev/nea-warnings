import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const parser = new XMLParser();
const FEED_URL = "https://www.weather.gov.sg/files/rss/rssHeavyRain_new.xml";

const ENV_SCHEMA = z.object({
  WEBHOOK_SUCCESS_URL: z.string().url(),
  WEBHOOK_FAILURE_URL: z.string().url(),
});
const env = ENV_SCHEMA.parse(process.env);

const XML_SCHEMA = z.object({
  feed: z.object({
    updated: z.coerce.date(),
    entry: z.object({ summary: z.string() }),
  }),
});

let lastUpdated: Date | null = null;
let failedPreviousRun = false;

async function pingDiscord(message: string, error = false) {
  const content = !error
    ? message
    : `Rain warning webhook failed:\n\`\`\`\n${message}\n\`\`\``;
  if (process.env.DISABLE_DISCORD === "true") return console.log(content);

  const url = error ? env.WEBHOOK_FAILURE_URL : env.WEBHOOK_SUCCESS_URL;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function checkFeed() {
  try {
    const response = await fetch(FEED_URL).then((r) => r.text());
    const xmlObj = parser.parse(response);
    const { feed } = XML_SCHEMA.parse(xmlObj);
    if (lastUpdated && lastUpdated > feed.updated) return;

    const { summary } = feed.entry;
    if (summary === "NIL") return;
    await pingDiscord(summary);
    failedPreviousRun = false;
  } catch (e) {
    if (failedPreviousRun) return;
    failedPreviousRun = true;
    await pingDiscord(
      e instanceof Error ? e.message : "Unknown error occurred",
      true
    );
  } finally {
    lastUpdated = new Date();
  }
}

checkFeed();
if (process.env.NODE_ENV === "production") setInterval(checkFeed, 1000 * 60); // 1 minute
