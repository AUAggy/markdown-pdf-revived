import * as path from 'path';
import * as vscode from 'vscode';
import { config } from './config/settings';
import { convertMarkdownToHtml } from './converter/markdown';
import { sanitizeContent } from './converter/sanitize';
import { makeHtml } from './template/page';
import { exportPdf } from './exporter/pdf';
import { showErrorMessage } from './utils/logger';
import { isExistsPath } from './utils/file';
import type { OptionType, ExportType } from './types';

const SUPPORTED_FORMATS: ExportType[] = ['html', 'pdf'];

export function activate(context: vscode.ExtensionContext): void {
  const commands = [
    vscode.commands.registerCommand('extension.markdown-pdf.settings', () => markdownPdf('settings')),
    vscode.commands.registerCommand('extension.markdown-pdf.pdf', () => markdownPdf('pdf')),
    vscode.commands.registerCommand('extension.markdown-pdf.html', () => markdownPdf('html')),
    vscode.commands.registerCommand('extension.markdown-pdf.all', () => markdownPdf('all')),
  ];
  commands.forEach(cmd => context.subscriptions.push(cmd));

  if (config.convertOnSave()) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(() => markdownPdfOnSave())
    );
  }
}

export function deactivate(): void {
  // nothing to clean up
}

async function markdownPdf(optionType: OptionType): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active Editor!'); return; }
    if (editor.document.languageId !== 'markdown') { vscode.window.showWarningMessage('It is not a markdown mode!'); return; }

    const uri = editor.document.uri;
    const mdfilename = uri.fsPath;
    const ext = path.extname(mdfilename);

    if (!isExistsPath(mdfilename)) {
      vscode.window.showWarningMessage(editor.document.isUntitled ? 'Please save the file!' : 'File name does not get!');
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

    for (const type of types) {
      const outputFilename = mdfilename.replace(ext, '.' + type);
      const text = editor.document.getText();
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

function markdownPdfOnSave(): void {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') return;
    if (!isMarkdownPdfOnSaveExclude(editor)) {
      void markdownPdf('settings');
    }
  } catch (error) {
    showErrorMessage('markdownPdfOnSave()', error);
  }
}

function isMarkdownPdfOnSaveExclude(editor: vscode.TextEditor): boolean {
  try {
    const filename = path.basename(editor.document.fileName);
    const patterns = config.convertOnSaveExclude();
    return patterns.some(pattern => new RegExp(pattern).test(filename));
  } catch (error) {
    showErrorMessage('isMarkdownPdfOnSaveExclude()', error);
    return false;
  }
}
