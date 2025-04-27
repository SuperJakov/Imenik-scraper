import { Args, Cache, Entry } from "./types";
import { CONFIG } from "./config";
import { nameStatus } from "./index";
import fs from "fs";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Utility functions
export function parseArgs(): Args {
  const nameListArg = process.argv.find((arg) =>
    arg.startsWith("--name-list=")
  );
  const nameListFile = nameListArg ? nameListArg.split("=")[1] : "names.json"; // Default to names.json if not specified

  return {
    minify: process.argv.includes("--minify"),
    nameListFile,
    disableCache: process.argv.includes("--disable-cache"),
    mongodb: process.argv.includes("--mongodb"),
  };
}

// Cache utility functions
export function loadCache(): Cache {
  try {
    if (fs.existsSync("cache.json")) {
      const cacheData = fs.readFileSync("cache.json", "utf-8");
      return JSON.parse(cacheData);
    }
  } catch (error) {
    console.warn("Error reading cache file:", error);
  }
  return {};
}

export function saveCache(cache: Cache, minify: boolean = false): void {
  try {
    const indentation = minify ? undefined : 2;
    fs.writeFileSync("cache.json", JSON.stringify(cache, null, indentation));
  } catch (error) {
    console.error("Error writing cache file:", error);
  }
}

export function getEntriesFromCache(
  name: string,
  cache: Cache
): Entry[] | null {
  return cache[name] || null;
}

export function splitIntoBatches<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

export function refreshStatusDisplay() {
  console.clear();

  const pending: string[] = [];
  const processing: string[] = [];
  const completed: string[] = [];

  Object.entries(nameStatus).forEach(([name, status]) => {
    if (status.status === "pending") {
      pending.push(`${name}: 0/${status.totalPages}`);
    } else if (status.status === "processing") {
      processing.push(`${name}: ${status.currentPage}/${status.totalPages}`);
    } else if (status.status === "completed") {
      completed.push(`${name}: ${status.totalPages}/${status.totalPages}`);
    }
  });

  console.log("=== CURRENT BATCH ===");
  console.log(
    processing.length > 0
      ? processing.join("\n")
      : "No names currently processing"
  );

  console.log("\n=== QUEUE ===");
  if (pending.length > 0) {
    if (pending.length > 2) {
      console.log(pending.slice(0, 2).join("\n"));
      console.log(`\n... and ${pending.length - 2} more`);
    } else {
      console.log(pending.join("\n"));
    }
  } else {
    console.log("Queue empty");
  }

  console.log("\n=== COMPLETED ===");
  console.log(`${completed.length} names completed`);
}

// String parsing helpers
export function parseFullName(fullName: string): string {
  return fullName
    .split(" ")
    .map((word) =>
      word.length === 0
        ? ""
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

export function parseCity(city: string): string {
  return parseFullName(city);
}

export function parseStreet(street: string): string {
  if (!street) return "";

  const words = street.split(" ");

  return words
    .map((word, index) => {
      if (word.length === 0) return "";

      // Always capitalize first word or words after hyphen
      if (index === 0 || (index > 0 && words[index - 1]?.endsWith("-"))) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }

      // Keep prepositions and conjunctions lowercase when not at beginning
      if (CONFIG.CROATIAN_LOWERCASE_WORDS.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }

      // Keep directional indicators lowercase when not at beginning
      if (CONFIG.DIRECTIONAL_WORDS.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }

      // Capitalize other words (most likely proper nouns)
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function cleanPhoneNumber(number: string): string {
  return number.replace(/\s+/g, "");
}

export function saveResults(entries: Entry[], minify: boolean = false): void {
  try {
    const indentation = minify ? undefined : 2;
    fs.writeFileSync(
      "imenik-results.json",
      JSON.stringify(entries, null, indentation)
    );
    console.log(`Saved ${entries.length} entries to imenik-results.json`);
  } catch (error) {
    console.error("Error writing results file:", error);
  }
}

export async function saveResultsToMongoDB(entries: Entry[]): Promise<void> {
  const mongodbUri = process.env.MONGODB_URI;

  if (!mongodbUri) {
    console.error(
      "Error: MONGODB_URI environment variable is not set in .env file"
    );
    console.error(
      "Please create a .env file with MONGODB_URI=your_connection_string"
    );
    return;
  }

  try {
    console.log("Connecting to MongoDB...");
    const client = new MongoClient(mongodbUri);

    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db("imenik");
    const collection = database.collection("entries");

    console.log(`Saving ${entries.length} entries to MongoDB...`);
    if (entries.length > 0) {
      await collection.insertMany(entries);
    }

    console.log(`Successfully saved ${entries.length} entries to MongoDB`);
    await client.close();
  } catch (error) {
    console.error("Error saving results to MongoDB:", error);
  }
}
