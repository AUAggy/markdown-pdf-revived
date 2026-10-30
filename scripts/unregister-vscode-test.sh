#!/bin/sh
# macOS registers the VS Code builds that @vscode/test-electron downloads into
# .vscode-test/ the moment the test harness launches them, so they pile up in
# Finder's "Open With" menu. Unregister them after each test run.
#
# Unregister each bundled .app rather than the parent directory: scanning a
# plain directory makes lsregister fail (-10814), which turned a passing test
# run into a non-zero exit. Cleanup is best effort and never fails the run.
[ "$(uname -s)" = "Darwin" ] || exit 0
dir="$(cd "$(dirname "$0")/.." && pwd)/.vscode-test"
[ -d "$dir" ] || exit 0

lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$lsregister" ] || exit 0

find "$dir" -maxdepth 3 -type d -name '*.app' -print | while IFS= read -r app; do
  "$lsregister" -u "$app" >/dev/null 2>&1 || true
done
exit 0
