'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runTests, runVSCodeCommand } = require('@vscode/test-electron');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundlePath = path.join(root, 'dist', 'extension.js');
const artifactDir = path.join(root, 'work', 'release');
const vsixPath = path.join(artifactDir, `${packageJson.name}-${packageJson.version}.vsix`);
const manifestPath = path.join(artifactDir, 'package-manifest.txt');
const evidencePath = path.join(artifactDir, 'package-evidence.json');
const vscodeVersion = process.env.VSCODE_TEST_VERSION || '1.109.0';

assert.ok(fs.existsSync(bundlePath), 'production bundle must exist');
assert.ok(fs.statSync(bundlePath).size > 0, 'production bundle must not be empty');
assert.strictEqual(packageJson.main, './dist/extension');
assert.ok(packageJson.dependencies['puppeteer-core'], 'puppeteer-core must remain browser-download-free');
assert.ok(!packageJson.dependencies.puppeteer, 'the browser-downloading puppeteer package must not be added');

const forbiddenDirectories = [
  path.join(root, '.local-chromium'),
  path.join(root, 'node_modules', 'puppeteer', '.local-chromium'),
  path.join(root, 'node_modules', '.cache', 'puppeteer'),
];
for (const directory of forbiddenDirectories) {
  assert.ok(!fs.existsSync(directory), `downloaded browser directory must not be packaged: ${directory}`);
}

function runVsce(args) {
  const executable = require.resolve('@vscode/vsce/vsce');
  return execFileSync(process.execPath, [executable, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.rmSync(vsixPath, { force: true });

  const manifest = runVsce(['ls'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  fs.writeFileSync(manifestPath, manifest.join('\n') + '\n');

  const requiredEntries = [
    'dist/extension.js',
    'template/template.html',
    'styles/markdown.css',
    'styles/markdown-pdf.css',
    'data/emoji.json',
    'node_modules/mermaid/dist/mermaid.min.js',
    'node_modules/katex/dist/katex.min.css',
  ];
  for (const entry of requiredEntries) {
    assert.ok(manifest.includes(entry), `VSIX manifest must include ${entry}`);
  }
  assert.ok(manifest.some((entry) => entry.startsWith('node_modules/katex/dist/fonts/')));
  assert.ok(manifest.some((entry) => entry.startsWith('node_modules/highlight.js/styles/')));
  assert.ok(manifest.some((entry) => entry.startsWith('node_modules/emoji-images/pngs/')));

  const forbiddenPatterns = [
    /(^|\/)chrome(?:-win|-linux|-mac)?\//i,
    /(^|\/)chromium\//i,
    /(^|\/)\.local-chromium\//i,
    /(^|\/)puppeteer\/\.local-chromium\//i,
    /^plans\//,
    /^release-evidence\//,
    /^AGENTS\.md$/,
  ];
  for (const entry of manifest) {
    assert.ok(!forbiddenPatterns.some((pattern) => pattern.test(entry)), `unexpected packaged file: ${entry}`);
  }

  runVsce(['package', '--out', vsixPath]);
  const vsix = fs.readFileSync(vsixPath);
  const evidence = {
    package: path.basename(vsixPath),
    bytes: vsix.length,
    sha256: crypto.createHash('sha256').update(vsix).digest('hex'),
    files: manifest.length,
    bundleBytes: fs.statSync(bundlePath).size,
    vscodeVersion,
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');

  await runVSCodeCommand(['--install-extension', vsixPath, '--force'], { version: vscodeVersion });
  await runTests({
    version: vscodeVersion,
    extensionDevelopmentPath: path.join(root, 'test', 'package-harness'),
    extensionTestsPath: path.join(root, 'test', 'suite', 'index'),
    extensionTestsEnv: { MARKDOWN_PDF_PACKAGE_TEST: '1' },
  });

  console.log(
    `Package checks passed (${evidence.bytes} byte VSIX, ${evidence.files} files, sha256 ${evidence.sha256}).`
  );
}

main().catch((error) => {
  console.error('Package verification failed:', error);
  process.exit(1);
});
