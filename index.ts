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
  };
}
const nameStatus: NameStatus = {};

// Function to clear console and display current status
function refreshStatusDisplay() {
  console.clear();
  Object.keys(nameStatus).forEach((name) => {
    const status = nameStatus[name];
    if (status) {
      console.log(`${name}: ${status.currentPage}/${status.totalPages}`);
    }
  });
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
  // Initialize status tracking for this name
  nameStatus[name] = { currentPage: 1, totalPages: 10 };
  refreshStatusDisplay();

  const page = await newPage(browser);
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

  await page.close();
  return allEntries;
}

async function scrapeByNames(names: string[]): Promise<Entry[]> {
  // Initialize status tracking for all names
  names.forEach((name) => {
    nameStatus[name] = { currentPage: 0, totalPages: 10 };
  });
  refreshStatusDisplay();

  // Kick off a scrape for each name in parallel
  const allResults = await Promise.all(
    names.map(async (name) => {
      try {
        return await scrapeByName(name);
      } catch (err) {
        console.error(`Failed to scrape "${name}":`, err);
        return []; // on error, return empty list so it won't break Promise.all
      }
    })
  );

  // Flatten the array of arrays into a single array of Entry
  return allResults.flat();
}

const names = [
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
];
console.time("Scraping time");
console.log("Scraping", names.length, "names...");
console.log("This may take a while, please be patient.");
const entries = await scrapeByNames(names);
console.timeEnd("Scraping time");
console.log("All names processed, writing results to disk");
fs.writeFileSync("imenik-results.json", JSON.stringify(entries, null, 2));
console.log(`Done! ${entries.length} entries saved.`);
await browser.close();
console.log("Browser closed, exiting.");
