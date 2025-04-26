# Imenik Scraper

**Imenik Scraper** is a tool for scraping contact information from [imenik.tportal.hr](https://imenik.tportal.hr/).

It automates searching for the most popular names in Croatia and collects the following data:

- **Full Name**
- **Address**
- **Phone Number**

Only entries with a valid Croatian mobile number (`09...`) are included to avoid scraping non-existent or invalid numbers.

The results are saved into a file called `imenik-results.json` in the project root.

## Bun Runtime

This project uses [Bun](https://bun.sh/), an all-in-one JavaScript runtime like Node.js but much faster.  
Bun handles package management, script running, and building, making the setup simpler and more efficient.

Make sure you have Bun installed before proceeding.

## Installation

Install the project dependencies using Bun:

```bash
bun install
```

## Usage

To start the scraper:

```bash
bun run index.ts
```

You can also pass the `--minify` flag to reduce the size of the scraping output:

```bash
bun run index.ts --minify
```

## Building for Production

To create a more performant build:

```bash
bun run build
```

If you want to build and run immediately:

```bash
bun run build:run
```

## Notes

- `names.json` contains an array of names
- This project uses **Puppeteer** under the hood for headless browser automation.
- Scraped data will be stored in `imenik-results.json`.

## License

This project is licensed under the **Apache License 2.0**.  
See the [LICENSE](./LICENSE) file for more details.
