import * as path from 'path';
import * as vscode from 'vscode';
import * as os from 'os';

// All asset paths (styles/, template/, data/, node_modules/) are relative to
// the extension root. The bundle lives in dist/, so we go one level up.
export const EXTENSION_ROOT = path.join(__dirname, '..');

function pdf(resource?: vscode.Uri) {
  return vscode.workspace.getConfiguration('markdown-pdf', resource);
}

function md() {
  return vscode.workspace.getConfiguration('markdown');
}

export const config = {
  type: (): string[] => pdf().get<string[]>('type') ?? ['pdf'],
  convertOnSave: (): boolean => pdf().get<boolean>('convertOnSave') ?? false,
  convertOnSaveExclude: (): string[] => pdf().get<string[]>('convertOnSaveExclude') ?? [],
  outputDirectory: (): string => pdf().get<string>('outputDirectory') ?? '',
  styles: (resource?: vscode.Uri): string[] => pdf(resource).get<string[]>('styles') ?? [],
  highlight: (): boolean => pdf().get<boolean>('highlight') ?? true,
  highlightStyle: (): string => pdf().get<string>('highlightStyle') ?? 'github.css',
  breaks: (): boolean => pdf().get<boolean>('breaks') ?? false,
  emoji: (): boolean => pdf().get<boolean>('emoji') ?? true,
  math: (): boolean => pdf().get<boolean>('math') ?? true,
  executablePath: (): string => pdf().get<string>('executablePath') ?? '',
  displayHeaderFooter: (resource?: vscode.Uri): boolean => pdf(resource).get<boolean>('displayHeaderFooter') ?? false,
  headerTemplate: (resource?: vscode.Uri): string => pdf(resource).get<string>('headerTemplate') ?? '',
  footerTemplate: (resource?: vscode.Uri): string => pdf(resource).get<string>('footerTemplate') ?? '',
  printBackground: (resource?: vscode.Uri): boolean => pdf(resource).get<boolean>('printBackground') ?? true,
  orientation: (resource?: vscode.Uri): string => pdf(resource).get<string>('orientation') ?? 'portrait',
  format: (resource?: vscode.Uri): string => pdf(resource).get<string>('format') ?? 'A4',
  margin: (resource?: vscode.Uri) => {
    const m = pdf(resource).get<Record<string, string>>('margin') ?? {};
    return { top: m['top'] ?? '2cm', right: m['right'] ?? '2.5cm', bottom: m['bottom'] ?? '2cm', left: m['left'] ?? '2.5cm' };
  },
  timeout: (resource?: vscode.Uri): number => pdf(resource).get<number>('timeout') ?? 60000,
  allowPathsOutsideWorkspace: (): boolean => pdf().get<boolean>('allowPathsOutsideWorkspace') ?? false,
  markdownStyles: (): string[] => md().get<string[]>('styles') ?? [],
  homedir: (): string => os.homedir(),
};
