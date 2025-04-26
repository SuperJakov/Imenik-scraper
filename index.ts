import { Browser } from "puppeteer";
import fs from "fs";
import { CONFIG } from "./config";
import { NameStatus } from "./types";
import { parseArgs } from "./utils";
import { initializeBrowser, cleanup } from "./browser";
import { scrapeByNames } from "./scraper";

// State variables
export const nameStatus: NameStatus = {};
export let browser: Browser;

// Main execution function
async function main() {
  try {
    // Initialize browser
    browser = await initializeBrowser();

    // Parse args and read input file
    const args = parseArgs();
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

    const entries = await scrapeByNames(names);
    console.timeEnd("Scraping time");

    // Save results
    console.log("All names processed, writing results to disk");
    const indentation = args.minify ? undefined : 2;
    fs.writeFileSync(
      "imenik-results.json",
      JSON.stringify(entries, null, indentation)
    );

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
