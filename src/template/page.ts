import * as path from 'path';
import * as os from 'os';
import type * as vscode from 'vscode';
import { EXTENSION_ROOT, config } from '../config/settings';
import { readFile, isExistsDir, mkdir } from '../utils/file';
import { showErrorMessage } from '../utils/logger';
import { safeResolvePath, safeReadFile, getAllowedRoot } from '../utils/pathSecurity';

function makeCss(filename: string): string {
  try {
    const css = readFile(filename) as string;
    return css ? '\n<style>\n' + css + '\n</style>\n' : '';
  } catch (error) {
    showErrorMessage('makeCss()', error);
    return '';
  }
}

// Testable core logic without vscode dependency
export function resolveStylePathSecure(href: string, baseDir: string, allowedRoot: string): string | null {
  return safeResolvePath(href, baseDir, allowedRoot);
}

export function readUserStylesAsTextCore(hrefs: string[], baseDir: string, allowedRoot: string): string {
  let css = '';
  for (const href of hrefs) {
    const content = safeReadFile(href, baseDir, allowedRoot);
    if (content !== null) {
      css += content + '\n';
    }
  }
  return css;
}

export function fixHrefSecure(href: string, baseDir: string, allowedRoot: string): string | null {
  if (!href) return href;
  // Pass through remote URLs
  if (href.startsWith('http://') || href.startsWith('https://')) return href;

  let expanded = href;
  if (href.startsWith('~')) {
    expanded = href.replace(/^~/, os.homedir());
  }
  return safeResolvePath(expanded, baseDir, allowedRoot);
}

export function resolveStylePath(href: string, uri: vscode.Uri): string | null {
  const allowedRoot = getAllowedRoot(uri.fsPath);
  const baseDir = path.dirname(uri.fsPath);
  return resolveStylePathSecure(href, baseDir, allowedRoot);
}

function fixHref(resource: vscode.Uri, href: string): string {
  try {
    if (!href) return href;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscodeRt = require('vscode') as typeof import('vscode');
    const hrefUri = vscodeRt.Uri.parse(href);
    if (['http', 'https'].includes(hrefUri.scheme)) return hrefUri.toString();

    const allowedRoot = getAllowedRoot(resource.fsPath);
    const resolved = fixHrefSecure(href, path.dirname(resource.fsPath), allowedRoot);
    if (!resolved) {
      showErrorMessage(`Blocked stylesheet outside workspace: ${href}. Set markdown-pdf.allowPathsOutsideWorkspace to true if intentional.`);
      return '';
    }
    return vscodeRt.Uri.file(resolved).toString();
  } catch (error) {
    showErrorMessage('fixHref()', error);
    return '';
  }
}

export function readStyles(uri: vscode.Uri): string {
  try {
    let style = '';

    // 1. Default markdown CSS
    style += makeCss(path.join(EXTENSION_ROOT, 'styles', 'markdown.css'));

    // 2. VS Code markdown.styles setting
    for (const href of config.markdownStyles()) {
      style += `<link rel="stylesheet" href="${fixHref(uri, href)}" type="text/css">`;
    }

    // 3. KaTeX styles (linked, not inlined, so relative font paths resolve in Puppeteer)
    if (config.math()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscodeRt = require('vscode') as typeof import('vscode');
      const katexCss = path.join(EXTENSION_ROOT, 'node_modules', 'katex', 'dist', 'katex.min.css');
      style += `<link rel="stylesheet" href="${vscodeRt.Uri.file(katexCss).toString()}">`;
    }

    // 4. Syntax highlighting
    if (config.highlight()) {
      const highlightStyle = config.highlightStyle();
      if (highlightStyle) {
        style += makeCss(path.join(EXTENSION_ROOT, 'node_modules', 'highlight.js', 'styles', highlightStyle));
      } else {
        style += makeCss(path.join(EXTENSION_ROOT, 'styles', 'tomorrow.css'));
      }
    }

    // 5. Extension default styles
    style += makeCss(path.join(EXTENSION_ROOT, 'styles', 'markdown-pdf.css'));

    // 6. User custom stylesheets
    for (const href of config.styles(uri)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscodeRt = require('vscode') as typeof import('vscode');
      const resolved = resolveStylePath(href, uri);
      if (resolved) {
        style += `<link rel="stylesheet" href="${vscodeRt.Uri.file(resolved).toString()}" type="text/css">`;
      } else {
        showErrorMessage(`Blocked stylesheet outside workspace: ${href}. Set markdown-pdf.allowPathsOutsideWorkspace to true if intentional.`);
      }
    }

    return style;
  } catch (error) {
    showErrorMessage('readStyles()', error);
    return '';
  }
}

export function readUserStylesAsText(uri: vscode.Uri): string {
  const allowedRoot = getAllowedRoot(uri.fsPath);
  const baseDir = path.dirname(uri.fsPath);
  return readUserStylesAsTextCore(config.styles(uri), baseDir, allowedRoot);
}

export function makeHtml(content: string, uri: vscode.Uri, frontmatterTitle?: string): string | null {
  try {
    const style = readStyles(uri);
    const title = frontmatterTitle ?? path.basename(uri.fsPath);
    const templatePath = path.join(EXTENSION_ROOT, 'template', 'template.html');
    const template = readFile(templatePath) as string;
    const mermaidPath = path.join(EXTENSION_ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
    const mermaidContent = readFile(mermaidPath) as string;
    const mermaid = mermaidContent ? '<script>' + mermaidContent + '</script>' : '';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mustache = require('mustache') as { render: (t: string, v: object) => string };
    return mustache.render(template, { title, style, content, mermaid });
  } catch (error) {
    showErrorMessage('makeHtml()', error);
    return null;
  }
}

export function getOutputDir(filename: string, resource?: vscode.Uri): string {
  try {
    if (!resource) return filename;
    const outputDirectory = config.outputDirectory();
    if (outputDirectory.length === 0) return filename;

    let outputDir: string;
    if (outputDirectory.startsWith('~')) {
      outputDir = outputDirectory.replace(/^~/, os.homedir());
      mkdir(outputDir);
      return path.join(outputDir, path.basename(filename));
    }

    if (path.isAbsolute(outputDirectory)) {
      if (!isExistsDir(outputDirectory)) {
        showErrorMessage(`Output directory does not exist: ${outputDirectory}`);
        return filename;
      }
      return path.join(outputDirectory, path.basename(filename));
    }

    // Relative: resolve from workspace root, fall back to file directory
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscodeRt = require('vscode') as typeof import('vscode');
    const root = vscodeRt.workspace.getWorkspaceFolder(resource);
    if (root) {
      outputDir = path.join(root.uri.fsPath, outputDirectory);
      mkdir(outputDir);
      return path.join(outputDir, path.basename(filename));
    }

    outputDir = path.join(path.dirname(resource.fsPath), outputDirectory);
    mkdir(outputDir);
    return path.join(outputDir, path.basename(filename));
  } catch (error) {
    showErrorMessage('getOutputDir()', error);
    return filename;
  }
}
