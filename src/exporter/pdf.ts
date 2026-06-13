import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';
import { config } from '../config/settings';
import { BrowserLaunchError, launchBrowserWithPolicy } from '../browser/launch';
import { formatBrowserLaunchFailure, formatBrowserNotFound } from '../browser/diagnostics';
import { resolveBrowser } from '../browser/resolver';
import { logError, showErrorMessage } from '../utils/logger';
import { exportHtml } from './html';
import { getOutputDir, readUserStylesAsText } from '../template/page';

function transformTemplate(templateText: string): string {
  return templateText
    .replace('%%ISO-DATETIME%%', new Date().toISOString().substring(0, 19).replace('T', ' '))
    .replace('%%ISO-DATE%%', new Date().toISOString().substring(0, 10))
    .replace('%%ISO-TIME%%', new Date().toISOString().substring(11, 19));
}

export function createTempHtmlFile(baseName: string, data: string): { tempDir: string; tmpfilename: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-'));
  const tmpfilename = path.join(tempDir, `${baseName}.html`);
  // 'wx' flag: exclusive create — fails if file already exists (belt-and-suspenders)
  fs.writeFileSync(tmpfilename, data, { encoding: 'utf8', flag: 'wx' });
  return { tempDir, tmpfilename };
}

export function cleanupTempDir(tempDir: string | undefined): void {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function exportPdf(
  data: string,
  filename: string,
  type: string,
  uri: vscode.Uri
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeRt = require('vscode') as typeof import('vscode');
  vscodeRt.window.setStatusBarMessage('');
  const exportFilename = getOutputDir(filename, uri);

  return vscodeRt.window.withProgress(
    { location: vscodeRt.ProgressLocation.Notification, title: `[Markdown PDF]: Exporting (${type}) ...` },
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscodeRt = require('vscode') as typeof import('vscode');
      let tempDir: string | undefined;
      let browser: import('puppeteer-core').Browser | undefined;
      try {
        if (type === 'html') {
          await exportHtml(data, exportFilename);
          vscodeRt.window.setStatusBarMessage('$(markdown) ' + exportFilename, 10000);
          return;
        }

        const resolution = resolveBrowser({ configuredPath: config.executablePath() });
        if (!resolution.found) {
          void vscodeRt.window.showErrorMessage(formatBrowserNotFound(resolution.context));
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const puppeteer = require('puppeteer-core') as typeof import('puppeteer-core');
        const f = path.parse(filename);
        const temp = createTempHtmlFile(f.name, data);
        tempDir = temp.tempDir;
        const tmpfilename = temp.tmpfilename;

        browser = await launchBrowserWithPolicy(
          (options) => puppeteer.launch(options),
          resolution.executablePath,
          process.platform,
          vscodeRt.env.language
        );

        const page = await browser.newPage();
        await page.setDefaultTimeout(0);
        await page.goto(vscodeRt.Uri.file(tmpfilename).toString(), { waitUntil: 'networkidle0', timeout: config.timeout(uri) });

        // PR #399: wait for Mermaid async SVG rendering before PDF capture.
        const hasMermaid = await page.evaluate(
          /* eslint-disable-next-line @typescript-eslint/no-implied-eval */
          '() => document.querySelectorAll(".mermaid").length > 0'
        ) as boolean;
        if (hasMermaid) {
          await page.waitForFunction(
            '() => document.querySelectorAll(".mermaid:not([data-processed])").length === 0',
            { timeout: config.timeout(uri) }
          ).catch(() => { /* timeout — best-effort render */ });
        }

        if (type === 'pdf') {
          const margin = config.margin(uri);
          const userCss = readUserStylesAsText(uri);
          const headerFooterStyle = userCss ? `<style>${userCss}</style>` : '';
          await page.pdf({
            path: exportFilename,
            displayHeaderFooter: config.displayHeaderFooter(uri),
            headerTemplate: headerFooterStyle + transformTemplate(config.headerTemplate(uri)),
            footerTemplate: headerFooterStyle + transformTemplate(config.footerTemplate(uri)),
            printBackground: config.printBackground(uri),
            landscape: config.orientation(uri) === 'landscape',
            format: config.format(uri) as 'A4',
            margin: { top: margin.top || undefined, right: margin.right || undefined, bottom: margin.bottom || undefined, left: margin.left || undefined },
            timeout: config.timeout(uri),
          });
        }

        vscodeRt.window.setStatusBarMessage('$(markdown) ' + exportFilename, 10000);
      } catch (error) {
        if (error instanceof BrowserLaunchError) {
          void vscodeRt.window.showErrorMessage(formatBrowserLaunchFailure(error, process.platform));
          logError('exportPdf(): browser launch failed', {
            executablePath: error.executablePath,
            initialError: error.initialError,
            fallbackError: error.fallbackError,
          });
        } else {
          showErrorMessage('exportPdf()', error);
        }
      } finally {
        if (browser) { try { await browser.close(); } catch { /* best effort */ } }
        cleanupTempDir(tempDir);
      }
    }
  );
}
