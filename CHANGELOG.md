# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-03-17

### Security

- **Path traversal hardening**: All local file references (images, includes, stylesheets) are now validated against an allowed root directory. Paths using `../` sequences, percent-encoded traversal (`%2E%2E%2F`), or absolute paths outside the workspace are blocked.
- **Symlink protection**: File resolution uses `fs.realpathSync` to follow symlinks before boundary checks, preventing symlink-based escapes from the workspace.
- **TOCTOU mitigation**: File reads use `O_NOFOLLOW` (non-Windows) via fd-based `openSync`/`fstatSync`/`readFileSync` to prevent symlink swap attacks between path resolution and file open.
- **Secure temp files**: PDF export now uses `fs.mkdtempSync` for unpredictable temp directories (replaces predictable `_tmp.html` filename). Temp files are always cleaned up in a `finally` block.
- **Chromium sandbox**: `--no-sandbox` is no longer passed unconditionally. On Linux only, the extension tries with sandbox first and falls back to `--no-sandbox` only if Chromium reports sandbox unavailability.
- **DOMPurify hardening**: Replaced incomplete `FORBID_ATTR` allowlist with a `uponSanitizeAttribute` hook that blocks all `on*` event handler attributes (covers current and future event types).
- **Container class escaping**: Markdown-it container class names are now HTML-encoded to prevent attribute injection.
- **Secure include processing**: `markdown-it-include` plugin replaced with `inlineIncludesSecure` — supports depth limiting (max 10), per-branch cycle detection, and boundary checks on all included file paths.

### Breaking Changes

- **`markdown-it-include` removed**: The `:[include](file.md)` syntax still works but is now handled by the built-in `inlineIncludesSecure` function, which enforces workspace boundary checks. Include paths that previously worked by referencing files outside the workspace root will now be blocked by default.
- **Image and stylesheet paths restricted to workspace**: Images and stylesheets that reference files outside the VS Code workspace root will be blocked and produce an empty/missing output. This is a security boundary, not a bug.
- **Absolute stylesheet paths blocked**: Stylesheet paths configured in `markdown-pdf.styles` that are absolute paths outside the workspace root will be blocked.

### New Configuration

- `markdown-pdf.allowPathsOutsideWorkspace` (boolean, default: `false`): Set to `true` to allow images, includes, and stylesheets to reference files outside the workspace root. Use this if you have legitimate cross-workspace resource references (e.g., a shared stylesheet at `/projects/shared/style.css`). **Enabling this disables path traversal protections.**

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
