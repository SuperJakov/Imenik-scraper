import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";

interface Entry {
  telephoneNumber: string;
  street: string;
  city: string;
  fullName: string;
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

  // apply parseFullName in Node context
  return rawEntries.map((entry) => ({
    ...entry,
    fullName: parseFullName(entry.fullName),
  }));
}

async function scrapeByName(name: string): Promise<Entry[]> {
  console.log(`=== Starting scrape for "${name}" ===`);
  const page = await newPage(browser);
  console.log(`Navigating to search page for "${name}"`);
  await page.goto("https://imenik.tportal.hr/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#tko", { timeout: 0 });
  console.log(`Search page loaded for "${name}"`);
  const nameInput = await page.$("#tko");
  if (!nameInput) {
    throw new Error(`Name input not found on the page`);
  }
  await nameInput.focus();
  await nameInput.type(name, { delay: 100 });
  await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });

  console.log(`Search submitted for "${name}"`);
  const allEntries: Entry[] = [];
  console.log(`Scraping first results page for "${name}"`);
  const firstEntries = await scrapePage(page);
  console.log(`Found ${firstEntries.length} entries on first page`);
  allEntries.push(...firstEntries);

  const paginationLinks = await page.$$eval(
    'a[href^="show?action=pretraga&type=brzaPretraga&showResultsPage="]',
    (links) =>
      Array.from(
        new Set(links.map((link) => link.getAttribute("href")))
      ).filter(Boolean)
  );
  for (const link of paginationLinks) {
    const paginationElem = await page.$(`a[href="${link}"]`);
    if (paginationElem) {
      console.log(`Clicking pagination link: ${link}`);
      await paginationElem.click();
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });
      const pageEntries = await scrapePage(page);
      console.log(`Found ${pageEntries.length} entries on ${link}`);
      allEntries.push(...pageEntries);
    }
  }
  await page.close();
  console.log(
    `Finished pages for "${name}", total so far: ${allEntries.length}`
  );
  return allEntries;
}
async function scrapeByNames(names: string[]): Promise<Entry[]> {
  // Kick off a scrape for each name in parallel
  const allResults = await Promise.all(
    names.map(async (name) => {
      try {
        return await scrapeByName(name);
      } catch (err) {
        console.error(`Failed to scrape "${name}":`, err);
        return []; // on error, return empty list so it won’t break Promise.all
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
