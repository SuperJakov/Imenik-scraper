import { Browser } from "puppeteer";
import fs from "fs";
import { CONFIG } from "./config";
import { Cache, NameStatus } from "./types";
import {
  parseArgs,
  loadCache,
  saveCache,
  saveResults,
  saveResultsToMongoDB,
} from "./utils";
import { initializeBrowser, cleanup } from "./browser";
import { scrapeByNames } from "./scraper";

// State variables
export const nameStatus: NameStatus = {};
export let browser: Browser;
export let cache: Cache = {};

// Main execution function
async function main() {
  try {
    // Parse args
    const args = parseArgs();

    // Load cache unless disabled
    if (!args.disableCache) {
      console.log("Loading cache...");
      cache = loadCache();
      console.log(`Loaded ${Object.keys(cache).length} entries from cache`);
    } else {
      console.log("Cache disabled, will fetch all data fresh");
    }

    // Initialize browser
    browser = await initializeBrowser();

    // Read input file
    const names = JSON.parse(
      fs.readFileSync(args.nameListFile, "utf-8")
    ) as string[];

    // Scrape data
    console.time("Scraping time");
    console.log(
      "Scraping",
      names.length,
      `names in batches of ${CONFIG.BATCH_SIZE}...`
    );
    console.log("This may take a while, please be patient.");

    const entries = await scrapeByNames(names, args.disableCache);
    console.timeEnd("Scraping time");

    // Save final results
    console.log("All names processed, writing final results to disk");
    saveResults(entries, args.minify);

    // Save to MongoDB if flag is provided
    if (args.mongodb) {
      await saveResultsToMongoDB(entries);
    }

    // Save cache unless disabled
    if (!args.disableCache) {
      console.log("Saving cache...");
      saveCache(cache, args.minify);
      console.log(`Saved ${Object.keys(cache).length} entries to cache`);
    }

    console.log(
      `Done! ${entries.length} entries saved.${
        args.minify ? " (minified)" : ""
      }`
    );
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await cleanup();
  }
}

// Register cleanup handlers
process.on("SIGINT", async () => {
  console.log("SIGINT received, closing browser and exiting...");
  await cleanup();
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing browser and exiting...");
  await cleanup();
});

// Start the program
main().catch((error) => {
  console.error("Main execution failed:", error);
  process.exit(1);
});
