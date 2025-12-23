# Welcome!

## Overview

This project uses [Astro](https://docs.astro.build), and relies on the [`node-gtfs`](https://www.npmjs.com/package/gtfs) to import data to an in-memory SQLite database which is used to generate static pages. The project is set up for deployment on Cloudflare.

## Development

This project relies on data from Swiftly, our realtime predictions provider, and as such you will need an Swiftly API key.

> [!WARNING]
> Be sure not to check your API key into your repository on GitHub!

Create a `.env` file in the root of the project defining your key as such:

```
API_KEY=[Your Swiftly API Key]
```

The `.env` file is ignored by `.gitignore`, so you can safely keep the key here on your local device for development.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                                                                                |
| :------------------------ | :---------------------------------------------------------------------------------------------------- |
| `npm install`             | Installs dependencies                                                                                 |
| `npm run dev`             | Imports latest GTFS data to in-memory SQLite database and starts local dev server at `localhost:4321` |
| `npm run build`           | Builds production site to `./dist/`                                                                   |
| `npm run preview`         | Preview build locally, before deploying                                                               |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check`                                                      |
| `npm run astro -- --help` | Get help using the Astro CLI                                                                          |

## Typing and Variable Naming

The GTFS spec uses snake_case naming, whereas JavaScript/TypeScript prefers camelCase as a convention. There's no obvious solution to this. This repo follows the convention of using camelCase for variable names, and converts data imported from GTFS using [`ts-case-convert`](https://www.npmjs.com/package/ts-case-convert).
