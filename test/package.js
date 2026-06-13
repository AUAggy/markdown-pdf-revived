'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundlePath = path.join(root, 'dist', 'extension.js');

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

console.log(`Package checks passed (${fs.statSync(bundlePath).size} byte production bundle).`);
