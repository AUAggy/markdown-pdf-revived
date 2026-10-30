'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const runNode = promisify(execFile);
const { readPdfOutline, flattenOutline } = require('../pdfOutline');

const vscode = require('vscode');

// Move focus out of the text editor so activeTextEditor becomes undefined.
// That is the state the built-in Markdown preview produces, and the only input
// the export source selection uses, so a webview panel reproduces it without
// depending on the preview extension being present in the test harness.
async function focusNonTextEditor() {
  const panel = vscode.window.createWebviewPanel('markdownPdfFocusProbe', 'Focus probe', vscode.ViewColumn.Active);
  panel.reveal(vscode.ViewColumn.Active, false);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && vscode.window.activeTextEditor) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (vscode.window.activeTextEditor) {
    panel.dispose();
    throw new Error('could not move focus out of the text editor');
  }
  return panel;
}

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

  test('exports the tracked Markdown document when focus is not in a text editor (preview case)', async function () {
    this.timeout(45_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-preview-focus-'));
    const markdownPath = path.join(tempDir, 'preview-focus.md');
    const htmlPath = path.join(tempDir, 'preview-focus.html');
    const pdfPath = path.join(tempDir, 'preview-focus.pdf');
    fs.writeFileSync(markdownPath, '# Preview focus export\n\nExported while the preview had focus.');

    // Moving focus into a webview panel makes activeTextEditor undefined, which
    // is the state the built-in preview produces.
    let panel;
    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const closedBy = Date.now() + 10000;
      while (Date.now() < closedBy && vscode.workspace.textDocuments.some(entry => entry.languageId === 'markdown')) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const document = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(document);

      panel = await focusNonTextEditor();
      assert.strictEqual(vscode.window.activeTextEditor, undefined, 'focus must leave the text editor');
      console.log('[probe] target closed?', document.isClosed, 'exists?', fs.existsSync(markdownPath));
      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      assert.ok(fs.existsSync(htmlPath), 'HTML export must resolve the source from the tracked document');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('Preview focus export'));
      assert.ok(html.includes('Exported while the preview had focus.'));

      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');
      const pdf = fs.readFileSync(pdfPath);
      assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 0);
    } finally {
      panel?.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('warns about an active non-Markdown document instead of exporting another file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-non-markdown-'));
    const markdownPath = path.join(tempDir, 'context.md');
    const textPath = path.join(tempDir, 'context.txt');
    const htmlPath = path.join(tempDir, 'context.html');
    fs.writeFileSync(markdownPath, '# Markdown context');
    fs.writeFileSync(textPath, 'plain text');

    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const markdown = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(markdown);
      const plain = await vscode.workspace.openTextDocument(textPath);
      await vscode.window.showTextDocument(plain);

      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      assert.ok(!fs.existsSync(htmlPath), 'an active non-Markdown document must not trigger an export');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('does not silently pick a source when two Markdown documents are eligible', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-ambiguous-source-'));
    const firstPath = path.join(tempDir, 'first.md');
    const secondPath = path.join(tempDir, 'second.md');
    fs.writeFileSync(firstPath, '# First document');
    fs.writeFileSync(secondPath, '# Second document');
    let panel;

    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(firstPath));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(secondPath));
      panel = await focusNonTextEditor();
      assert.strictEqual(vscode.window.activeTextEditor, undefined, 'focus must leave the text editor');

      // The source picker opens and is dismissed without choosing anything.
      const exportRun = vscode.commands.executeCommand('extension.markdown-pdf.html');
      await new Promise(resolve => setTimeout(resolve, 750));
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
      await exportRun;
      await new Promise(resolve => setTimeout(resolve, 500));

      for (const output of ['first.html', 'second.html']) {
        assert.ok(!fs.existsSync(path.join(tempDir, output)), `cancelling must not write ${output}`);
      }
    } finally {
      panel?.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('save-triggered export uses the saved document, not the focused one', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-save-isolation-'));
    const savedPath = path.join(tempDir, 'saved.md');
    const focusedPath = path.join(tempDir, 'focused.md');
    const configuration = vscode.workspace.getConfiguration('markdown-pdf');
    await configuration.update('convertOnSave', true, vscode.ConfigurationTarget.Global);
    await configuration.update('type', ['html'], vscode.ConfigurationTarget.Global);

    try {
      // Re-activate so the save listener registers with convertOnSave enabled.
      const extension = vscode.extensions.getExtension('AUAggy.markdown-pdf-revived');
      assert.ok(extension);
      await extension.activate();

      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.writeFileSync(savedPath, '# Saved document\n\nSaved while another file had focus.');
      fs.writeFileSync(focusedPath, '# Focused document');

      const saved = await vscode.workspace.openTextDocument(savedPath);
      const focused = await vscode.workspace.openTextDocument(focusedPath);
      await vscode.window.showTextDocument(focused);
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, focused.uri.fsPath);

      const edited = new vscode.WorkspaceEdit();
      edited.insert(saved.uri, new vscode.Position(saved.lineCount, 0), '\nEdited before save.\n');
      assert.ok(await vscode.workspace.applyEdit(edited), 'the edit must apply');
      assert.ok(saved.isDirty, 'the document must be dirty before saving');
      await saved.save();

      const deadline = Date.now() + 60_000;
      const htmlPath = path.join(tempDir, 'saved.html');
      while (Date.now() < deadline && !fs.existsSync(htmlPath)) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.ok(fs.existsSync(htmlPath), 'the saved document must be exported');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('Saved document'));
      assert.ok(!html.includes('Focused document'), 'the focused document must not be exported');
      assert.ok(!fs.existsSync(path.join(tempDir, 'focused.html')));
    } finally {
      await configuration.update('convertOnSave', undefined, vscode.ConfigurationTarget.Global);
      await configuration.update('type', undefined, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

  test('renders packaged math and Mermaid assets offline in HTML and PDF exports', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-rendering-'));
    const markdownPath = path.join(tempDir, 'rendering.md');
    const htmlPath = path.join(tempDir, 'rendering.html');
    const pdfPath = path.join(tempDir, 'rendering.pdf');
    fs.writeFileSync(markdownPath, [
      '# Rendering regression',
      '$$E = mc^2$$',
      '$$\\frac{a}{b} + \\sqrt{x}$$',
      '$$\\sum_{i=1}^{n} i$$',
      '$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$',
      '```mermaid\ngraph TD; A[Start]-->B{Decision}; B-->|yes|C[Finish]; B-->|no|A;\n```',
      '```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi\n```',
      '```mermaid\nflowchart LR\n A["$$x^2 + y^2$$"] --> B["$$z^2$$"]\n```',
    ].join('\n\n'));
    try {
      const document = await vscode.workspace.openTextDocument(markdownPath);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      const { stdout } = await runNode(process.execPath, [path.resolve(__dirname, '..', 'renderHtml.js'), htmlPath], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 90000,
      });
      assert.ok(stdout.includes('"diagrams":3'), 'browser must verify the exported HTML assets');
      console.log('[probe] invoking pdf export');
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');
      console.log('[probe] pdf export returned');
      const pdf = fs.readFileSync(pdfPath);
      assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 1000, 'rendered PDF should contain content');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('applies folder-scoped stylesheets to each workspace folder separately', async function () {
    this.timeout(120_000);
    const folders = (process.env.MARKDOWN_PDF_TEST_FOLDERS || '').split(path.delimiter).filter(Boolean);
    if (folders.length < 2) {
      throw new Error('multi-root workspace fixture missing; set MARKDOWN_PDF_TEST_FOLDERS');
    }
    const [alphaFolder, betaFolder] = folders;
    const alphaCss = path.join(alphaFolder, 'alpha.css');
    const betaCss = path.join(betaFolder, 'beta.css');
    const alphaDoc = path.join(alphaFolder, 'scoped.md');
    const betaDoc = path.join(betaFolder, 'scoped.md');
    const alphaHtml = path.join(alphaFolder, 'scoped.html');
    const betaHtml = path.join(betaFolder, 'scoped.html');

    fs.writeFileSync(alphaCss, '.folder-marker-alpha { color: rgb(1, 2, 3); }');
    fs.writeFileSync(betaCss, '.folder-marker-beta { color: rgb(4, 5, 6); }');
    fs.writeFileSync(alphaDoc, '# Alpha folder document');
    fs.writeFileSync(betaDoc, '# Beta folder document');

    const alphaConfig = vscode.workspace.getConfiguration('markdown-pdf', vscode.Uri.file(alphaDoc));
    const betaConfig = vscode.workspace.getConfiguration('markdown-pdf', vscode.Uri.file(betaDoc));

    try {
      await alphaConfig.update('styles', ['alpha.css'], vscode.ConfigurationTarget.WorkspaceFolder);
      await betaConfig.update('styles', ['beta.css'], vscode.ConfigurationTarget.WorkspaceFolder);
      await alphaConfig.update('displayHeaderFooter', true, vscode.ConfigurationTarget.WorkspaceFolder);
      await betaConfig.update('displayHeaderFooter', true, vscode.ConfigurationTarget.WorkspaceFolder);

      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(alphaDoc));
      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(betaDoc));
      await vscode.commands.executeCommand('extension.markdown-pdf.html');

      const alpha = fs.readFileSync(alphaHtml, 'utf8');
      const beta = fs.readFileSync(betaHtml, 'utf8');
      assert.ok(alpha.includes('Alpha folder document'));
      assert.ok(beta.includes('Beta folder document'));
      assert.ok(alpha.includes('alpha.css'), 'folder A must use its own stylesheet');
      assert.ok(beta.includes('beta.css'), 'folder B must use its own stylesheet');
      assert.ok(!alpha.includes('beta.css'), 'folder A must not inherit folder B styles');
      assert.ok(!beta.includes('alpha.css'), 'folder B must not inherit folder A styles');

      // Header/footer CSS uses the same resource-aware accessor; PDF export in
      // each folder must succeed with displayHeaderFooter enabled.
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(alphaDoc));
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');
      const alphaPdf = path.join(alphaFolder, 'scoped.pdf');
      assert.ok(fs.existsSync(alphaPdf));
      assert.strictEqual(fs.readFileSync(alphaPdf).subarray(0, 5).toString(), '%PDF-');
    } finally {
      await alphaConfig.update('styles', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      await betaConfig.update('styles', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      await alphaConfig.update('displayHeaderFooter', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      await betaConfig.update('displayHeaderFooter', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      for (const file of [alphaCss, betaCss, alphaDoc, betaDoc, alphaHtml, betaHtml, path.join(alphaFolder, 'scoped.pdf')]) {
        fs.rmSync(file, { force: true });
      }
    }
  });

  test('adds PDF bookmarks only when markdown-pdf.outline is enabled', async function () {
    this.timeout(120_000);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-outline-'));
    const markdownPath = path.join(tempDir, 'outline.md');
    const pdfPath = path.join(tempDir, 'outline.pdf');
    const htmlPath = path.join(tempDir, 'outline.html');
    const configuration = vscode.workspace.getConfiguration('markdown-pdf');
    fs.writeFileSync(markdownPath, [
      '# One', 'a', '## One A', 'b', '### One A i', 'c', '## One B', 'd', '# Two', 'e',
    ].join('\n\n'));

    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(markdownPath));

      // Default is off: no outline, and existing output is unchanged.
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');
      assert.strictEqual(readPdfOutline(pdfPath), null, 'bookmarks must be off by default');

      await configuration.update('outline', true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('extension.markdown-pdf.pdf');
      const outline = readPdfOutline(pdfPath);
      assert.ok(outline, 'enabling the setting must produce an outline');
      assert.deepStrictEqual(flattenOutline(outline), [
        { title: 'One', depth: 0, hasDestination: true },
        { title: 'One A', depth: 1, hasDestination: true },
        { title: 'One A i', depth: 2, hasDestination: true },
        { title: 'One B', depth: 1, hasDestination: true },
        { title: 'Two', depth: 0, hasDestination: true },
      ], 'bookmark titles, nesting and destinations must match the headings');

      // HTML export is unaffected by a PDF-only option.
      await vscode.commands.executeCommand('extension.markdown-pdf.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      for (const heading of ['One A i', 'One B', 'Two']) {
        assert.ok(html.includes(heading), `HTML export must still contain ${heading}`);
      }
    } finally {
      await configuration.update('outline', undefined, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
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
