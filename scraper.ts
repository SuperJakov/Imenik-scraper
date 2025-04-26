import { Page } from "puppeteer";
import { Entry } from "./types";
import { CONFIG } from "./config";
import {
  parseFullName,
  parseCity,
  parseStreet,
  cleanPhoneNumber,
  splitIntoBatches,
  refreshStatusDisplay,
} from "./utils";
import { browser, nameStatus } from "./index";
import { createNewPage } from "./browser";

// Scraping functions
export async function scrapePage(page: Page): Promise<Entry[]> {
  const rawEntries: Entry[] = await page.$$eval(
    "div.ImenikContainerInnerDetails.searchResultLevel3",
    (containers) =>
      containers.map((container) => {
        // Extract address info
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

        // Extract telephone number
        const telElem = container.querySelector<HTMLDivElement>(
          ".imenikSearchResultsRight .imenikTelefon"
        );
        const telephoneNumber = telElem?.textContent?.trim() || "";

        // Extract name
        const fullNameElem =
          container.querySelector<HTMLDivElement>(".resultsTitle");
        const fullName = fullNameElem?.textContent?.trim() || "";

        return { telephoneNumber, street, city, fullName };
      })
  );

  // Process and filter entries
  return rawEntries
    .map((entry) => ({
      ...entry,
      fullName: parseFullName(entry.fullName),
      city: parseCity(entry.city),
      street: parseStreet(entry.street),
      telephoneNumber: entry.telephoneNumber,
    }))
    .filter((entry) => {
      const cleanedNumber = cleanPhoneNumber(entry.telephoneNumber);
      return cleanedNumber.startsWith("09");
    });
}

export async function scrapeByName(name: string): Promise<Entry[]> {
  // Initialize or update status
  if (!nameStatus[name]) {
    nameStatus[name] = { currentPage: 0, totalPages: 10, status: "pending" };
  }

  nameStatus[name].status = "processing";
  nameStatus[name].currentPage = 1;
  refreshStatusDisplay();

  const page = await createNewPage(browser);

  try {
    // Navigate to the website and input search term
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

    // Process first page
    const allEntries: Entry[] = [];
    const firstEntries = await scrapePage(page);
    allEntries.push(...firstEntries);

    // Find pagination links
    const paginationLinks = await page.$$eval(
      'a[href^="show?action=pretraga&type=brzaPretraga&showResultsPage="]',
      (links) =>
        Array.from(
          new Set(links.map((link) => link.getAttribute("href")))
        ).filter(Boolean) as string[]
    );

    // Update total pages info
    if (paginationLinks.length > 0) {
      nameStatus[name].totalPages = paginationLinks.length + 1;
      refreshStatusDisplay();
    }

    // Get base URL for constructing absolute URLs
    const baseUrl = new URL(page.url()).origin;

    // Process each pagination page
    for (let i = 0; i < paginationLinks.length; i++) {
      const linkPath = paginationLinks[i];
      const fullUrl = `${baseUrl}/${linkPath}`;

      nameStatus[name].currentPage = i + 2; // +1 for 0-indexing, +1 for first page
      refreshStatusDisplay();

      await page.goto(fullUrl, { waitUntil: "networkidle2", timeout: 0 });
      const pageEntries = await scrapePage(page);
      allEntries.push(...pageEntries);
    }

    // Mark as completed after all pages processed
    nameStatus[name].status = "completed";
    refreshStatusDisplay();
    return allEntries;
  } finally {
    await page.close();
  }
}

export async function scrapeByNames(names: string[]): Promise<Entry[]> {
  // Initialize status for all names
  names.forEach((name) => {
    nameStatus[name] = { currentPage: 0, totalPages: 10, status: "pending" };
  });
  refreshStatusDisplay();

  // Split names into batches for processing
  const nameBatches = splitIntoBatches(names, CONFIG.BATCH_SIZE);
  let allEntries: Entry[] = [];

  console.log(
    `Processing ${names.length} names in ${nameBatches.length} batches of up to ${CONFIG.BATCH_SIZE}`
  );

  // Process each batch
  for (let batchIndex = 0; batchIndex < nameBatches.length; batchIndex++) {
    const batch = nameBatches[batchIndex];
    if (!batch) continue;

    console.log(`\nStarting batch ${batchIndex + 1}/${nameBatches.length}`);

    // Process names in batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        try {
          return await scrapeByName(name);
        } catch (err) {
          console.error(`Failed to scrape "${name}":`, err);
          if (nameStatus[name]) {
            nameStatus[name].status = "completed";
          }
          refreshStatusDisplay();
          return [];
        }
      })
    );

    allEntries = [...allEntries, ...batchResults.flat()];
    console.log(`Completed batch ${batchIndex + 1}/${nameBatches.length}`);
  }

  return allEntries;
}
