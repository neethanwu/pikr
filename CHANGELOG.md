# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-03-24

### Added
- Built-in React source mapping — auto-detects React, maps elements to component name + file:line:col via fiber tree (_debugSource for React 18, _debugStack parsing for React 19+)
- Built-in Vue source mapping — auto-detects Vue 3, maps elements to component name + file path via __vueParentComponent.type.__file
- BasePlugin pattern for easy framework plugin authoring (~30 lines per plugin)
- Auto-start dev server — run `pikr` in a project folder with no server running, it starts `dev` script and opens automatically
- Two-phase onboarding hints: launch hint ("Click the pikr pill") + inspect hint ("Click to capture · Esc to exit"), persisted across navigation
- Pill position persists across same-origin navigation via sessionStorage
- Tauri port 1420 added to auto-detect

### Changed
- Clipboard output includes `source:` line when framework plugin provides file mapping
- All floating chrome (banner, toast, hints) normalized to pill shape (20px radius) with dark theme
- Stronger shadow for better floating visibility on any background
- React 19 _debugStack regex broadened to match any path (not just src/)

### Fixed
- CI uses Node 20 (vitest 4.x requires node:util.styleText)
- CI runs unit tests only (integration tests need Chrome)

## [0.1.0] - 2026-03-22

### Added
- CLI element picker: `pikr`, `pikr <port>`, `pikr <url>` with auto-detect of running dev servers
- Inspector overlay with instant-snap highlight, element label (tag + dimensions), and scroll tracking
- Compact draggable banner pill with Lucide pick icon, 4-edge magnetic snap, coral/lime palette
- Clipboard output in flat readable format (`pikr:`, `url:`, HTML, `styles:`, `ancestry:`)
- JSONL log at `~/.pikr/selections.jsonl` for agent file access
- Port shorthand (`pikr 3000`) and URL without protocol (`pikr localhost:3000`)
- Parallel port scanning with multi-server selection when multiple dev servers are running
- Framework plugin system with auto-discovery from `node_modules` (`pikr-plugin-*`) and `--plugin` flag
- Tauri support via `--connect` for webview debug ports (untested, not advertised)
- Agent skill file (`pikr install-skill`) for deeper agent integration
- Smart style capture: rgb→hex conversion, skip defaults, round subpixel values
- `prefers-reduced-motion` support throughout all animations
- 48 tests (unit + integration + full CDP pipeline)

[Unreleased]: https://github.com/neethanwu/pikr/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/neethanwu/pikr/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/neethanwu/pikr/releases/tag/v0.1.0
