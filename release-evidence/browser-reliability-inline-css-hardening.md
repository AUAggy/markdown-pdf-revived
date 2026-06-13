# Browser Reliability and Inline CSS Hardening Release Evidence

Date: 2026-06-13

## Required Gates

- `npm ci`: pass
- `npm run typecheck`: pass
- `npm run test:unit`: pass
- `npm run test:integration`: pass on macOS with VS Code 1.109.0 and Google Chrome 148.0.7778.168
- `npm run build`: pass
- `npm run test:package`: pass against an installed VSIX
- `npm audit --omit=dev`: 0 vulnerabilities

## Behavioral Evidence

- Browser resolution tests cover configured-path precedence, invalid-path fallback, deterministic Chrome/Chromium/Edge ordering, Windows/macOS/Linux candidates, and WSL guidance.
- Launch-policy tests prove the first attempt is sandboxed and `--no-sandbox` is limited to recognized Linux sandbox failures.
- HTML export succeeds with a nonexistent configured browser.
- Real-browser PDF export succeeds with sandbox-first launch.
- Inline `<style>` is absent from HTML and PDF workflows while surrounding content remains.
- A local HTTP server receives zero requests from blocked inline `@import` CSS.
- A workspace-local stylesheet remains present in HTML and succeeds in PDF export.
- Existing path traversal, XSS, rendering, title, and textarea regression tests pass.

## Package Evidence

The package gate writes the final platform evidence to `work/release/`:

- `markdown-pdf-revived-2.1.0.vsix`
- `package-manifest.txt`
- `package-evidence.json`

The gate verifies required Mermaid, KaTeX, highlighting, emoji, template, style, and bundle assets; rejects browser downloads and internal planning files; installs the VSIX into an isolated VS Code profile; and reruns the extension workflow suite.

Final local macOS package evidence:

- Size: 11,203,595 bytes
- Files: 1,463
- SHA-256: recorded in the retained `work/release/package-evidence.json` for the tested artifact. VSCE archive timestamps change the checksum on each packaging run even when the manifest and source commit are unchanged.

## CI Evidence

The `CI` workflow runs the full source and installed-package gates on Ubuntu, Windows, and macOS and uploads each platform's package evidence. Record the final workflow URL and tested `master` commit with the release tag.
