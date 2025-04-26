import puppeteer, { Browser, Page } from "puppeteer";
import { CONFIG } from "./config";
import { browser } from "./index";

// Browser functions
export async function initializeBrowser(): Promise<Browser> {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    timeout: 0,
  });
  console.log("Browser launched");
  return browser;
}

export async function createNewPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  await page.setUserAgent(CONFIG.USER_AGENT);
  await page.setViewport(CONFIG.VIEWPORT);
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    const url = request.url().toLowerCase();

    if (
      CONFIG.BLOCKED_RESOURCE_TYPES.has(request.resourceType()) ||
      CONFIG.BLOCKED_DOMAINS.some((domain) => url.includes(domain))
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });

  return page;
}

// Cleanup function
export async function cleanup() {
  console.log("Finishing up...");
  console.log("Closing browser...");
  if (browser && browser.connected) {
    await browser.close();
  }
}
