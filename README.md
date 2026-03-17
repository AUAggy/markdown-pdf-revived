<p align="center">
  <img src="images/icon.png" width="96" alt="Markdown PDF (Revived)">
</p>

<h1 align="center">Markdown PDF (Revived)</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AUAggy.markdown-pdf-revived"><img src="https://img.shields.io/visual-studio-marketplace/v/AUAggy.markdown-pdf-revived?label=VS%20Code&color=0078d4" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/AUAggy/markdown-pdf-revived"><img src="https://img.shields.io/open-vsx/v/AUAggy/markdown-pdf-revived?label=Open%20VSX&color=c160ef" alt="Open VSX"></a>
  <a href="https://github.com/AUAggy/markdown-pdf-revived/releases"><img src="https://img.shields.io/github/v/release/AUAggy/markdown-pdf-revived?label=Release&color=e53e3e" alt="GitHub Release"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/github/license/AUAggy/markdown-pdf-revived?color=555" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#getting-started">Install</a> &bull;
  <a href="#what-changed-in-v2">What changed</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#settings">Settings</a> &bull;
  <a href="#requirements">Requirements</a>
</p>

Converts Markdown files to PDF or HTML from within VSCode. All rendering is local; no external servers, no telemetry, Chrome required.

## What Changed in v2

This is a fork of [yzane/vscode-markdown-pdf](https://github.com/yzane/vscode-markdown-pdf), which had no maintainer activity since late 2023. See [CHANGELOG.md](CHANGELOG.md) for the full list of changes and [MIGRATION.md](MIGRATION.md) for upgrade instructions.

**Removed:** PlantUML (sent source to plantuml.com), PNG/JPEG export, Chromium auto-download, 10 settings.

**Added:** KaTeX math, DOMPurify sanitization (CVE-2024-7739), Mermaid async render fix, TypeScript rewrite, esbuild bundling (~11MB), footnotes, GitHub-style callouts, configurable export timeout.

**Changed:** Default margins, highlight theme (github.css), header/footer off by default.

| Area | Detail |
|---|---|
| PlantUML | Removed; diagram source was sent to `plantuml.com` on each render. Use Mermaid instead. |
| PNG/JPEG export | Removed. PDF and HTML output only. |
| Chromium auto-download | Removed. The API (`createBrowserFetcher`) was dropped in puppeteer v20. |
| 10 settings | Removed or folded into fixed behavior. See [MIGRATION.md](MIGRATION.md). |

## Requirements

Chrome or Chromium must be installed. The extension detects it automatically at standard installation paths on macOS, Linux, and Windows.

To use a non-standard Chrome binary:

```json
"markdown-pdf.executablePath": "/path/to/chrome"
```

Restart VSCode after changing this setting.

## Getting Started

**VS Code users** can search for "Markdown PDF" in the Extensions panel or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AUAggy.markdown-pdf-revived).

**VSCodium users** should install from [Open VSX](https://open-vsx.org/extension/AUAggy/markdown-pdf-revived).

**Manual install:** Download the `.vsix` from the [latest GitHub release](https://github.com/AUAggy/markdown-pdf-revived/releases), then run `Extensions: Install from VSIX` from the command palette.

## Usage

### Command Palette

1. Open a Markdown file.
2. Press `F1` or `Ctrl+Shift+P`.
3. Type `export` and select a command:
   - `Markdown PDF: Export (pdf)`
   - `Markdown PDF: Export (html)`
   - `Markdown PDF: Export (all: pdf, html)`
   - `Markdown PDF: Export (settings.json)`

### Right-click Menu

1. Open a Markdown file.
2. Right-click in the editor.
3. Select a command from the `markdown-pdf` group.

### Auto-convert on Save

1. Add `"markdown-pdf.convertOnSave": true` to `settings.json`.
2. Restart VSCode.
3. Open a Markdown file. The extension converts it on each save.

To exclude specific files from auto-convert, add filename patterns to `markdown-pdf.convertOnSaveExclude`.

## Features

- Syntax highlighting via [highlight.js](https://highlightjs.org/) with 80+ themes
- Emoji support
- KaTeX math: `$...$` for inline, `$$...$$` for display
- Mermaid diagrams, rendered locally with no external calls
- File includes via [markdown-it-include](https://github.com/camelaissani/markdown-it-include)
- Custom div containers via [markdown-it-container](https://github.com/markdown-it/markdown-it-container)
- Checkbox and task list support via [markdown-it-checkbox](https://github.com/mcecot/markdown-it-checkbox)
- Footnotes via `[^1]` syntax
- GitHub-style callout blocks (`> [!NOTE]`, `> [!WARNING]`, etc.)
- DOMPurify sanitization of rendered HTML before PDF/HTML output

## Settings

### Output

| Setting | Default | Description |
|---|---|---|
| `markdown-pdf.type` | `["pdf"]` | Output formats. Accepts `pdf`, `html`, or both. |
| `markdown-pdf.convertOnSave` | `false` | Convert on save. Requires VSCode restart to take effect. |
| `markdown-pdf.convertOnSaveExclude` | `[]` | Filename patterns to skip during auto-convert. |
| `markdown-pdf.outputDirectory` | `""` | Directory for output files. Relative paths resolve from the workspace root. |
| `markdown-pdf.executablePath` | `""` | Path to a Chrome or Chromium binary. Leave empty to use auto-detection. |

### Styles

| Setting | Default | Description |
|---|---|---|
| `markdown-pdf.styles` | `[]` | Paths to additional CSS files. All `\` must be written as `\\` on Windows. |
| `markdown-pdf.allowPathsOutsideWorkspace` | `false` | Allow images, includes, and stylesheets to reference files outside the VS Code workspace root. See [`markdown-pdf.allowPathsOutsideWorkspace`](#markdown-pdfallowpathsoutsideworkspace) below. |
| `markdown-pdf.highlight` | `true` | Enable syntax highlighting. |
| `markdown-pdf.highlightStyle` | `"github.css"` | highlight.js theme. See [highlight.js demo](https://highlightjs.org/static/demo/). |

### `markdown-pdf.allowPathsOutsideWorkspace`
- Type: boolean
- Default: `false`
- Description: Allow images, includes, and stylesheets to reference files outside the VS Code workspace root. By default, all local file references are restricted to the workspace to prevent path traversal attacks. Set to `true` only if you have intentional cross-workspace resource references (e.g., a shared stylesheet at `/projects/shared/styles.css`). **Enabling this setting disables path traversal protections.**

### Markdown

| Setting | Default | Description |
|---|---|---|
| `markdown-pdf.breaks` | `false` | Treat newlines as `<br>` tags. |
| `markdown-pdf.emoji` | `true` | Render emoji shortcodes. |
| `markdown-pdf.math` | `true` | Enable KaTeX math rendering. |

### PDF

| Setting | Default | Description |
|---|---|---|
| `markdown-pdf.displayHeaderFooter` | `false` | Show header and footer in PDF output. |
| `markdown-pdf.headerTemplate` | *(title + date)* | HTML template for the PDF header. |
| `markdown-pdf.footerTemplate` | *(page / total)* | HTML template for the PDF footer. |
| `markdown-pdf.printBackground` | `true` | Print background graphics. |
| `markdown-pdf.orientation` | `"portrait"` | Page orientation: `portrait` or `landscape`. |
| `markdown-pdf.format` | `"A4"` | Paper size: Letter, Legal, Tabloid, Ledger, A0–A6. |
| `markdown-pdf.margin.top` | `"2cm"` | Top margin. Units: mm, cm, in, px. |
| `markdown-pdf.margin.bottom` | `"2cm"` | Bottom margin. Units: mm, cm, in, px. |
| `markdown-pdf.margin.right` | `"2.5cm"` | Right margin. Units: mm, cm, in, px. |
| `markdown-pdf.margin.left` | `"2.5cm"` | Left margin. Units: mm, cm, in, px. |
| `markdown-pdf.timeout` | `60000` | Timeout in milliseconds for PDF export. Increase for large documents or slow machines. |

Header and footer templates support these tokens:

| Token | Value |
|---|---|
| `<span class='title'></span>` | Document title (frontmatter `title:` if set, otherwise filename) |
| `<span class='pageNumber'></span>` | Current page number |
| `<span class='totalPages'></span>` | Total pages |
| `%%ISO-DATE%%` | Date in `YYYY-MM-DD` format |
| `%%ISO-DATETIME%%` | Date and time in `YYYY-MM-DD hh:mm:ss` format |
| `%%ISO-TIME%%` | Time in `hh:mm:ss` format |

## Mermaid Diagrams

Mermaid diagrams are rendered locally using the bundled `mermaid.min.js`. Before PDF capture, the extension waits for Mermaid's async SVG rendering to complete by polling for the `data-processed` attribute on each `.mermaid` element. This ensures diagrams appear in PDFs rather than as raw code blocks.

~~~markdown
```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do the thing]
    B -->|No| D[Skip it]
    C --> E[End]
    D --> E
```
~~~

PlantUML has been removed. It sent diagram source to `plantuml.com` on each render. For migration examples and equivalent Mermaid syntax, see [MIGRATION.md](MIGRATION.md).

## Custom Containers

The [markdown-it-container](https://github.com/markdown-it/markdown-it-container) plugin wraps content in named `<div>` elements. Style them with a custom CSS file.

Input:

```
::: warning
*here be dragons*
:::
```

Output:

```html
<div class="warning">
<p><em>here be dragons</em></p>
</div>
```

## File Includes

Includes insert the contents of another Markdown file at the include site. Paths are relative to the file containing the include directive.

Syntax: `:[display text](relative-path-to-file.md)`

Example:

```
:[Plugins](./plugins/README.md)
:[Changelog](CHANGELOG.md)
```

The output contains the rendered content of each included file in sequence.

> **Security note (v2.1.0+):** File includes are now processed by the built-in `inlineIncludesSecure` function (replacing the `markdown-it-include` plugin). All included paths are validated against the workspace root, with a maximum include depth of 10 and per-branch cycle detection. Include paths that reference files outside the workspace root are blocked by default. To allow cross-workspace includes, set `markdown-pdf.allowPathsOutsideWorkspace` to `true`.

## Page Breaks

Insert a page break with:

```html
<div class="page"/>
```

## Known Limitations

- Chrome or Chromium must be installed separately. The extension does not bundle or download a browser.
- Online CSS URLs (e.g., `https://example.com/styles.css`) do not resolve reliably in PDF output. Prefer local stylesheet paths.

## License

MIT
