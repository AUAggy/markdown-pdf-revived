# Automated Test Plan: Browser Reliability and Inline CSS Hardening

> Implementation plan:
> [browser-reliability-inline-css-hardening.md](./browser-reliability-inline-css-hardening.md)
>
> Purpose: provide the automated verification and release evidence required while implementing and before deploying P0 browser reliability and P1 inline CSS hardening.

## Test Objectives

- Prove browser selection is deterministic on Windows, macOS, Linux, and WSL.
- Prove browser launch uses the sandbox first and retries without it only for recognized Linux sandbox failures.
- Prove browser errors are concise, actionable, bounded, and do not expose document contents.
- Prove HTML export remains available without an installed browser.
- Prove inline `<style>` cannot apply CSS or load resources in PDF or HTML output.
- Prove blocking inline CSS does not truncate surrounding document content.
- Prove workspace-local stylesheet customization still works.
- Prevent regressions in sanitization, path restrictions, Markdown rendering, cleanup, and packaged extension contents.

## Confirmed Product Decisions

- Stable Microsoft Edge is included in automatic browser detection.
- User-supplied `<style>` elements are blocked, while sanitized `style="..."` attributes remain supported.
- Browser resolution and missing-browser errors occur only for PDF export, not activation or HTML-only export.

## Current Test-System Gap

At the time this plan was written:

- `npm test` points to `test/runTest.js`, but that file is absent.
- There is no repository CI workflow.
- Unit tests exist under `src/`, but there is no checked-in command that compiles and runs them.

Restoring a deterministic test entry point and CI is a blocking prerequisite. Feature work is not deployment-ready while `npm test` is non-functional.

## Git and Test Protocol

Automated evidence must be attached to the pull request for the branch that owns the work:

| Branch | Required automated evidence |
|---|---|
| `chore/test-infrastructure` | Test command self-checks, Linux/Windows/macOS CI, typecheck, and production build. |
| `fix/browser-reliability` | BR-01 through BR-12, BL-01 through BL-15, existing regression tests, and a real-browser smoke test. |
| `security/block-inline-style` | CSS-01 through CSS-16, rendering fixtures, negative network assertions, and existing security tests. |
| `chore/release-verification` | Full matrix, packaged VSIX tests, dependency audit, package manifest, and deployment evidence. |

Apply this protocol:

1. Create each workstream branch from an updated `master`.
2. Run the smallest relevant unit-test subset while developing, then run the complete branch gate before opening or updating its pull request.
3. Do not waive failed tests by weakening assertions, deleting fixtures, or marking tests skipped without a documented platform limitation and reviewer approval.
4. Re-run the complete branch gate after bringing the latest `master` into the branch.
5. Require green CI and review before merging with `--no-ff`.
6. Merge in this order: `chore/test-infrastructure`, `fix/browser-reliability`, `security/block-inline-style`, `chore/release-verification`.
7. After each merge, run the default `master` CI suite before starting the next merge.
8. Tag and package only from the tested `master` commit recorded in deployment evidence.
9. If release verification finds a defect, fix it on the owning open branch or a narrow branch from `master`, then rerun all affected gates.
10. Delete merged branches only after release validation, ensuring test evidence remains accessible in pull requests and CI records.

## Required Test Commands

The implementation should expose the following stable commands. Exact tooling may follow existing Mocha, TypeScript, esbuild, and `@vscode/test-electron` dependencies.

| Command | Purpose | Required during implementation | Required before deployment |
|---|---|---:|---:|
| `npm run typecheck` | Strict TypeScript validation | Yes | Yes |
| `npm run test:unit` | Pure resolver, launch-policy, diagnostic, sanitizer, and path tests | Yes | Yes |
| `npm run test:integration` | VS Code extension and export workflow tests | On affected slices | Yes |
| `npm run test:package` | Build/package inspection and installed VSIX smoke tests | No | Yes |
| `npm test` | Runs all non-destructive automated checks | Yes | Yes |
| `npm run build` | Production bundle | Yes | Yes |

`npm test` must return non-zero when any required check fails. Tests must not require network access except for downloading fixed CI tooling or the VS Code test runtime during CI setup.

## Test Levels

### 1. Unit Tests

Unit tests must use injected platform, environment, filesystem-existence, and launch behavior. They must not depend on browsers installed on the developer machine.

Cover:

- browser candidate generation and ordering;
- configured executable precedence and fallback;
- WSL identification and guidance;
- launch-error classification and retry decisions;
- user-facing diagnostic formatting and length limits;
- temporary-file and browser cleanup helpers;
- inline style removal and malformed HTML handling;
- existing path-security and sanitizer behavior.

### 2. Integration Tests

Integration tests must exercise the extension workflow with controlled browser-launch doubles where possible and a real Chromium-family browser for a small smoke subset.

Cover:

- activation with and without an available browser;
- PDF command behavior when discovery succeeds or fails;
- HTML export when no browser is available;
- one sandbox-success PDF export;
- one recognized sandbox-failure retry;
- one non-sandbox failure with no retry;
- HTML and PDF output using a workspace-local stylesheet;
- HTML and PDF output containing attempted inline `<style>`.

### 3. Package Tests

Build the production bundle and package a VSIX using the same process intended for release.

Verify:

- the extension activates after installation from the VSIX;
- the production bundle can resolve and launch the test browser;
- no downloaded browser executable or cache is included;
- required Mermaid, KaTeX, highlighting, and emoji assets remain included;
- package size has no unexplained material increase;
- no new production dependency was added solely for browser downloading or CSS parsing.

### 4. Cross-Platform CI

Run the automated suite on:

| Environment | Unit | Extension integration | Real browser smoke |
|---|---:|---:|---:|
| Ubuntu latest | Yes | Yes | Chrome or Chromium |
| Windows latest | Yes | Yes | Chrome or Edge |
| macOS latest | Yes | Yes | Chrome or system-detected supported browser |

WSL-specific behavior should be covered automatically on Ubuntu by injecting representative WSL environment markers and asserting Linux candidate paths and WSL-specific guidance. A real WSL launch remains a release-candidate smoke check unless a stable WSL CI runner is introduced.

## P0 Test Cases: Browser Resolution

| ID | Automated scenario | Expected result |
|---|---|---|
| BR-01 | Configured executable exists | It is selected before all detected candidates. |
| BR-02 | Configured executable is missing; system Chrome exists | Chrome is selected and the invalid configured path is retained in diagnostic context. |
| BR-03 | Configured executable is missing; Edge exists | Edge is selected if Edge auto-detection is approved. |
| BR-04 | Multiple candidates exist | The documented first candidate is selected deterministically. |
| BR-05 | No candidates exist | Resolution returns a typed not-found result with searched locations. |
| BR-06 | Windows environment paths are supplied | Candidate paths are correctly constructed without empty or malformed prefixes. |
| BR-07 | macOS platform is supplied | Stable Chrome, Chromium, and approved Edge application paths are considered. |
| BR-08 | Linux platform is supplied | Standard package and Snap paths are considered. |
| BR-09 | WSL markers are supplied | Only Linux executables are considered; guidance says to install a browser inside WSL. |
| BR-10 | Unsupported Chromium browser is installed at a custom path | It works only when explicitly configured. |
| BR-11 | Resolver runs with network APIs disabled | Resolution completes without network access or download attempts. |
| BR-12 | Activation and export request resolution | Both consume the same resolver contract and select the same path. |

## P0 Test Cases: Launch Policy and Diagnostics

| ID | Automated scenario | Expected result |
|---|---|---|
| BL-01 | Browser launches normally on Linux | One launch occurs with sandbox enabled. |
| BL-02 | Browser launches normally on Windows or macOS | One launch occurs without `--no-sandbox`. |
| BL-03 | Linux launch reports `No usable sandbox` | One sandboxed attempt is followed by one fallback attempt. |
| BL-04 | Linux launch reports root-without-sandbox error | One sandboxed attempt is followed by one fallback attempt. |
| BL-05 | Linux launch reports an unrelated code-0 failure | No fallback attempt occurs. |
| BL-06 | Windows or macOS reports a sandbox-like string | No unsafe fallback attempt occurs. |
| BL-07 | Sandbox fallback also fails | Final error states both attempts failed and identifies the executable. |
| BL-08 | Browser is not found | Message mentions `markdown-pdf.executablePath`, platform context, and searched locations. |
| BL-09 | Configured executable is inaccessible | Message distinguishes invalid configuration from no browser installed. |
| BL-10 | Launch stderr is very large or multiline | User message contains a normalized, bounded summary; full error remains in logs. |
| BL-11 | Launch error contains Markdown document text | User message and structured diagnostic exclude document contents. |
| BL-12 | Launch fails after temporary HTML creation | Temporary directory is removed. |
| BL-13 | Failure occurs after browser creation | Browser close is attempted and temporary files are removed. |
| BL-14 | Browser is unavailable and HTML export is requested | HTML export succeeds without browser resolution blocking it. |
| BL-15 | Activation and subsequent PDF export both detect no browser | The user does not receive duplicate generic errors for one export action. |

## P1 Test Cases: Inline CSS Hardening

Run sanitizer-level cases and exported-output cases. Output assertions must parse HTML rather than relying only on string absence where practical.

| ID | Automated scenario | Expected result |
|---|---|---|
| CSS-01 | Normal `<style>body{color:red}</style>` block | No active style element or CSS payload remains. |
| CSS-02 | Mixed-case `<StYlE>` block | It is blocked identically. |
| CSS-03 | Style tag with attributes | It is blocked identically. |
| CSS-04 | Style block contains `@import` and remote `url()` | Neither the style element nor remote CSS reference remains active. |
| CSS-05 | Content exists before and after a style block | Both surrounding sections remain in order. |
| CSS-06 | Unclosed style block | Export does not truncate unrelated recoverable content or activate CSS. |
| CSS-07 | Stray closing style tag | It does not alter or truncate surrounding content. |
| CSS-08 | Escaped `&lt;style&gt;` shown as prose | The prose remains visible and is not interpreted as CSS. |
| CSS-09 | Inline `style="..."` attribute | The sanitized inline style attribute remains supported. |
| CSS-10 | Script, iframe, object, embed, base, and event handlers | Existing blocking behavior remains intact. |
| CSS-11 | Safe HTML, SVG, and MathML | Existing supported markup remains present. |
| CSS-12 | Mermaid, footnotes, and callouts | Representative rendering output remains present. |
| CSS-13 | Workspace-local `markdown-pdf.styles` file | Stylesheet is applied to HTML and PDF output. |
| CSS-14 | Stylesheet path traverses outside workspace | It remains blocked by default. |
| CSS-15 | Outside-workspace stylesheet with explicit opt-in | Existing documented opt-in behavior remains functional. |
| CSS-16 | PDF and HTML export use the same Markdown input | Neither output contains an active user-supplied style block. |

CSS-09 deliberately preserves sanitized inline style attributes while blocking `<style>` elements.

## Rendering Regression Fixtures

Maintain small deterministic fixtures for:

- basic headings, paragraphs, links, lists, and tables;
- syntax highlighting;
- KaTeX;
- Mermaid;
- footnotes and callouts;
- workspace-local custom CSS;
- blocked inline style with content following it;
- existing XSS payloads;
- title and textarea RCDATA regression cases.

For HTML, normalize nondeterministic values and compare parsed structure or focused snapshots. For PDF, assert successful generation, non-zero page count, expected extracted text, and absence of known blocked CSS marker text. Avoid full binary snapshots because Chrome metadata and rendering can vary by platform.

## Negative Security Assertions

Automated tests must prove:

- no code path invokes a browser download API;
- no HTTP request is made during browser resolution;
- `--no-sandbox` is absent from the first launch attempt;
- `--no-sandbox` is never used outside recognized Linux fallback;
- document contents are not included in launch diagnostics;
- blocked style content cannot trigger a request to a test HTTP server;
- stylesheet path traversal remains fail-closed;
- sanitization failure blocks export rather than emitting unsanitized HTML.

## Implementation-Time Gates

Complete these gates for each implementation phase:

### Phase 1 Gate

- [ ] Changes are isolated to `fix/browser-reliability` after `chore/test-infrastructure` has merged.
- [ ] BR-01 through BR-12 pass.
- [ ] Existing unit tests pass.
- [ ] Typecheck and production build pass.

### Phase 2 Gate

- [ ] P0 commits and evidence remain in the `fix/browser-reliability` pull request.
- [ ] BL-01 through BL-15 pass.
- [ ] At least one real-browser PDF smoke test passes on Ubuntu.
- [ ] Failure tests prove temporary-resource cleanup.

### Phase 3 Gate

- [ ] P1 changes are isolated to `security/block-inline-style`.
- [ ] CSS-01 through CSS-16 pass.
- [ ] Rendering regression fixtures pass.
- [ ] Negative remote-resource test records zero requests.

### Phase 4 Gate

- [ ] Release-only verification changes are isolated to `chore/release-verification`.
- [ ] Cross-platform CI is green.
- [ ] Package tests pass against the generated VSIX.
- [ ] No unexplained package-size or dependency increase is present.
- [ ] Documentation and changelog assertions pass.

## Deployment Completion Gate

Deployment must not proceed unless all items below are recorded against the release commit:

- [ ] `npm ci` completed from a clean checkout.
- [ ] `npm test` passed.
- [ ] `npm run build` passed.
- [ ] Linux, Windows, and macOS CI jobs passed.
- [ ] Packaged VSIX smoke tests passed.
- [ ] Real-browser PDF and HTML fixtures passed.
- [ ] Inline CSS produced no active style element and no remote request.
- [ ] Sandbox-first launch was confirmed.
- [ ] WSL guidance test passed.
- [ ] Production dependency audit passed with no unresolved production vulnerability.
- [ ] VSIX contents and size were reviewed.
- [ ] Release notes describe browser support, WSL requirements, diagnostics, and inline CSS migration.

## Test Evidence to Retain

Attach or archive:

- release commit SHA;
- CI run links and platform results;
- unit and integration test summaries;
- generated VSIX checksum and size;
- package-content manifest;
- HTML fixture output;
- PDF fixture text-extraction result and page count;
- browser executable and version used by each real-browser smoke test;
- confirmation that the remote CSS test server received zero requests;
- dependency audit output.

Do not archive user documents, temporary rendered HTML containing private content, or full environment dumps.

## Failure and Rollback Criteria

Block deployment when:

- any platform selects an unexpected browser candidate;
- a non-sandbox failure triggers `--no-sandbox`;
- HTML export requires a browser;
- inline style content remains active or causes a network request;
- sanitization truncates content following a blocked tag;
- workspace stylesheet path restrictions regress;
- packaged behavior differs from source-level tests;
- `npm test` is missing, flaky, or non-deterministic.

If a deployed release violates a security assertion, withdraw or replace the release. Do not restore inline `<style>` through an emergency compatibility bypass.
