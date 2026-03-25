# pikr

Visual element picker for terminal AI agents. CLI tool that opens Chrome with an inspector overlay.

## Stack
- TypeScript, Node.js 18+, ESM
- puppeteer-core (CDP), commander (CLI), clipboardy (clipboard)
- bun (package manager, test runner), vitest (tests)
- Published as `@neethan/pikr` on npm

## Commands
- `bun run build` — compile TypeScript + copy overlay JS
- `bun vitest run` — run all tests (64 total)
- `bun vitest run tests/unit/` — unit tests only (CI)
- `node dist/cli/index.js` — run locally

## Architecture
- `src/core/` — business logic (browser, inspector, selection, output, plugins, detect, errors)
- `src/cli/` — thin CLI shell
- `src/core/plugins/` — built-in React + Vue source mapping, BasePlugin pattern
- `src/core/inspector-overlay.js` — plain browser JS, injected via CDP, NOT compiled by TypeScript
- Layer rule: CLI imports from `src/core/index.ts` barrel only

## Design Context

### Brand Personality
Fast, minimal, sharp. Opinionated. Arc/Figma-inspired, not generic SaaS.

### Color Palette
- Accent: `#ff6b56` (coral) — the single brand color
- Success: `#a3e635` (aurora lime) — capture confirmation only
- Neutrals: warm stone scale (`#1c1917` dark, `#292524` text, `rgba(255,252,249,0.92)` light)
- No cold grays, no pure black, no purple/blue accents

### Design Principles
1. Invisible until needed — minimum visual footprint
2. Instant feedback — no perceptible delay on any interaction
3. Works on any page — adaptive borders, glassmorphism, warm neutrals
4. One brand moment — coral is the thread, don't dilute
5. Respect reduced motion — all animations collapse to instant
