# Coffee-Inc-3

A coffee shop business sim that runs as an installable web app on iPhone and iPad (Safari, Add to Home Screen), laid out like Coffee Inc 2. Phase 3: a coffee company across three cities, with headquarters, plantations, investments, and a stock listing.

Play it at https://s1xinch.github.io/Coffee-Inc-3/ (deployed from `main` by GitHub Pages).

## What's in the game right now

- An isometric city map as the home screen: a 26×26 Seattle with a bay, a lake, piers, boats, a ferry, and six districts. Pins show your stores, the rival chain, and lots for lease.
- Pick a logo, a brand color, and a district for your first store. Each district has its own foot traffic, rent, and price sensitivity.
- Lease more lots to grow into a chain, switch between stores, and close ones that don't pay. Finance and the weekly report break results down by store.
- Hire a manager per store. Managers answer incidents, repair equipment, and hire baristas, and their status is always current.
- Move tables, armchairs, and plants around the floor with arrange mode.
- Expand to Portland and San Francisco. Each city has its own map, wages, fees, and fines, all from one rules table, and fines can be switched off with the local politics setting.
- Open a headquarters with six departments, hire a C-suite, and meet the board every quarter.
- Buy coffee farms in seven growing regions. Harvests fill a bean warehouse that your stores use first.
- Invest in stocks and real estate, buy your stores' buildings, take the company public, split shares, and pay dividends to yourself and other shareholders.
- A rival chain, Northline Coffee, competes for customers in the districts it's in, answers your prices, and keeps expanding.
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

- `src/sim`: the framework-free, deterministic simulation (cities and rules, ledger, demand, staff, managers, layouts, rival, headquarters, plantations, markets, incidents, marketing, reviews, weekly close, saves)
- `src/worker`: the Web Worker that runs the game clock off the UI thread
- `src/render`: the Canvas 2D isometric store and city renderers
- `src/ui`: the React screens and tabs
- `src/persistence`: IndexedDB saves, backups, and export/import
- `public`: icons, splash screens, and the privacy and terms pages
