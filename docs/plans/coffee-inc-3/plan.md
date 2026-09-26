# Implementation Plan: Coffee Inc 3 (Apple Web App)

## Overview

Coffee Inc 3 is a from-scratch, installable web app (PWA) for iPhone/iPad Safari that continues the Coffee Inc 2 (Side Labs LLC) business-simulation/tycoon formula: grow a single cafe into a coffee empire spanning stores, corporate departments, plantations, and public markets. It is not a port — the repo currently has no code, only a README — so this plan covers the full build from an empty project.

Goals, in priority order:
1. Keep everything players liked about Coffee Inc 2 (deep, realistic business sim layered under a charming store-management game).
2. Fix the specific bug classes Coffee Inc 2 is known for (below), by construction — not by patching after the fact.
3. Add meaningfully new systems, not just more numbers.
4. Ship as a proper Apple "Add to Home Screen" web app: installable, offline-capable, fast on WebKit/iOS Safari.

## Decisions Log

**2026-09-26 (owner review)**
- MVP scope: **single store first** (Phase 1 below).
- Art style: **keep Coffee Inc 2's look** (clean isometric cafe, warm materials, simple charming characters, dashboard-style finance screens).
- Phase 2: owner delegated the choice. Chosen: **"Grow to a local chain"** (see Phase 2), because scaling past one store is the next thing a single-store player wants, and it forces the two systems Coffee Inc 2 got most wrong at scale (delegated managers and custom layouts) to be built right before anything bigger sits on top of them.

**Defaults applied to the still-open questions** (easy to change later, none block the MVP):
- Monetization: none in the MVP. Revisit before launch; no pay-to-win either way.
- Save/sync: local-only (IndexedDB) plus JSON export/import. Account-based cloud save stays a later phase.
- Devices: iPhone portrait first, layout also works on iPad and desktop Safari.
- Timeline: none set.

**Implementation simplifications for the MVP** (vs. the original architecture section):
- One package, with `src/sim` kept framework-free (no React/DOM imports) instead of a monorepo. Same boundary, less tooling.
- Money is **integer cents** guarded by `Number.isSafeInteger` (exact up to ~$90 trillion, throws loudly instead of losing precision). `decimal.js`/`BigInt` gets introduced with the stock market in Phase 3, where share counts actually need it.
- Storage uses `idb-keyval` for the save blob; schema versioning and migrations live in the sim (`save.ts`), so the storage library stays swappable.
- The store view uses plain Canvas 2D instead of PixiJS. One room with a few dozen shapes doesn't need WebGL, and Canvas 2D avoids iOS WebGL context loss when the app is backgrounded. PixiJS can come back for the Phase 2 city map if it's needed.
- New companies start paused, so the clock doesn't run up rent while you read the setup checklist.

## Research Summary: Coffee Inc 2

**Core systems** (source: App Store listing, MWM/Side Labs game pages, player guides):
- Store management: custom interiors/exteriors, equipment, menu & pricing, product R&D.
- Staff: hiring, training, motivation; delegate day-to-day ops to a store manager; random staff/customer incidents.
- Corporate layer: HQ departments — HR, Finance, Marketing, Products, Engineering, Executive, Investment. C-level executives, stock options, board meetings, exec pay, dividends.
- Real financial statements: income statement, balance sheet, cash flow statement. Personal wealth kept separate from company finances.
- Expansion: multi-city, IPO/going public via investment banks, stock market + real estate investing through the Investment division, M&A.
- Plantations: buy/operate coffee plantations across 7 world regions, grow and harvest beans, manage farm-to-cup quality, feeds the store supply chain.
- Online expansion: build online services/apps beyond physical cafes.
- Cross-device continuity via iCloud sync.
- **Visual style**: not pixel art — clean, modern isometric store/city views with charming character and store art, plus dashboard-style screens (spreadsheets, charts) for the finance/corporate layer.

**Known Coffee Inc 2 bug/complaint classes** (source: App Store reviews, player reports) — this is the improvement backlog:
1. Random/glitchy bankruptcy triggers despite healthy accounts and turnover.
2. Crashes tied to specific custom interior layouts.
3. Crashes when visiting new plantation regions on some devices.
4. Crash when stock share count grows very large.
5. Instability/crash after weekly-tick processing ("ending the week").
6. UI glitches when clicking into a store/business.
7. Supply-chain bug: delegated managers stop selling beans; supply values get stuck.
8. Logic bug: disabling a "politics" toggle doesn't actually suppress the region-specific fines it's supposed to.
9. General instability compounding frustration with IAP-heavy monetization.
10. Grind-heavy late game.

Sources: [Coffee Inc 2 – App Store](https://apps.apple.com/us/app/coffee-inc-2/id1573482724), [Coffee Inc 2 – MWM](https://mwm.ai/apps/coffee-inc-2/1573482724), [Coffee Inc 2 – Side Labs](https://www.sidelabs.com/coffeeinc2/), [Coffee Inc. 2 Beginner's Guide – Level Winner](https://www.levelwinner.com/coffee-inc-2-beginners-guide-tips-tricks-strategies-to-build-a-coffee-empire/).

## Requirements & Assumptions

Explicit assumptions made to keep this plan concrete (flagged as **Open Questions** below where they need your decision):

- [INFER-HIGH] "Apple web app" = installable PWA for iOS/iPadOS Safari (manifest + apple-mobile-web-app meta tags + service worker), not a native Swift/App Store app.
- [INFER-MEDIUM] "Keep the art style" = adopt Coffee Inc 2's actual visual direction (clean isometric store/city art + dashboard-style finance screens), since this repo has no existing assets to reuse literally.
- [INFER-MEDIUM] Dashboard/UI chrome (menus, settings, marketing screens) follows your standing web-build preferences: no purple gradients, no pill buttons, no fake reviews/metrics, no vague hero copy, no emoji-as-icons, no em dashes in copy, no over-the-top scroll/cursor animations, no AI-slop art or copy.
- [INFER-LOW] Single developer/small team, so the plan favors a small, well-tested tech stack over a large service architecture.
- [INFER-LOW] MVP targets iPhone Safari first, iPad/responsive desktop Safari as a fast-follow (see Open Questions).

## Target Architecture

**Stack**
- **Framework**: React + TypeScript, built with Vite.
- **World/store rendering**: PixiJS (WebGL) for the isometric store/city view — smooth on iOS Safari, isolated from the DOM so a bad render can't take down the UI around it.
- **Dashboard UI**: React + CSS (no Tailwind purple/pill defaults — custom design tokens per your visual preferences), for financial statements, HR, marketing, investment screens.
- **Simulation engine**: a standalone, framework-free TypeScript package (`packages/sim`). Pure, deterministic, replayable reducer over an immutable game-state tree. No DOM/rendering imports — this is what makes the bug classes below fixable and unit-testable.
- **Tick processing**: runs inside a Web Worker, message-passed to the UI thread. UI never blocks on a heavy weekly close.
- **Big numbers**: `decimal.js` (or `break_infinity.js`) for all money and share-count math — never native `number` for currency.
- **Persistence**: IndexedDB via Dexie.js, versioned schema with explicit migrations, autosave + manual save slots, JSON export/import (backup + share).
- **PWA shell**: `vite-plugin-pwa`, custom `manifest.json`, `apple-touch-icon`, `apple-mobile-web-app-capable`/`apple-mobile-web-app-status-bar-style` meta tags, `display: standalone`, iOS splash screens for common device sizes, service worker with offline app-shell caching.
- **Testing**: Vitest for the sim engine (each Coffee Inc 2 bug class becomes a regression test — see Testing Strategy), Playwright for end-to-end flows with iOS Safari viewport/user-agent emulation.
- **Error handling**: React error boundaries around independent UI regions (store view, each dashboard panel) so one bad component can't crash the whole app; optional opt-in client error reporting.

**Why this shape fixes the known bug classes**

| Coffee Inc 2 issue | Root-cause pattern | Coffee Inc 3 design that prevents it |
|---|---|---|
| Random bankruptcy despite healthy books | Cached/derived balance drifts from ledger | Single source of truth: a append-only transaction ledger; displayed balance is always *computed* from it, never stored separately |
| Crash on custom interior layouts | Unvalidated layout data reaching the renderer | Layout schema validated on save and load; each placed item renders in its own error boundary; corrupt/out-of-range items are dropped with a warning, not a crash |
| Crash visiting new plantation regions | Region assets loaded ad hoc, no failure path | Regions are versioned, schema-validated data bundles with default/fallback assets and retry-with-backoff loading; core app ships with all region data pre-bundled (no mid-session network dependency) |
| Crash on large share counts | Native float overflow/precision loss | All shares/money use `decimal.js`; unit tests assert correctness at 10^15+ scale |
| Instability after weekly tick | One giant synchronous tick loop on the UI thread | Tick logic is a pure reducer run in a Web Worker; large catch-up periods (e.g. returning after days offline) are processed in bounded chunks, not one unbounded loop |
| UI glitch entering a store | Shared/global UI state leaking between screens | Each store/business view is an isolated route with its own state slice; navigation never mutates shared state as a side effect |
| Delegated manager "stuck" supply | Implicit state with no self-check | Each store/manager modeled as an explicit finite-state machine (Idle → Selling → OutOfStock → Restocking); every tick asserts invariants and self-heals or flags an alert instead of silently freezing |
| Politics toggle doesn't suppress fines | Ad-hoc `if` checks scattered across fee code | Regional rules live in one config-driven rules table (region → active rule set); the toggle simply selects which rule set applies — unit tested per region |
| Grind-heavy late game | Single unbounded number-go-up track | Multiple parallel progression tracks + a prestige/"Franchise" reset with permanent bonuses (see New Systems) so late game adds breadth, not just bigger numbers |

## New Systems (beyond Coffee Inc 2)

Proposed additions, roughly in build order:
1. **Competitor cafes** — simple AI-run rival chains that react to your pricing/marketing and contest market share per city (adds strategy without needing multiplayer).
2. **Recipe R&D tree** — unlockable drink recipes, seasonal/limited-time menu items, tied to plantation bean quality.
3. **Seasonal/weather events** — regional weather affects plantation yield and store demand (e.g., a cold snap spikes hot-drink demand in one city).
4. **Barista skill trees** — light RPG-style progression for named staff, separate from the manager FSM.
5. **Sustainability/ethical-sourcing meter** — affects brand reputation and how much premium pricing customers will tolerate.
6. **Franchise Reset (prestige)** — voluntary reset of a city/company for permanent global bonuses, giving the late game a real decision point instead of pure grind.
7. **Achievements & collection log** — real, locally-tracked milestones (explicitly not fake counters/social proof).
8. **Photo-mode for your store** — export a real screenshot of your own custom store to share (no stock "customer photos").

## Platform Plan: Apple Web App Specifics

- **Install**: `manifest.json` (name, icons, `display: standalone`, theme colors) + `apple-touch-icon` + `apple-mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style` + per-device splash screen images.
- **Offline idle progress**: no background timers exist once Safari suspends the tab — progress is *always* computed from `(now - lastSeenTimestamp)` on resume/foreground, run through the same tick reducer in bounded chunks, with a cap on maximum catch-up to avoid a multi-minute freeze after a long absence.
- **Storage risk**: iOS Safari can evict IndexedDB data for web apps not opened in ~7 days (Intelligent Tracking Prevention). Mitigation: prominent "export your save" reminder, and (if approved) an account-based cloud save as the real fix — see Open Questions.
- **No real iCloud from a web app**: Coffee Inc 2's iCloud sync cannot be replicated by a plain PWA. If cross-device sync matters, it requires a small backend (account + save blob storage), proposed as a later phase, not MVP.
- **Distribution**: no App Store listing/review process — discovery is via a shared URL + "Add to Home Screen," which changes launch/marketing strategy versus Coffee Inc 2.

## Tasks

### Phase 0 — Foundations
**Task 0.1 — Project scaffold**
What: Vite + React + TypeScript monorepo (`apps/web`, `packages/sim`), lint/format/CI.
Files: `package.json`, `vite.config.ts`, `packages/sim/*`, `.github/workflows/ci.yml`.
Dependencies: None.

**Task 0.2 — PWA shell**
What: manifest, Apple meta tags, service worker, app icons/splash screens, offline app-shell caching.
Files: `public/manifest.json`, `index.html`, `public/icons/*`, `vite.config.ts` (PWA plugin).
Dependencies: 0.1.

**Task 0.3 — Sim engine skeleton**
What: immutable game-state type, pure reducer, Web Worker harness, `decimal.js` money type, Vitest set up with the bug-class regression tests stubbed (failing first, per fix-by-construction goal).
Files: `packages/sim/state.ts`, `packages/sim/reducer.ts`, `packages/sim/worker.ts`, `packages/sim/*.test.ts`.
Dependencies: 0.1.

**Task 0.4 — Persistence skeleton**
What: Dexie schema v1, autosave, export/import JSON.
Files: `apps/web/src/persistence/*`.
Dependencies: 0.1, 0.3.

### Phase 1 — MVP Core Loop
**Task 1.1 — Single store gameplay**: hiring, menu/pricing, equipment, isometric store view (PixiJS), one city.
**Task 1.2 — Weekly financial close**: income statement, balance sheet, cash flow, ledger-based balance (fixes bug #1), chunked worker tick (fixes bug #5).
**Task 1.3 — Offline/idle progress**: resume-time catch-up calculation with capped chunking.
**Task 1.4 — Save/load + export**: wired to Phase 0 persistence, with the "back up your save" prompt.

### Phase 2 — Grow to a Local Chain (chosen 2026-09-26)
**Task 2.1 — Store manager FSM** (fixes bug #7): hire a manager per store; explicit states (Staffing, Operating, Restocking, NeedsAttention), self-healing invariant checks every tick, UI badge when a store needs you.
**Task 2.2 — Custom interior editor** (fixes bug #2): drag-to-place on the isometric grid, schema-validated layout, per-item error boundaries, layout affects flow and seating.
**Task 2.3 — Multiple stores in the first city**: isometric city map with lots to lease, per-store P&L rolled up into company statements, store switcher.
**Task 2.4 — Marketing basics**: local campaigns (flyers, social, loyalty card) with a measurable, honest effect on traffic.
**Task 2.5 — One rival cafe chain** (pulled forward from Phase 4.1): a single AI competitor in the city that reacts to your prices, so growth has real tension.

Moved to Phase 3: multi-city expansion with the per-city regional rules table (fixes bug #8), and HQ departments.

### Phase 3 — Multi-City, Plantations, Full Corporate Suite, Markets
**Task 3.0 — Multi-city expansion + HQ departments v1** (fixes bug #8): city unlock flow, config-driven per-city rules table, HR/Finance/Marketing departments.
**Task 3.1 — Plantations & supply chain** (fixes bug #3): versioned region data bundles, fallback assets, retry/backoff loading, bundled offline-first.
**Task 3.2 — Engineering/Executive/Investment departments**: C-level hiring, board meetings, dividends.
**Task 3.3 — Stock market/IPO** (fixes bug #4): `decimal.js`-backed share math, unit-tested at extreme scale; real estate investing.

### Phase 4 — New Systems
**Task 4.1 — Competitor cafes** (market-share AI).
**Task 4.2 — Recipe R&D + seasonal events.**
**Task 4.3 — Barista skill trees + sustainability meter.**
**Task 4.4 — Franchise reset (prestige) + achievements/collection log.**

### Phase 5 — Polish & Launch
**Task 5.1 — Art pass**: consistent isometric/store art + dashboard visual system per your design preferences (favicon included).
**Task 5.2 — Performance/QA on iOS Safari**: real-device testing, memory profiling for the PixiJS view, storage-eviction UX.
**Task 5.3 — Monetization wiring** *(pending your decision, see Open Questions)*.
**Task 5.4 — Backend/save-sync** *(pending your decision, see Open Questions)*.
**Task 5.5 — Launch checklist**: favicon, no "Made with AI" tag anywhere, Privacy Policy page, Terms & Conditions page.

## Parallelization Opportunities

- **Batch A** (after Phase 0): Task 1.1 (store view) and Task 1.2 (financial close) can proceed in parallel — one is rendering, the other is sim logic.
- **Batch B** (Phase 2): Task 2.1 (manager FSM) and Task 2.2 (interior editor) are independent; Task 2.3 depends on both.
- **Batch C** (Phase 3): Task 3.1 (plantations) and Task 3.2 (corporate departments) are independent; Task 3.3 depends on 3.2.
- **Batch D** (Phase 4): all four tasks are largely independent content additions and can be built/reviewed in parallel once Phase 3 lands.

Default assumption is otherwise sequential within a phase, since later phases build on earlier data models.

## Testing Strategy

- Every row in the bug-class table above ships as a **named regression test** in `packages/sim` before the corresponding feature is considered done (e.g. `weekly-close.test.ts: "processes 30 days offline without blocking or losing precision"`).
- Property-based tests on the ledger (`sum(transactions) === displayed balance`, always) to kill the "phantom bankruptcy" class outright.
- Playwright smoke test simulating iOS Safari (viewport + UA) covering: install prompt/manifest present, offline reload, save export/import.

## Risks

- **No true iCloud sync from a web app** — cross-device continuity needs a backend if you want it; flagged as an open decision, not silently assumed.
- **iOS Safari storage eviction** after ~7 days idle — mitigated by export reminders, not fully solvable without a backend.
- **No background execution** — offline progress must be resume-computed; very long absences need a capped catch-up to avoid a multi-second/minute freeze on reopen.
- **WebGL performance on older iPhones** — PixiJS view needs a tested fallback (reduced draw calls/sprite count) for older A-series chips.
- **Scope** — this is effectively a full tycoon game; Phases 3–4 are substantial. Recommend treating Phase 1 as the actual "MVP" milestone and re-scoping Phases 3–5 after seeing it in hand.

## Key Decisions Needed From You (before coding starts)

1. **Art direction** — confirm: adopt Coffee Inc 2's clean isometric/illustrated look for the game world, with dashboard chrome following your standard web-build preferences (no purple gradients, pill buttons, emoji icons, AI-slop art/copy, etc.)? Or do you have specific reference art/a different direction in mind?
2. **Monetization** — free with cosmetic-only IAP, one-time premium unlock, no monetization at all, or something else? (Coffee Inc 2's heavy IAP was a named complaint — recommend avoiding pay-to-win regardless.)
3. **Backend/save-sync** — ship MVP as local-only (IndexedDB + manual export/import), or invest in an account + backend now for real cross-device sync? This is the one item that meaningfully changes the tech stack if decided later.
4. **MVP scope** — is Phase 1 (single city, single store, real financial close, offline progress) the right cut for a first playable, or do you want multi-store/delegation in the first milestone?
5. **Device target** — iPhone Safari only for launch, or iPad/desktop Safari responsive layout from day one?
6. **Timeline** — any deadline or milestone cadence you're targeting?
