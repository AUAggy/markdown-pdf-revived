# Plan: Browser Reliability and Inline CSS Hardening

> Source: P0 and P1 from the June 13, 2026 upstream activity review.
>
> Related upstream reports:
> [#166](https://github.com/yzane/vscode-markdown-pdf/issues/166),
> [#225](https://github.com/yzane/vscode-markdown-pdf/issues/225),
> [#436](https://github.com/yzane/vscode-markdown-pdf/issues/436), and
> [#437](https://github.com/yzane/vscode-markdown-pdf/issues/437).

## Goals

- Make browser discovery and launch failures predictable and actionable across Windows, macOS, Linux, and WSL.
- Preserve sandbox-first Chromium launches and use the existing Linux fallback only for recognized sandbox failures.
- Block inline `<style>` content by default and direct trusted customization through workspace-restricted stylesheet files.
- Keep the extension local, stable, and small: no browser downloads, browser management, telemetry, or general-purpose sanitization modes.

## Non-Goals

- Bundling or automatically downloading Chromium.
- Supporting arbitrary browser command-line arguments.
- Disabling Chromium's sandbox by default.
- Adding a setting that disables HTML sanitization or permits inline `<style>`.
- Parsing, rewriting, or attempting to make untrusted CSS safe.
- Expanding Markdown, Mermaid, or export-format features.

## Git Protocol

Use one feature branch and pull request per workstream:

| Workstream | Branch | Scope |
|---|---|---|
| Test runner and CI foundation | `chore/test-infrastructure` | Restore deterministic test commands and add cross-platform CI. |
| P0 browser reliability | `fix/browser-reliability` | Browser resolution, launch policy, diagnostics, cleanup, and P0 tests. |
| P1 inline CSS hardening | `security/block-inline-style` | Sanitization policy, migration documentation, and P1 tests. |
| Release verification | `chore/release-verification` | Package checks, release evidence, changelog, and final documentation. |

Apply these rules:

1. Create each branch from an updated `master`.
2. Do not combine P0 and P1 in one branch or pull request. P1 is a deliberate security and compatibility change requiring separate review.
3. Use small conventional commits with `test:`, `fix:`, `security:`, `docs:`, or `chore:` prefixes.
4. Keep unrelated refactoring and dependency upgrades out of these branches.
5. Bring the latest `master` into a branch before final review using the repository's agreed non-destructive update method.
6. Require the workstream's automated gate, `npm test`, typecheck, and production build to pass before merge.
7. Merge reviewed pull requests with `--no-ff` so workstream boundaries remain visible in history.
8. Merge in this order: test infrastructure, P0 browser reliability, P1 inline CSS hardening, release verification.
9. Tag and package releases only from `master` after the deployment completion gate passes.
10. Delete merged feature branches after release validation.

Hotfixes discovered during release verification should return to the owning workstream branch when it remains open. Otherwise, create a narrowly scoped fix branch from `master` and rerun the affected workstream and deployment gates.

## Architectural Decisions

- **Browser source order**: Use a configured executable first, then deterministic platform-specific candidates. Do not perform network access or browser installation.
- **Supported browsers**: Detect stable Chrome, Chromium, and Microsoft Edge installations. Other Chromium-based browsers remain available through the explicit executable-path setting.
- **Resolution boundary**: Keep browser path discovery as pure, testable logic separate from VS Code notifications and Puppeteer launch orchestration.
- **Launch policy**: Launch with the Chromium sandbox first. Retry without it only on Linux and only when stderr matches known sandbox-unavailable errors.
- **Diagnostics**: Return structured resolution and launch context internally, but show concise user-facing errors with the selected path or searched locations and the next corrective action.
- **CSS policy**: Treat inline `<style>` as disallowed user HTML. Trusted CSS must be loaded through `markdown-pdf.styles` and remain subject to workspace path restrictions.
- **Compatibility policy**: Do not add a legacy sanitization mode. The secure behavior is consistent for PDF and HTML export.
- **Testing boundary**: Unit-test path ordering, launch-error classification, diagnostic formatting, and sanitization. Use focused extension smoke tests only where VS Code integration behavior cannot be covered by pure tests.

## Confirmed Product Decisions

The following decisions were confirmed before implementation:

1. Stable Microsoft Edge is included in automatic browser detection.
2. User-supplied `<style>` elements are blocked, while DOMPurify-sanitized `style="..."` attributes remain supported.
3. Missing-browser errors appear only when PDF export is requested. Activation and HTML-only export do not resolve or require a browser.

---

## Phase 1: Deterministic Browser Resolution

**User stories**:

- As a user with Chrome, Chromium, or Edge installed in a standard location, I can export without manually configuring a path.
- As a user with a non-standard browser installation, my configured executable remains authoritative.
- As a maintainer, I can verify browser resolution without launching VS Code or a real browser.

### What to build

Extract browser discovery into a small platform-aware component. It should validate the configured executable, enumerate a conservative set of standard candidates for the current platform, and return both the selected executable and enough search context for later diagnostics.

Cover stable Chrome, Chromium, and Edge locations commonly used on Windows, macOS, and Linux. Include relevant environment-derived Windows paths and standard Linux package locations, including Snap. Treat WSL as Linux because the extension host runs in the remote environment; do not attempt to launch a Windows browser from WSL.

Remove the duplicated activation-time and export-time search behavior by routing both checks through the same resolver.

### Acceptance criteria

- [ ] A valid configured executable is selected before every auto-detected candidate.
- [ ] An invalid configured executable does not prevent fallback to installed system candidates.
- [ ] Standard Chrome, Chromium, and Edge paths are considered on each supported platform.
- [ ] Candidate ordering is deterministic and documented by tests.
- [ ] WSL searches Linux paths and reports that a Linux browser is required.
- [ ] Activation and export use the same resolution result.
- [ ] No browser is downloaded and no network request is made.
- [ ] Unit tests cover configured, detected, missing, and platform-specific cases without depending on the developer machine.

---

## Phase 2: Actionable Launch Failures

**User stories**:

- As a user whose browser cannot launch, I receive one useful error instead of a generic `exportPdf()` failure.
- As a Linux or WSL user without a usable sandbox, export retries only when the failure is specifically a sandbox problem.
- As a maintainer, I can distinguish discovery failures from launch failures in issue reports.

### What to build

Introduce a narrow launch-result and error-classification flow around Puppeteer. Preserve sandbox-first behavior. Classify recognized Linux sandbox failures for the existing controlled retry, and classify other failures without retrying.

Produce concise diagnostics for:

- configured executable missing or inaccessible;
- no supported browser found;
- browser found but Puppeteer launch failed;
- Linux sandbox unavailable and fallback also failed.

The user-facing message should include the browser path used, the platform, a short normalized stderr summary, and the appropriate next action. Full raw errors should remain in the extension-host log for troubleshooting, with obvious path or environment context but no document contents.

Avoid duplicate error notifications during activation and export. Activation may warn that PDF export is unavailable, but HTML export must remain usable.

### Acceptance criteria

- [ ] Missing-browser errors list the attempted categories or locations and mention `markdown-pdf.executablePath`.
- [ ] Launch-failure errors identify the selected executable and include a bounded stderr summary.
- [ ] Linux sandbox fallback occurs only for recognized sandbox errors.
- [ ] Non-sandbox launch errors are never retried with `--no-sandbox`.
- [ ] If sandbox fallback fails, the final message states that both launch attempts failed.
- [ ] Browser instances and temporary files are cleaned up on every failure path.
- [ ] HTML export still works when no browser is installed.
- [ ] Tests cover error classification, fallback decisions, message formatting, and cleanup behavior.
- [ ] Manual smoke checks cover Windows or Windows CI, macOS, Linux, and WSL documentation expectations.

---

## Phase 3: Secure Inline CSS Policy

**User stories**:

- As a user exporting untrusted Markdown, inline CSS cannot load remote resources or unexpectedly alter the generated document.
- As a user who needs custom layout, I have one documented path using a local stylesheet.
- As a maintainer, PDF and HTML exports apply the same sanitization policy.

### What to build

Update sanitization so opening and closing `<style>` tags and their contents do not become active CSS in exported output. Preserve the surrounding Markdown content so blocking a style block cannot truncate the document.

Use the existing `markdown-pdf.styles` mechanism as the only supported route for trusted custom CSS. Retain workspace path enforcement and the existing explicit opt-in for paths outside the workspace. Do not introduce a raw-HTML or inline-style compatibility switch.

Update user-facing documentation and migration notes with:

- why inline `<style>` is blocked;
- how to move CSS into a workspace-local file;
- a minimal settings example;
- the risk of allowing stylesheet paths outside the workspace.

### Acceptance criteria

- [ ] Inline `<style>` blocks cannot apply CSS in PDF or HTML output.
- [ ] CSS text inside a blocked style block is not emitted as active markup.
- [ ] Content before and after a blocked style block is preserved.
- [ ] Existing safe HTML, SVG, MathML, Mermaid, footnotes, and callouts continue to render.
- [ ] Event handlers, scripts, iframes, objects, embeds, and base tags remain blocked.
- [ ] Workspace-local files configured through `markdown-pdf.styles` still apply.
- [ ] Stylesheet traversal and outside-workspace protections remain unchanged.
- [ ] No new sanitization or legacy compatibility setting is added.
- [ ] Regression tests cover mixed-case tags, attributes, malformed or unclosed style blocks, and surrounding content.
- [ ] Documentation shows the supported migration from inline CSS to a local stylesheet.

---

## Phase 4: Cross-Feature Verification and Release Readiness

**User stories**:

- As a user upgrading the extension, browser reliability improves without changing successful exports.
- As a maintainer, the release has focused evidence for its security and compatibility claims.

### What to build

Run the complete build and test suite, then add a small end-to-end fixture that combines a local stylesheet, representative Markdown, and PDF export. Verify browser resolution and sanitization changes together rather than only as isolated units.

Review all new messages and documentation for the fork's support policy. Record the browser matrix and inline CSS behavior in the changelog as reliability and security changes, not new features.

### Acceptance criteria

- [ ] TypeScript compilation and bundling complete without warnings introduced by this work.
- [ ] The complete automated test suite passes.
- [ ] A representative PDF export succeeds with sandbox-first launch and a workspace-local stylesheet.
- [ ] A representative HTML export contains no active inline style block.
- [ ] Existing security fixtures still pass.
- [ ] Package contents contain no downloaded browser or unexpected large dependency.
- [ ] Changelog documents browser detection, improved diagnostics, and the inline CSS migration.
- [ ] Release notes clearly state that WSL requires a browser installed inside the WSL distribution.

## Suggested Delivery Order

1. Merge `chore/test-infrastructure` before implementation branches depend on its test commands.
2. Ship Phases 1 and 2 together from `fix/browser-reliability` as the P0 reliability change.
3. Ship Phase 3 separately from `security/block-inline-style` so the inline CSS compatibility change is explicit and reviewable.
4. Complete Phase 4 on `chore/release-verification` before publishing either release; if P0 ships first, run its applicable checks again when P1 lands.

## Review Questions

Resolved in **Confirmed Product Decisions** above.
