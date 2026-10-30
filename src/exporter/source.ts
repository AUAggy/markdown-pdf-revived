// Export source selection (plan workstream C).
//
// The export command used to require an active TextEditor, so exporting failed
// whenever focus sat in a preview or another non-text view. Source selection is
// now decided once, from the active text editor plus the recently used Markdown
// documents, and the export body consumes a plain document.
//
// This module is deliberately free of the VS Code API so the decision rules can
// be unit tested. `SourceDocument` is satisfied by vscode.TextDocument.

export interface SourceDocument {
  uri: { toString(): string; fsPath: string; scheme: string };
  languageId: string;
  isUntitled: boolean;
  fileName: string;
}

export type SourceSelection<D extends SourceDocument> =
  | { kind: 'single'; document: D }
  | { kind: 'ambiguous'; candidates: D[] }
  | { kind: 'non-markdown'; document: D }
  | { kind: 'unsaved' }
  | { kind: 'none' };

function isMarkdown(document: SourceDocument): boolean {
  return document.languageId === 'markdown';
}

// Export needs a real file on disk; untitled buffers have no output path.
function isExportable(document: SourceDocument): boolean {
  return !document.isUntitled && document.uri.scheme === 'file';
}

function uniqueByUri<D extends SourceDocument>(documents: readonly D[]): D[] {
  const seen = new Set<string>();
  const unique: D[] = [];
  for (const document of documents) {
    const key = document.uri.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(document);
  }
  return unique;
}

export interface SelectSourceOptions<D extends SourceDocument> {
  /** Document backing the active text editor, if focus is in one. */
  activeDocument?: D;
  /** Recent Markdown documents, most recent first. */
  tracked: readonly D[];
}

/**
 * Decide which document to export.
 *
 * An active text document always wins, including when it is not Markdown: the
 * user is looking at it, so warning about it beats silently exporting something
 * else. With focus outside a text editor, exactly one open Markdown document is
 * unambiguous. Two or more are ambiguous and must be resolved by the user; the
 * most recently edited document is not assumed to be the previewed one.
 */
export function selectExportSource<D extends SourceDocument>(
  options: SelectSourceOptions<D>
): SourceSelection<D> {
  const active = options.activeDocument;
  if (active) {
    return isMarkdown(active)
      ? { kind: 'single', document: active }
      : { kind: 'non-markdown', document: active };
  }

  const markdownDocuments = uniqueByUri(options.tracked.filter(isMarkdown));
  const exportable = markdownDocuments.filter(isExportable);

  if (exportable.length === 1) return { kind: 'single', document: exportable[0] };
  if (exportable.length > 1) return { kind: 'ambiguous', candidates: exportable };
  // Only an unsaved buffer warrants "please save"; other non-file schemes are
  // simply not export targets.
  if (markdownDocuments.some(document => document.isUntitled)) return { kind: 'unsaved' };
  return { kind: 'none' };
}
