# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/neethanwu/pikr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/neethanwu/pikr/releases/tag/v0.1.0
