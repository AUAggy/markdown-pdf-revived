# Agent Handoff

## Active Initiative

Implement P0 browser reliability and P1 inline CSS hardening for Markdown PDF (Revived).

Read these files before changing code:

1. [`plans/browser-reliability-inline-css-hardening.md`](plans/browser-reliability-inline-css-hardening.md)
2. [`plans/browser-reliability-inline-css-hardening-test-plan.md`](plans/browser-reliability-inline-css-hardening-test-plan.md)

Treat those documents as the source of truth for scope, architecture, acceptance criteria, branch ownership, test evidence, and deployment gates.

## Product Constraints

- Prefer robustness, security, and stability over additional features.
- Keep the implementation small and direct.
- Do not bundle or download Chromium.
- Do not add arbitrary browser launch arguments.
- Keep sandbox-first browser launches.
- Do not add a sanitization bypass or legacy inline-style mode.
- Do not expand Markdown, Mermaid, or export-format features.
- Keep unrelated refactors and dependency upgrades out of this initiative.

## Current Repository State

At handoff creation:

- The checked-out branch is `fix/title-tag-rcdata-truncation`.
- That branch contains commit `3670a69`, which is not on local `master`.
- The two plan files and this handoff are uncommitted.
- No P0 or P1 implementation work has started.
- `npm test` references the missing `test/runTest.js`.
- No GitHub Actions workflow exists.

Do not create implementation branches from `fix/title-tag-rcdata-truncation`. Preserve its work and any user changes. Before beginning the initiative, confirm the title-tag fix and planning documents have been committed and merged into `master`, or otherwise explicitly establish the correct updated base with the user.

## Execution Order

Use one branch and pull request per workstream, created from updated `master`:

1. `chore/test-infrastructure`
2. `fix/browser-reliability`
3. `security/block-inline-style`
4. `chore/release-verification`

Merge only after the owning gate passes. Merge with `--no-ff` in the order above. Run the default `master` CI suite after each merge.

Use small conventional commits:

- `test:`
- `fix:`
- `security:`
- `docs:`
- `chore:`

Do not combine P0 and P1 in one pull request.

## First Workstream

Start with `chore/test-infrastructure`:

1. Restore a deterministic test entry point.
2. Add `typecheck`, unit, integration, package, and aggregate test scripts as defined by the test plan.
3. Add Linux, Windows, and macOS CI.
4. Make current tests pass without weakening or deleting assertions.
5. Verify the production build.

Do not begin browser or sanitizer behavior changes until this foundation has merged.

## Decisions to Confirm

The implementation plan leaves three product decisions open. Resolve and record them before the affected workstream:

1. Whether Edge is included in automatic browser detection.
2. Whether inline `style="..."` attributes remain supported while `<style>` elements are blocked.
3. Whether the missing-browser warning appears at activation or only when PDF export is requested.

Recommended KISS defaults:

- Include stable Edge auto-detection because Puppeteer supports it and it improves Windows reliability without downloading a browser.
- Block `<style>` elements but retain sanitized `style="..."` attributes unless the security requirement is explicitly broadened.
- Show the missing-browser error only when PDF export is requested so HTML-only users are not warned.

Document the final decisions in both plans and encode them in tests.

## Required Verification

At minimum, every implementation branch must pass:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Also run the branch-specific case matrix from the automated test plan. Do not claim completion based only on unit tests.

Before deployment, complete the test plan's deployment gate, package and inspect the VSIX, retain the listed evidence, and tag only the tested commit on `master`.

## Completion Standard

The initiative is complete only when:

- all four workstreams are merged in order;
- browser resolution and launch-policy tests pass cross-platform;
- HTML export works without a browser;
- inline `<style>` cannot apply CSS or make a network request;
- workspace-local stylesheet customization still works;
- existing security and rendering regressions pass;
- packaged VSIX tests pass;
- changelog, migration guidance, and release evidence are complete.
