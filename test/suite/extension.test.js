'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

suite('Markdown PDF extension', () => {
  test('activates and registers export commands', async () => {
    const extension = vscode.extensions.all.find(
      (candidate) => candidate.packageJSON.name === 'markdown-pdf-revived'
    );

    assert.ok(extension, 'extension should be installed in the development host');
    if (process.env.MARKDOWN_PDF_PACKAGE_TEST === '1') {
      assert.ok(
        extension.extensionPath.includes('.vscode-test'),
        `package smoke must load the installed VSIX, got ${extension.extensionPath}`
      );
    }
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('extension.markdown-pdf.pdf'));
    assert.ok(commands.includes('extension.markdown-pdf.html'));
    assert.ok(commands.includes('extension.markdown-pdf.all'));
  });

  test('exports HTML when the configured browser is missing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-integration-'));
    const markdownPath = path.join(tempDir, 'browser-independent.md');
    const htmlPath = path.join(tempDir, 'browser-independent.html');
    fs.writeFileSync(markdownPath, '# Browser-independent HTML\n\nExported without Chromium.');

    const configuration = vscode.workspace.getConfiguration('markdown-pdf');
    await configuration.update(
      'executablePath',
      path.join(tempDir, 'missing-browser'),
      vscode.ConfigurationTarget.Global
    );

    try {
      const document = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('extension.markdown-pdf.html');

      assert.ok(fs.existsSync(htmlPath), 'HTML output should be written');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('Browser-independent HTML'));
      assert.ok(html.includes('Exported without Chromium.'));
    } finally {
      await configuration.update('executablePath', undefined, vscode.ConfigurationTarget.Global);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('exports a PDF with a detected system browser', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-browser-smoke-'));
    const markdownPath = path.join(tempDir, 'browser-smoke.md');
    const pdfPath = path.join(tempDir, 'browser-smoke.pdf');
    fs.writeFileSync(markdownPath, '# Browser smoke\n\nSandbox-first PDF export.');

    try {
      const document = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');

      assert.ok(fs.existsSync(pdfPath), 'PDF output should be written');
      assert.ok(fs.statSync(pdfPath).size > 0, 'PDF output should not be empty');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('blocks inline style network access while allowing a local stylesheet', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-style-security-'));
    const markdownPath = path.join(tempDir, 'style-security.md');
    const htmlPath = path.join(tempDir, 'style-security.html');
    const pdfPath = path.join(tempDir, 'style-security.pdf');
    const cssPath = path.join(tempDir, 'trusted.css');
    let requests = 0;
    const server = http.createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('body { display: none; }');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    fs.writeFileSync(cssPath, '.trusted-local-style { color: rgb(1, 2, 3); }');
    fs.writeFileSync(
      markdownPath,
      '# Before\n\n' +
      `<style media="print">@import url("http://127.0.0.1:${address.port}/remote.css");` +
      '.blocked-inline-style { display: none; }</style>\n\n' +
      '## After\n\n<p class="trusted-local-style" style="font-weight: bold">Visible content</p>\n'
    );

    const configuration = vscode.workspace.getConfiguration('markdown-pdf');
    await configuration.update('styles', ['trusted.css'], vscode.ConfigurationTarget.Global);

    try {
      const document = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');

      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('Before'));
      assert.ok(html.includes('After'));
      assert.ok(html.includes('Visible content'));
      assert.ok(html.includes('style="font-weight: bold"'));
      assert.ok(html.includes('trusted.css'));
      assert.ok(!html.includes('blocked-inline-style'));
      assert.ok(!html.includes('/remote.css'));
      assert.ok(fs.statSync(pdfPath).size > 0);
      assert.strictEqual(requests, 0, 'blocked inline CSS must not make a network request');
    } finally {
      await configuration.update('styles', undefined, vscode.ConfigurationTarget.Global);
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
