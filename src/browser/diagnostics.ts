import { BrowserLaunchError } from './launch';
import type { BrowserResolutionContext } from './resolver';

const MAX_SUMMARY_LENGTH = 240;
const MAX_MESSAGE_LENGTH = 900;

export function summarizeLaunchError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim();
  if (firstLine.length <= MAX_SUMMARY_LENGTH) return firstLine;
  return firstLine.slice(0, MAX_SUMMARY_LENGTH - 3) + '...';
}

function boundMessage(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_MESSAGE_LENGTH - 3) + '...';
}

export function formatBrowserNotFound(context: BrowserResolutionContext): string {
  const invalid = context.invalidConfiguredPath
    ? ` Configured path is missing or inaccessible: ${context.invalidConfiguredPath}.`
    : '';
  const wsl = context.isWsl ? ' WSL requires a browser installed inside the WSL distribution.' : '';
  const searched = context.searched.map((candidate) => candidate.path).join(', ');
  return boundMessage(
    `[Markdown PDF] No supported browser found on ${context.platform}.${invalid}` +
    ` Set markdown-pdf.executablePath or install stable Chrome, Chromium, or Edge.${wsl}` +
    ` Searched: ${searched}`
  );
}

export function formatBrowserLaunchFailure(error: BrowserLaunchError, platform: NodeJS.Platform): string {
  const first = summarizeLaunchError(error.initialError);
  if (error.fallbackError !== undefined) {
    return boundMessage(
      `[Markdown PDF] Browser launch failed on ${platform} using ${error.executablePath}. ` +
      `The sandboxed attempt failed (${first}); the Linux --no-sandbox fallback also failed ` +
      `(${summarizeLaunchError(error.fallbackError)}). Check the browser installation and extension-host log.`
    );
  }
  return boundMessage(
    `[Markdown PDF] Browser launch failed on ${platform} using ${error.executablePath}: ${first}. ` +
    'Check the browser installation, permissions, and extension-host log.'
  );
}
