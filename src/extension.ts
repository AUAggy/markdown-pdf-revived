import * as path from 'path';
import * as vscode from 'vscode';
import { config } from './config/settings';
import { convertMarkdownToHtml } from './converter/markdown';
import { sanitizeContent } from './converter/sanitize';
import { makeHtml } from './template/page';
import { exportPdf } from './exporter/pdf';
import { selectExportSource, type SourceSelection } from './exporter/source';
import { showErrorMessage } from './utils/logger';
import { isExistsPath } from './utils/file';
import type { OptionType, ExportType } from './types';

const SUPPORTED_FORMATS: ExportType[] = ['html', 'pdf'];

// Bounded memory of recently used Markdown documents, most recent first. This
// is what makes export work while focus sits in a preview or another non-text
// view; it deliberately holds no assumption about which document is previewed.
const MAX_TRACKED_DOCUMENTS = 10;
const trackedDocuments: vscode.TextDocument[] = [];

function forgetTrackedDocument(document: vscode.TextDocument): void {
  const key = document.uri.toString();
  for (let index = trackedDocuments.length - 1; index >= 0; index--) {
    if (trackedDocuments[index].uri.toString() === key) trackedDocuments.splice(index, 1);
  }
}

function rememberDocument(document: vscode.TextDocument): void {
  if (document.languageId !== 'markdown') return;
  forgetTrackedDocument(document);
  trackedDocuments.unshift(document);
  if (trackedDocuments.length > MAX_TRACKED_DOCUMENTS) trackedDocuments.length = MAX_TRACKED_DOCUMENTS;
}

export function activate(context: vscode.ExtensionContext): void {
  const commands = [
    vscode.commands.registerCommand('extension.markdown-pdf.settings', () => markdownPdf('settings')),
    vscode.commands.registerCommand('extension.markdown-pdf.pdf', () => markdownPdf('pdf')),
    vscode.commands.registerCommand('extension.markdown-pdf.html', () => markdownPdf('html')),
    vscode.commands.registerCommand('extension.markdown-pdf.all', () => markdownPdf('all')),
  ];
  commands.forEach(cmd => context.subscriptions.push(cmd));

  // Seed with documents restored from the previous session, then keep the list
  // current. Everything is disposed with the extension context.
  vscode.workspace.textDocuments.forEach(rememberDocument);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(rememberDocument),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) rememberDocument(editor.document);
    }),
    vscode.workspace.onDidCloseTextDocument(forgetTrackedDocument)
  );

  // Register unconditionally and check the setting per save: toggling
  // markdown-pdf.convertOnSave then works without reloading the window.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => markdownPdfOnSave(document))
  );
}

export function deactivate(): void {
  // nothing to clean up
}

async function chooseSource<D extends vscode.TextDocument>(
  selection: SourceSelection<D>
): Promise<vscode.TextDocument | undefined> {
  switch (selection.kind) {
    case 'single':
      return selection.document;
    case 'non-markdown':
      vscode.window.showWarningMessage('It is not a markdown mode!');
      return undefined;
    case 'unsaved':
      vscode.window.showWarningMessage('Please save the file!');
      return undefined;
    case 'none':
      vscode.window.showWarningMessage('No active Editor!');
      return undefined;
    case 'ambiguous': {
      const picked = await vscode.window.showQuickPick(
        selection.candidates.map(document => ({
          label: vscode.workspace.asRelativePath(document.uri),
          document,
        })),
        { placeHolder: 'Select the Markdown file to export' }
      );
      // Cancelled: write nothing.
      return picked?.document;
    }
  }
}

async function markdownPdf(optionType: OptionType, source?: vscode.TextDocument): Promise<void> {
  try {
    // Convert-on-save passes its document explicitly and never reaches the
    // interactive selection path.
    const document = source ?? await chooseSource(selectExportSource({
      activeDocument: vscode.window.activeTextEditor?.document,
      tracked: trackedDocuments,
    }));
    if (!document) return;

    const uri = document.uri;
    const mdfilename = uri.fsPath;
    const ext = path.extname(mdfilename);

    if (!isExistsPath(mdfilename)) {
      vscode.window.showWarningMessage(document.isUntitled ? 'Please save the file!' : 'File name does not get!');
      return;
    }

    let types: ExportType[];
    if (SUPPORTED_FORMATS.includes(optionType as ExportType)) {
      types = [optionType as ExportType];
    } else if (optionType === 'settings') {
      const raw = config.type();
      types = (Array.isArray(raw) ? raw : [raw]).filter((t): t is ExportType => SUPPORTED_FORMATS.includes(t as ExportType));
    } else if (optionType === 'all') {
      types = SUPPORTED_FORMATS;
    } else {
      showErrorMessage('markdownPdf(): Supported formats: html, pdf.');
      return;
    }

    if (types.length === 0) {
      showErrorMessage('markdownPdf(): No valid output formats configured.');
      return;
    }

    // Read the text once so every requested format exports the same source.
    const text = document.getText();

    for (const type of types) {
      const outputFilename = mdfilename.replace(ext, '.' + type);
      const result = convertMarkdownToHtml(mdfilename, type, text);
      if (!result) return;
      const sanitized = sanitizeContent(result.html);
      if (sanitized === null) {
        showErrorMessage('makeHtml(): Aborting export — content could not be sanitized.');
        return;
      }
      const html = makeHtml(sanitized, uri, result.title);
      if (!html) return;
      await exportPdf(html, outputFilename, type, uri);
    }
  } catch (error) {
    showErrorMessage('markdownPdf()', error);
  }
}

function markdownPdfOnSave(document: vscode.TextDocument): void {
  try {
    if (document.languageId !== 'markdown') return;
    if (!config.convertOnSave()) return;
    rememberDocument(document);
    if (!isMarkdownPdfOnSaveExclude(document)) {
      void markdownPdf('settings', document);
    }
  } catch (error) {
    showErrorMessage('markdownPdfOnSave()', error);
  }
}

function isMarkdownPdfOnSaveExclude(document: vscode.TextDocument): boolean {
  try {
    const filename = path.basename(document.fileName);
    const patterns = config.convertOnSaveExclude();
    return patterns.some(pattern => new RegExp(pattern).test(filename));
  } catch (error) {
    showErrorMessage('isMarkdownPdfOnSaveExclude()', error);
    return false;
  }
}
