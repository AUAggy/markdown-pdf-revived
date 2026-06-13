'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

suite('Markdown PDF extension', () => {
  test('activates and registers export commands', async () => {
    const extension = vscode.extensions.all.find(
      (candidate) => candidate.packageJSON.name === 'markdown-pdf-revived'
    );

    assert.ok(extension, 'extension should be installed in the development host');
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
});
