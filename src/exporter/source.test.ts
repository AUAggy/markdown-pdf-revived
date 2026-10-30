import * as assert from 'assert';
import { selectExportSource, type SourceDocument } from './source';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

function doc(name: string, options: { languageId?: string; untitled?: boolean; scheme?: string } = {}): SourceDocument {
  const scheme = options.scheme ?? 'file';
  return {
    uri: { toString: () => `${scheme}:///${name}`, fsPath: `/${name}`, scheme },
    languageId: options.languageId ?? 'markdown',
    isUntitled: options.untitled ?? false,
    fileName: `/${name}`,
  };
}

describe('selectExportSource', () => {

  it('prefers the active Markdown document over tracked documents', () => {
    const active = doc('active.md');
    const selection = selectExportSource({ activeDocument: active, tracked: [doc('other.md'), active] });
    assert.strictEqual(selection.kind, 'single');
    assert.strictEqual(selection.kind === 'single' && selection.document, active);
  });

  it('reports an active non-Markdown document instead of exporting another one', () => {
    const active = doc('notes.txt', { languageId: 'plaintext' });
    const selection = selectExportSource({ activeDocument: active, tracked: [doc('guide.md')] });
    assert.strictEqual(selection.kind, 'non-markdown');
    assert.strictEqual(selection.kind === 'non-markdown' && selection.document, active);
  });

  it('exports the only open Markdown document when focus left the editor', () => {
    const only = doc('guide.md');
    const selection = selectExportSource({ tracked: [only] });
    assert.strictEqual(selection.kind, 'single');
    assert.strictEqual(selection.kind === 'single' && selection.document, only);
  });

  it('treats two open Markdown documents as ambiguous rather than guessing', () => {
    const selection = selectExportSource({ tracked: [doc('b.md'), doc('a.md')] });
    assert.strictEqual(selection.kind, 'ambiguous');
    assert.deepStrictEqual(
      selection.kind === 'ambiguous' && selection.candidates.map(candidate => candidate.fileName),
      ['/b.md', '/a.md']
    );
  });

  it('collapses duplicate entries for the same document', () => {
    const same = doc('guide.md');
    const selection = selectExportSource({ tracked: [same, doc('guide.md')] });
    assert.strictEqual(selection.kind, 'single');
  });

  it('reports unsaved buffers so the caller can ask the user to save', () => {
    const selection = selectExportSource({ tracked: [doc('Untitled-1', { untitled: true, scheme: 'untitled' })] });
    assert.strictEqual(selection.kind, 'unsaved');
  });

  it('ignores unsaved buffers when a saved document is also open', () => {
    const saved = doc('guide.md');
    const selection = selectExportSource({ tracked: [doc('Untitled-1', { untitled: true, scheme: 'untitled' }), saved] });
    assert.strictEqual(selection.kind, 'single');
    assert.strictEqual(selection.kind === 'single' && selection.document, saved);
  });

  it('ignores non-file documents and non-Markdown documents when nothing is active', () => {
    const selection = selectExportSource({
      tracked: [doc('remote.md', { scheme: 'vscode-remote' }), doc('notes.txt', { languageId: 'plaintext' })],
    });
    assert.strictEqual(selection.kind, 'none');
  });

  it('reports no source when nothing is tracked', () => {
    assert.strictEqual(selectExportSource({ tracked: [] }).kind, 'none');
  });
});
