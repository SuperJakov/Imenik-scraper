import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";

interface Entry {
  telephoneNumber: string;
  street: string;
  city: string;
  fullName: string;
}

// Status tracking for names being processed
interface NameStatus {
  [name: string]: {
    currentPage: number;
    totalPages: number;
    status: "pending" | "processing" | "completed";
  };
}
const nameStatus: NameStatus = {};

// Function to clear console and display current status
function refreshStatusDisplay() {
  console.clear();

  // Group names by status for better display
  const pending: string[] = [];
  const processing: string[] = [];
  const completed: string[] = [];

  Object.keys(nameStatus).forEach((name) => {
    const status = nameStatus[name];
    if (!status) return;

    if (status.status === "pending") {
      pending.push(`${name}: 0/${status.totalPages}`);
    } else if (status.status === "processing") {
      processing.push(`${name}: ${status.currentPage}/${status.totalPages}`);
    } else if (status.status === "completed") {
      completed.push(`${name}: ${status.totalPages}/${status.totalPages}`);
    }
  });

  console.log("=== CURRENT BATCH ===");
  if (processing.length > 0) {
    console.log(processing.join("\n"));
  } else {
    console.log("No names currently processing");
  }

  console.log("\n=== QUEUE ===");
  if (pending.length > 0) {
    console.log(pending.join("\n"));
  } else {
    console.log("Queue empty");
  }

  console.log("\n=== COMPLETED ===");
  console.log(`${completed.length} names completed`);
}

// Utility function to split array into batches
function splitIntoBatches<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

console.log("Launching browser...");
const browser = await puppeteer.launch({
  headless: true,
  timeout: 0,
});
console.log("Browser launched");

function parseFullName(fullName: string): string {
  // Capitalize the first letter of each word in the name
  const words = fullName.split(" ");
  const capitalizedWords = words.map((word) => {
    if (word.length === 0) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return capitalizedWords.join(" ");
}

// Function to parse city names same as full names
function parseCity(city: string): string {
  // Apply the same capitalization rules as parseFullName
  return parseFullName(city);
}

// Function to parse street names according to Croatian language rules
function parseStreet(street: string): string {
  if (!street) return "";

  // Split the street name into words
  const words = street.split(" ");

  // Special handling for Croatian street names
  return words
    .map((word, index) => {
      // Skip empty words
      if (word.length === 0) return "";

      // Common Croatian prepositions, conjunctions that should be lowercase when not first
      const lowerCaseWords = [
        "i",
        "u",
        "na",
        "kod",
        "do",
        "od",
        "za",
        "iz",
        "s",
        "sa",
        "k",
        "ka",
      ];

      // Common directional indicators
      const directionalWords = [
        "sjever",
        "jug",
        "istok",
        "zapad",
        "sjeverni",
        "južni",
        "istočni",
        "zapadni",
      ];

      // Always capitalize first word or words after hyphen
      if (index === 0 || (index > 0 && words[index - 1]?.endsWith("-"))) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }

      // Keep prepositions and conjunctions lowercase when not at beginning
      if (lowerCaseWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }

      // Keep directional indicators lowercase when not at beginning (unless they're part of a proper name)
      if (directionalWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }

      // Capitalize other words (most likely proper nouns)
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// Function to clean phone number by removing spaces
function cleanPhoneNumber(number: string): string {
  return number.replace(/\s+/g, "");
}

async function newPage(browser: Browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/113.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" ||
      request.resourceType() === "font"
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
  return page;
}

async function scrapePage(page: Page): Promise<Entry[]> {
  const rawEntries: Entry[] = await page.$$eval(
    "div.ImenikContainerInnerDetails.searchResultLevel3",
    (containers) =>
      containers.map((container) => {
        // 1) Street and city
        const addressLi = container.querySelector<HTMLLIElement>(
          "ul.itemContactInfo li.secondColumn"
        );
        let street = "";
        let city = "";
        if (addressLi) {
          const divs = Array.from(
            addressLi.querySelectorAll<HTMLDivElement>("div")
          );
          street = divs[0]?.textContent?.trim() || "";
          const cityLine = divs[1]?.textContent?.trim() || "";
          const parts = cityLine.split(" ");
          city = parts.slice(1).join(" ");
        }

        const telElem = container.querySelector<HTMLDivElement>(
          ".imenikSearchResultsRight .imenikTelefon"
        );
        const telephoneNumber = telElem?.textContent?.trim() || "";

        const fullNameElem =
          container.querySelector<HTMLDivElement>(".resultsTitle");
        const fullName = fullNameElem?.textContent?.trim() || "";

        return { telephoneNumber, street, city, fullName };
      })
  );

  // apply parsing functions to all fields and filter for numbers starting with "09"
  return rawEntries
    .map((entry) => ({
      ...entry,
      fullName: parseFullName(entry.fullName),
      city: parseCity(entry.city),
      street: parseStreet(entry.street),
    }))
    .filter((entry) => {
      const cleanedNumber = cleanPhoneNumber(entry.telephoneNumber);
      return cleanedNumber.startsWith("09");
    });
}

async function scrapeByName(name: string): Promise<Entry[]> {
  // Make sure the name entry exists before trying to update it
  if (!nameStatus[name]) {
    nameStatus[name] = { currentPage: 0, totalPages: 10, status: "pending" };
  }

  // Now we can safely update the properties
  nameStatus[name].status = "processing";
  nameStatus[name].currentPage = 1;
  refreshStatusDisplay();

  const page = await newPage(browser);
  try {
    await page.goto("https://imenik.tportal.hr/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#tko", { timeout: 0 });

    const nameInput = await page.$("#tko");
    if (!nameInput) {
      throw new Error(`Name input not found on the page`);
    }
    await nameInput.focus();
    await nameInput.type(name, { delay: 100 });
    await page.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });

    const allEntries: Entry[] = [];
    const firstEntries = await scrapePage(page);
    allEntries.push(...firstEntries);

    // Extract pagination links for direct navigation
    const paginationLinks = await page.$$eval(
      'a[href^="show?action=pretraga&type=brzaPretraga&showResultsPage="]',
      (links) =>
        Array.from(
          new Set(links.map((link) => link.getAttribute("href")))
        ).filter(Boolean) as string[]
    );

    // Update total pages if we have pagination information
    if (paginationLinks.length > 0) {
      nameStatus[name].totalPages = paginationLinks.length + 1;
      refreshStatusDisplay();
    }

    // Get base URL for constructing absolute URLs
    const baseUrl = new URL(page.url()).origin;

    // Navigate directly to each pagination page instead of clicking links
    for (let i = 0; i < paginationLinks.length; i++) {
      const linkPath = paginationLinks[i];
      const fullUrl = `${baseUrl}/${linkPath}`;

      // Update pagination status
      nameStatus[name].currentPage = i + 2; // +1 for 0-indexing, +1 because we already processed first page
      refreshStatusDisplay();

      await page.goto(fullUrl, { waitUntil: "networkidle2", timeout: 0 });
      const pageEntries = await scrapePage(page);
      allEntries.push(...pageEntries);
    }

    // After scraping is done, mark as completed
    nameStatus[name].status = "completed";
    refreshStatusDisplay();
    return allEntries;
  } finally {
    // Close the page to free up resources
    await page.close();
  }
}

async function scrapeByNames(names: string[]): Promise<Entry[]> {
  // Initialize status tracking for all names as pending
  names.forEach((name) => {
    nameStatus[name] = { currentPage: 0, totalPages: 10, status: "pending" };
  });
  refreshStatusDisplay();

  const BATCH_SIZE = 10;
  const nameBatches = splitIntoBatches(names, BATCH_SIZE);
  let allEntries: Entry[] = [];

  console.log(
    `Processing ${names.length} names in ${nameBatches.length} batches of up to ${BATCH_SIZE}`
  );

  for (let batchIndex = 0; batchIndex < nameBatches.length; batchIndex++) {
    const batch = nameBatches[batchIndex];
    if (!batch) continue; // Skip if batch is undefined

    console.log(`\nStarting batch ${batchIndex + 1}/${nameBatches.length}`);

    // Process each batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        try {
          return await scrapeByName(name);
        } catch (err) {
          console.error(`Failed to scrape "${name}":`, err);
          if (nameStatus[name]) {
            // Check if nameStatus[name] exists
            nameStatus[name].status = "completed"; // Mark as completed even if failed
          }
          refreshStatusDisplay();
          return []; // on error, return empty list so it won't break Promise.all
        }
      })
    );

    allEntries = [...allEntries, ...batchResults.flat()];
    console.log(`Completed batch ${batchIndex + 1}/${nameBatches.length}`);
  }

  return allEntries;
}

// Combine all names and remove duplicates
const names = [
  ...new Set([
    // Existing names
    "Ivan",
    "Marko",
    "Ana",
    "Josip",
    "Maja",
    "Tomislav",
    "Petra",
    "Nikola",
    "Ivana",
    "Mario",

    // New names to add
    "Luka",
    "Jakov",
    "David",
    "Toma",
    "Fran",
    "Roko",
    "Matej",
    "Mateo",
    "Petar",
    "Lovro",
    "Mihael",
    "Niko",
    "Leon",
    "Šimun",
    "Noa",
    "Jan",
    "Borna",
    "Filip",
    "Vito",
    "Leo",
    "Karlo",
    "Teo",
    "Ivano",
    "Ante",
    "Gabriel",
    "Tin",
    "Bruno",
    "Lukas",
    "Viktor",
    "Liam",
    "Toni",
    "Dominik",
    "Oliver",
    "Maro",
    "Marin",
    "Rafael",
    "Adrian",
    "Emanuel",
    "Mauro",
    "Andrej",
    "Erik",
    "Lovre",
    "Patrik",
    "Stjepan",
    "Juraj",
    "Adam",
    "Bepo",
    "Mia",
    "Mila",
    "Marta",
    "Nika",
    "Ema",
    "Lucija",
    "Rita",
    "Eva",
    "Sara",
    "Elena",
    "Klara",
    "Marija",
    "Lara",
    "Sofia",
    "Ena",
    "Lana",
    "Hana",
    "Laura",
    "Lea",
    "Iva",
    "Tena",
    "Franka",
    "Una",
    "Dora",
    "Emili",
    "Tara",
    "Lena",
    "Leona",
    "Magdalena",
    "Tea",
    "Vita",
    "Tia",
    "Iris",
    "Maša",
    "Luce",
    "Sofija",
    "Aurora",
    "Lota",
    "Nikol",
    "Katja",
    "Nora",
    "Bruna",
    "Mara",
    "Roza",
    "Lora",
    "Cvita",
    "Dunja",
    "Kiara",
  ]),
];
console.time("Scraping time");
console.log("Scraping", names.length, "names in batches of 10...");
console.log("This may take a while, please be patient.");
const entries = await scrapeByNames(names);
console.timeEnd("Scraping time");
console.log("All names processed, writing results to disk");
fs.writeFileSync("imenik-results.json", JSON.stringify(entries, null, 2));
console.log(`Done! ${entries.length} entries saved.`);
await browser.close();
console.log("Browser closed, exiting.");
