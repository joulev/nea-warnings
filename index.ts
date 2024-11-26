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
    updated: z.string().datetime({ offset: true }),
    entry: z.object({ summary: z.string() }),
  }),
});

let lastProcessedEntryUpdatedField: string | null;
let failedPreviousRun = false;

async function getFeed() {
  const response = await fetch(FEED_URL).then((r) => r.text());
  const xmlObj = parser.parse(response);
  const { feed } = XML_SCHEMA.parse(xmlObj);
  return feed;
}

function transformMessage(message: string) {
  return message.replaceAll("  ", " ");
}

async function logError(message: string) {
  if (process.env.DISABLE_DISCORD === "true") return;
  await fetch(env.WEBHOOK_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `NEA Warning Error:\n\`\`\`\n${message}\n\`\`\``,
    }),
  });
}

async function pingDiscord(message: string) {
  if (process.env.DISABLE_DISCORD === "true") return;
  await fetch(env.WEBHOOK_MAIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

async function checkFeed(initialise = false) {
  process.stdout.write(`${new Date().toISOString()}... `);
  try {
    const feed = await getFeed();
    if (initialise) {
      lastProcessedEntryUpdatedField = feed.updated;
      return console.log("Initialised");
    }

    if (lastProcessedEntryUpdatedField === feed.updated)
      return console.log("No new updates");

    const { summary } = feed.entry;
    if (summary !== "NIL") await pingDiscord(transformMessage(summary));

    lastProcessedEntryUpdatedField = feed.updated;
    failedPreviousRun = false;
    console.log(summary);
  } catch (e) {
    if (failedPreviousRun) return console.log("Failed again, skipping");
    failedPreviousRun = true;
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    await logError(message);
    console.log(`Error: ${message}`);
  }
}

console.log("Starting NEA Warning Listener");
checkFeed(true);
if (process.env.NODE_ENV === "production") setInterval(checkFeed, 1000 * 60); // 1 minute
