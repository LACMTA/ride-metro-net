# ride-metro-net

An in-development suite of rider-facing tools for [LA Metro](https://www.metro.net), built with [Astro](https://docs.astro.build).

## Architecture

Most pages are statically generated at build time from GTFS schedule data. Real-time data (predictions and service alerts) is served through SSR API routes (`/api/*`) deployed on Netlify, which proxy data from [Swiftly](https://goswift.ly), our real-time alerts and predictions provider.

## Data Sources

- **GTFS** — At build time, [`node-gtfs`](https://www.npmjs.com/package/gtfs) downloads and imports [Metro's static GTFS](https://developer.metro.net/gtfs-schedule-data/) into a SQLite database uses it to generate static pages. In dev mode this database is persisted locally to `./data/data.db` (a `.gitignore`'d working directory) and reused on subsequent starts; in production builds it runs in-memory.
- **Swiftly** — Real-time arrival predictions and service alerts are fetched at request time from Swiftly's API.

## Development Setup

You'll need a Swiftly API key to run the project locally.

> [!WARNING]
> Be sure not to check your API key into your repository on GitHub!

Create a `.env` file in the root of the project:

```
API_KEY=[Your Swiftly API Key]
```

The `.env` file is ignored by `.gitignore`, so you can safely keep the key here on your local device.

## Commands

All commands are run from the root of the project:

| Command               | Action                                                                                                                    |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `npm install`         | Installs dependencies                                                                                                     |
| `npm run dev`         | Starts local dev server at `localhost:4321` (reuses existing GTFS database if present to speed up start)                  |
| `npm run import-gtfs` | Re-downloads and imports the latest GTFS data to `./data/data.db`. Useful for refreshing data during ongoing development. |
| `npm run build`       | Builds production site to `./dist`                                                                                        |
| `npm run test`        | Runs Playwright tests                                                                                                     |
| `npm run astro ...`   | Run CLI commands like `astro add`, `astro check`                                                                          |

## Conventions

The GTFS spec uses `snake_case` naming, whereas JavaScript/TypeScript prefers `camelCase`. This repo uses `camelCase` for variable names throughout.
