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

You can also pass the following arguments:

- `--minify` - Reduce the size of the scraping output:

  ```bash
  bun run index.ts --minify
  ```

- `--name-list=<filepath>` - Specify a custom JSON file containing names to search:

  ```bash
  bun run index.ts --name-list=morenames.json # We provide morenames.json
  ```

- `--disable-cache` - Skip using cached results and force fresh scraping:

  ```bash
  bun run index.ts --disable-cache
  ```

- `--mongodb` - Save results to MongoDB in addition to JSON file:
  ```bash
  bun run index.ts --mongodb
  ```

By default, the scraper will look for names in `names.json` if no custom file is specified.

## MongoDB Integration

To use MongoDB for storing scraped data:

1. Create a `.env` file in the project root with your MongoDB connection string:

   ```
   MONGODB_URI=mongodb://your_connection_string
   ```

2. Run the scraper with the `--mongodb` flag to enable MongoDB saving:
   ```bash
   bun run index.ts --mongodb
   ```

Results will be saved to the "imenik" database and "entries" collection in MongoDB.

## Caching

By default, scraped data is stored in a `cache.json` file to avoid re-scraping the same names in future runs. This significantly improves performance for repeated searches. Use the `--disable-cache` flag to bypass the cache if you need fresh data.

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
- [imenik.tportal.hr](https://imenik.tportal.hr/) doesn't have ratelimits

## License

This project is licensed under the **Apache License 2.0**.  
See the [LICENSE](./LICENSE) file for more details.
