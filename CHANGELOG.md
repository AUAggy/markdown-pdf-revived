# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [3.1.0] - 2026-10-30

### Security

- Updated DOMPurify to 3.4.17, closing the remaining sanitizer advisories. This extension uses DOMPurify only in its default string-output mode, so the reported modes (`IN_PLACE`, `SAFE_FOR_TEMPLATES`, XHTML parsing) were not reachable here. No bypass of the export sanitizer was found.
- Updated KaTeX to 0.18.2 (GHSA-238p-pmpm-9mq7). KaTeX read inherited `Object.prototype` properties as renderer options, so a pre-existing prototype pollution elsewhere could have enabled a `trust` setting this extension never opts into. Rendering now ignores inherited settings, and sanitization still runs on the output.
- Updated Mermaid to 12.2.0, the first release line that accepts the patched KaTeX.
- Updated `markdown-it` to 14.3.3 and `js-yaml` to 3.15.2, closing parser advisories for inline HTML, multi-line link reference definitions, and YAML merge keys.
- Updated Puppeteer to 25.13.0, which moves the bundled BiDi layer to a patched validation library. Browsers are still detected on the system or set through `markdown-pdf.executablePath`, never downloaded.
- Raised the pinned versions of `brace-expansion`, `source-map-js`, and `undici` past their advisories. These are dependency findings; none of the affected code paths is reachable from export.
- `npm audit --omit=dev` reports zero findings again.

### Changed

- Math and diagram rendering was re-verified in a real browser after the KaTeX and Mermaid upgrades. Packaged assets render offline with bundled fonts, Mermaid keeps its `strict` security level, and no executable links or event handlers are emitted.
- Mermaid 12 changed its default diagram styling: nodes are drawn slightly larger and with shadows. Documents with diagrams may paginate differently. Math rendering is visually unchanged.
- An unclosed `<!--`, `<?`, or `<![CDATA[` in prose now renders as text. Content after it still parses normally.
- A `$$` delimiter line with no content on the opening line falls back to inline math. This is unchanged parser behaviour, now covered by tests.

### Added

- Opt-in PDF bookmarks: `markdown-pdf.outline` (default `false`) generates a bookmark panel from document headings. Nesting follows heading levels. It is a browser PDF-writer feature, so there is no depth filter or start level, and bookmark destinations move with page layout.

### Fixed

- Export from the Markdown preview no longer fails with `No active Editor!`. When focus is outside a text editor, the export resolves the Markdown document you were working on. If several Markdown files are open, it asks which one instead of guessing. Convert-on-save is unaffected: it always exports the file that was saved.
- `markdown-pdf.styles` is now resource-scoped, so folder-level stylesheets apply in multi-root workspaces. Previously the setting was read as a window setting and folder overrides were ignored.
- Toggling `markdown-pdf.convertOnSave` now takes effect immediately instead of requiring a window reload.
- The macOS test cleanup hook no longer fails the run. It previously unregistered the whole `.vscode-test` directory, which `lsregister` rejects, so `npm test` exited non-zero after every successful integration run and could hide real failures in CI.

## [3.0.1] - 2026-08-13

### Security

- Updated DOMPurify to 3.4.13. This fixes three hook-handling advisories in the sanitizer that guards PDF and HTML output (GHSA-c2j3-45gr-mqc4, GHSA-cmwh-pvxp-8882, GHSA-55q2-fjhq-7xh7).
- Refreshed pinned transitive dependencies with advisories published since 3.0.0: brace-expansion 5.0.9, ip-address 10.5.0, undici 7.29.0, ws 8.21.3.

### Fixed

- PDF export no longer hangs the progress notification when the browser fails to close. Browser shutdown now times out after 5 seconds and falls back to killing the process.

### Changed

- Updated puppeteer-core from 24.x to 25.x. This is dependency maintenance, not a security fix: the remaining `npm audit` findings were in browser-download code this extension never runs. Browsers are detected on the system or set through `markdown-pdf.executablePath`, never downloaded.

## [3.0.0] - 2026-06-13

### Security

- User-supplied `<style>` elements and their CSS payloads are removed from PDF and HTML exports. Sanitized `style="..."` attributes remain supported; trusted CSS should use a workspace-local file through `markdown-pdf.styles`.
- Updated DOMPurify and Mermaid to patched release lines and pinned vulnerable transitive runtime dependencies to patched versions.

### Fixed

- Browser detection now uses deterministic platform-specific candidates for stable Chrome, Chromium, and Microsoft Edge.
- Invalid configured browser paths fall back to system detection and remain visible in actionable diagnostics.
- Browser launch errors now identify the selected executable and platform with bounded stderr summaries.
- Linux retries with `--no-sandbox` only for recognized sandbox-unavailable failures; other failures are not retried.
- HTML export no longer depends on browser discovery, and activation no longer warns users who only export HTML.

### Changed

- WSL uses Linux browser paths and requires a browser installed inside the WSL distribution.
- The test and release pipeline now covers Linux, Windows, and macOS, real-browser PDF export, negative inline-CSS network checks, and installed VSIX smoke tests.

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
- Mermaid render wait before PDF capture, so diagrams no longer appear as raw text
  (closes [#342](https://github.com/yzane/vscode-markdown-pdf/issues/342),
  [#365](https://github.com/yzane/vscode-markdown-pdf/issues/365),
  [#290](https://github.com/yzane/vscode-markdown-pdf/issues/290))
- Mermaid rendered locally from bundled `mermaid.min.js`, with no CDN calls
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
