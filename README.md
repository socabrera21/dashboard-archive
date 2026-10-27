# Dashboard Archive

Dashboard Archive is a local-first macOS app for finding and organizing standalone web dashboards and small web projects. It scans only folders the user selects, then builds a searchable visual catalog with favorites, tags, notes, grouping, duplicate detection, and cached previews.

Built by [Saul Cabrera](https://github.com/socabrera21).

## Why I built it

Web projects tend to scatter across working folders, prototypes, and archives. This app provides one local catalog without moving or modifying the source projects.

## Features

- Index standalone HTML and common React, Vite, Next.js, Vue, and Svelte projects.
- Search project metadata and extracted page text.
- Group and filter by purpose, technology, location, and lifecycle.
- Track favorites, tags, notes, and projects that need review.
- Detect exact-content copies and show missing sources.
- Open the original project in Finder, a browser, or an editor.

## Privacy and file access

- Fresh installs start with no approved folders. Choose one with **Choose folder to start**; the native folder picker adds it to the scan list. Roots already saved by an earlier install remain approved.
- Scanning, catalog data, and preview images stay on the Mac. The app does not move or edit source projects.
- File actions validate paths against the folders the user approved.
- The catalog and cached previews are stored in the app's macOS Application Support directory.
- Remove an approved scan location from **Scan locations**.

## Architecture

- **Renderer:** React, TypeScript, and Vite provide the searchable catalog interface.
- **Desktop shell:** Electron owns folder selection, scanning, SQLite persistence, filesystem watching, previews, and native open/reveal actions.
- **Trust boundary:** a narrow context-isolated preload API connects the renderer to the Electron main process; filesystem operations validate approved roots.

## Run locally

Requires Node.js and macOS for the Electron desktop shell.

```bash
npm ci
npm run dev
```

Build the renderer and Electron bundles with `npm run build`. Package an unsigned local macOS app with `npm run package:mac`.

## Project status

This is a personal portfolio project. It is macOS-focused and is not signed or notarized for distribution. The repository has no license file; contact the author before reusing the code.
