import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const parser = new XMLParser();
const FEED_URL = "https://www.weather.gov.sg/files/rss/rssHeavyRain_new.xml";

const ENV_SCHEMA = z.object({
  WEBHOOK_MAIN_URL: z.string().url(),
  WEBHOOK_LOG_URL: z.string().url(),
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

async function log(message: string, type: "info" | "error" = "info") {
  if (process.env.DISABLE_DISCORD === "true") return console.log(message);
  await fetch(env.WEBHOOK_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `${
        type === "info" ? "NEA Warning Log" : "NEA Warning Error"
      }:\n\`\`\`\n${message}\n\`\`\``,
    }),
  });
}

async function pingDiscord(message: string) {
  if (process.env.DISABLE_DISCORD === "true") return console.log(message);
  await fetch(env.WEBHOOK_MAIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

async function checkFeed() {
  try {
    const response = await fetch(FEED_URL).then((r) => r.text());
    const xmlObj = parser.parse(response);
    const { feed } = XML_SCHEMA.parse(xmlObj);
    if (lastUpdated && lastUpdated > feed.updated) return;

    const { summary } = feed.entry;
    console.log(`${new Date().toISOString()} - ${summary}`);

    if (summary === "NIL") return;
    await pingDiscord(summary);
    failedPreviousRun = false;
    lastUpdated = feed.updated;
  } catch (e) {
    if (failedPreviousRun) return;
    failedPreviousRun = true;
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    console.log(`${new Date().toISOString()} - Error: ${message}`);
    await log(message, "error");
    lastUpdated = new Date();
  }
}

await log("Starting NEA Warning Listener");
checkFeed();
if (process.env.NODE_ENV === "production") setInterval(checkFeed, 1000 * 60); // 1 minute
