# Coffee-Inc-3

A coffee shop business sim that runs as an installable web app on iPhone and iPad (Safari, Add to Home Screen), laid out like Coffee Inc 2. Phase 1: one store, real bookkeeping, and offline progress.

Play it at https://s1xinch.github.io/Coffee-Inc-3/ (deployed from `main` by GitHub Pages).

## What's in the game right now

- An isometric city map as the home screen, with your store's pin and lots for lease.
- Pick a logo, a brand color, and one of three neighborhoods. Each neighborhood has its own foot traffic, rent, and price sensitivity.
- A store screen with your staff talking to you, the café on its street corner, customer reviews (price, product, service, atmosphere), and Service, Product, Marketing, and Finance tabs.
- Buy and upgrade counter equipment, seating, and decor. They all show up in the isometric store view.
- Set menu prices, hire and train baristas, run six marketing campaigns, and handle events that pop up. Anything you ignore is settled automatically when its deadline passes.
- Double-entry books with a weekly income statement, balance sheet, cash flow statement, and bank loans.
- Offline progress. Time away counts as one game day per real hour, capped at two game weeks, and you get a summary when you come back.
- Saves to IndexedDB automatically, with export and import to a JSON file.

The plan and roadmap are in [docs/plans/coffee-inc-3/plan.md](docs/plans/coffee-inc-3/plan.md).

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # simulation unit tests
npm run typecheck
npm run build        # production build with service worker
npm run e2e          # Playwright tests on iPhone and iPad viewports
npm run icons        # regenerate icons and iOS splash screens from scripts/icon.svg
```

If Playwright can't find its bundled Chromium, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Layout

- `src/sim`: the framework-free, deterministic simulation (ledger, demand, staff, incidents, marketing, reviews, weekly close, saves)
- `src/worker`: the Web Worker that runs the game clock off the UI thread
- `src/render`: the Canvas 2D isometric store and city renderers
- `src/ui`: the React screens and tabs
- `src/persistence`: IndexedDB saves, backups, and export/import
- `public`: icons, splash screens, and the privacy and terms pages
