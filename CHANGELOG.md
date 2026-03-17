# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-03-17

### Security

- **File access restricted to workspace**: Images, stylesheets, and `:[include](file.md)` paths are now validated against the workspace root. Traversal attempts (`../`, encoded variants, symlinks pointing outside the workspace) are blocked.
- **Safer PDF export**: Temp files are written to unpredictable directories and always cleaned up, even on failure.
- **Chromium sandbox enabled by default**: `--no-sandbox` is no longer passed unconditionally. On Linux, the extension tries with sandbox first and only falls back if the system reports sandbox unavailability.
- **Event handler attributes blocked**: All `on*` attributes (e.g. `onclick`, `ondrop`, `onanimationend`) are now stripped from sanitized HTML, not just a hardcoded subset.

### Changed

- `:[include](file.md)` processing is now built-in (previously handled by `markdown-it-include`). Includes are limited to 10 levels of nesting and circular references are detected.

### Breaking Changes

- **Local file references are restricted to the workspace root by default.** Images, includes, and stylesheets that reference files outside the open workspace will be blocked. Set `markdown-pdf.allowPathsOutsideWorkspace: true` to restore the previous behaviour.

### Added

- `markdown-pdf.allowPathsOutsideWorkspace` (boolean, default: `false`): Allow images, includes, and stylesheets to reference files outside the workspace root. Useful for shared stylesheets (e.g. `/projects/shared/style.css`). Disabling this (the default) prevents path traversal attacks.

## [2.0.0] - 2026-03-07

This release takes over from `yzane.markdown-pdf`, which has had no maintainer
activity since late 2023 (256 open issues, 35+ open PRs). The focus is privacy,
offline capability, and a reduced feature set that works correctly.

### Added
- Footnote support via `markdown-it-footnote` (`[^1]` syntax)
  (closes [#131](https://github.com/yzane/vscode-markdown-pdf/issues/131))
- GitHub-style callout blocks: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]`, `> [!CAUTION]`
  (closes [#364](https://github.com/yzane/vscode-markdown-pdf/issues/364))
- `markdown-pdf.timeout` setting: configurable export timeout in milliseconds (default: 60000). Prevents navigation timeout errors on large documents
  (closes [#189](https://github.com/yzane/vscode-markdown-pdf/issues/189))
- KaTeX math rendering: `$...$` inline, `$$...$$` display
  (closes [#21](https://github.com/yzane/vscode-markdown-pdf/issues/21),
  [#276](https://github.com/yzane/vscode-markdown-pdf/issues/276),
  [#199](https://github.com/yzane/vscode-markdown-pdf/issues/199),
  [#167](https://github.com/yzane/vscode-markdown-pdf/issues/167))
- DOMPurify HTML sanitization: patches CVE-2024-7739
- Mermaid render wait before PDF capture — diagrams no longer appear as raw text
  (closes [#342](https://github.com/yzane/vscode-markdown-pdf/issues/342),
  [#365](https://github.com/yzane/vscode-markdown-pdf/issues/365),
  [#290](https://github.com/yzane/vscode-markdown-pdf/issues/290))
- Mermaid rendered locally from bundled `mermaid.min.js` — no CDN calls
  (closes [#30](https://github.com/yzane/vscode-markdown-pdf/issues/30),
  [#312](https://github.com/yzane/vscode-markdown-pdf/issues/312))
- TypeScript source with strict mode enabled
- esbuild bundle pipeline (`src/` -> `dist/extension.js`); pure-JS deps bundled into output, .vsix size ~11MB
- Cross-platform Chrome auto-detection (macOS, Linux, Windows)
  (closes [#336](https://github.com/yzane/vscode-markdown-pdf/issues/336))
- `github.css` syntax highlight theme as default

### Changed
- puppeteer-core: 2.1.1 -> 24.x (uses system Chrome, no bundled Chromium)
- All dependencies updated to current versions; 0 production CVEs
- Default margins: 2cm top/bottom, 2.5cm left/right (was 1.5cm/1cm/1cm/1cm)
- `displayHeaderFooter` default: `false` (was `true`)
- `markdown-it-anchor` replaces `markdown-it-named-headers` (ReDoS CVE in upstream)
- Settings count: ~30 -> 21

### Removed
- PlantUML support (sent diagram source to `plantuml.com`; use Mermaid instead)
- PNG/JPEG export
- Chromium auto-download (`createBrowserFetcher` removed in puppeteer v20)
  (closes [#341](https://github.com/yzane/vscode-markdown-pdf/issues/341))
- Settings: `scale`, `pageRanges`, `width`, `height`, `includeDefaultStyles`,
  `stylesRelativePathFile`, `outputDirectoryRelativePathFile`,
  `StatusbarMessageTimeout`, `debug`, `markdown-it-include.enable`

### Fixed
- Mermaid diagrams in PDF (Chromium 80 -> current; added async render wait)
- KaTeX single-line display math (`$$formula$$` on one line was not matched)
- `spawn Unknown system error -86` on macOS Ventura and later
  (closes [#336](https://github.com/yzane/vscode-markdown-pdf/issues/336))
- Inline `code` styling in PDF output (washed-out colour restored)
  (closes [#103](https://github.com/yzane/vscode-markdown-pdf/issues/103))
- YAML frontmatter `title:` now used in PDF header/footer `<span class='title'>`
  (closes [#193](https://github.com/yzane/vscode-markdown-pdf/issues/193))
- `%%ISO-DATE%%`, `%%ISO-DATETIME%%`, `%%ISO-TIME%%` tokens work in header/footer templates
  (closes [#210](https://github.com/yzane/vscode-markdown-pdf/issues/210))
- Style paths in `markdown-pdf.styles` now resolve relative to the source `.md` file first, then workspace root
  (closes [#126](https://github.com/yzane/vscode-markdown-pdf/issues/126))
- User CSS injected into PDF header/footer renderer context (Puppeteer renders header/footer in a separate context where `<link>` tags are ignored)
  (closes [#75](https://github.com/yzane/vscode-markdown-pdf/issues/75))

### Security
- Patched CVE-2024-7739: XSS via unsanitized HTML in markdown blocks
  (closes [#411](https://github.com/yzane/vscode-markdown-pdf/issues/411))
- Removed bundled Chromium with known CVEs; extension now uses system Chrome
  (closes [#341](https://github.com/yzane/vscode-markdown-pdf/issues/341))
- `npm audit --omit=dev`: 0 vulnerabilities
