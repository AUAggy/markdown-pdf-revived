'use strict';

const assert = require('assert');
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
});
