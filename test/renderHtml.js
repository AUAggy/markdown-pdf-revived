'use strict';

// Inspect HTML exported by the real extension, including the browser assets
// read from the installed VSIX. No CDN access or downloaded browser is used.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
require('ts-node').register({ project: path.resolve(__dirname, '..', 'tsconfig.json') });
const { resolveBrowser } = require('../src/browser/resolver');
const { launchBrowserWithPolicy } = require('../src/browser/launch');
const { closeBrowserBounded } = require('../src/exporter/pdf');
const puppeteer = require('puppeteer-core');

async function main() {
  const resolution = resolveBrowser();
  assert.ok(resolution.found, 'rendering test requires a system browser');
  const browser = await launchBrowserWithPolicy(
    options => puppeteer.launch(options), resolution.executablePath, process.platform, 'en'
  );
  try {
    const page = await browser.newPage();
    const remoteRequests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/^https?:/.test(request.url())) {
        remoteRequests.push(request.url());
        void request.abort();
      } else {
        void request.continue();
      }
    });
    await page.goto(pathToFileURL(path.resolve(process.argv[2])).href, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.mermaid svg').length === 3);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      diagrams: document.querySelectorAll('.mermaid[data-processed="true"] svg').length,
      math: document.querySelectorAll('.katex').length,
      loadedFonts: [...document.fonts].filter(font => font.status === 'loaded').length,
      securityLevel: mermaid.mermaidAPI.getConfig().securityLevel,
      visibleDiagrams: [...document.querySelectorAll('.mermaid svg')].every(svg => {
        const box = svg.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }),
    }));
    assert.strictEqual(metrics.diagrams, 3);
    assert.ok(metrics.math >= 6, 'server math and Mermaid math labels must render');
    assert.ok(metrics.loadedFonts > 0, 'packaged KaTeX fonts must load');
    assert.strictEqual(metrics.securityLevel, 'strict');
    assert.ok(metrics.visibleDiagrams, 'SVGs must occupy visible layout space');
    // Test the KaTeX copy embedded in mermaid.min.js, not just npm's module.
    const probe = await page.evaluate(async () => {
      Object.defineProperty(Object.prototype, 'trust', { configurable: true, writable: true, value: true });
      try {
        const output = await mermaid.render('trustProbe', 'flowchart TD\n A["$$\\href{javascript:alert(1)}{click}$$"]');
        const host = document.createElement('div');
        host.innerHTML = output.svg;
        return {
          math: host.querySelectorAll('.katex').length,
          unsafe: [...host.querySelectorAll('*')].some(element => element.getAttributeNames().some(name =>
            /^on/i.test(name) || (['href', 'xlink:href'].includes(name) &&
              /^\s*javascript:/i.test(element.getAttribute(name) || ''))
          )),
        };
      } finally { delete Object.prototype.trust; }
    });
    assert.strictEqual(probe.math, 1, 'embedded KaTeX probe must reach the math renderer');
    assert.strictEqual(probe.unsafe, false, 'embedded renderer must not emit executable links or event handlers');
    assert.deepStrictEqual(remoteRequests, [], 'rendering must not require the network');
    assert.deepStrictEqual(errors, [], 'browser rendering must not raise script errors');
    console.log(JSON.stringify(metrics));
  } finally {
    await closeBrowserBounded(browser, 5000);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
