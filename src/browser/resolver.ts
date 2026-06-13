import * as fs from 'fs';
import * as path from 'path';

export type SupportedPlatform = 'win32' | 'darwin' | 'linux';

export interface BrowserCandidate {
  browser: 'Chrome' | 'Chromium' | 'Edge';
  path: string;
}

export interface BrowserResolutionContext {
  platform: SupportedPlatform;
  isWsl: boolean;
  configuredPath?: string;
  invalidConfiguredPath?: string;
  searched: BrowserCandidate[];
}

export type BrowserResolution =
  | { found: true; executablePath: string; source: 'configured' | 'detected'; context: BrowserResolutionContext }
  | { found: false; context: BrowserResolutionContext };

export interface BrowserResolverOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  configuredPath?: string;
  exists?: (candidate: string) => boolean;
}

function joinIfSet(root: string | undefined, ...segments: string[]): string | undefined {
  return root ? path.win32.join(root, ...segments) : undefined;
}

function uniqueCandidates(candidates: Array<BrowserCandidate | undefined>): BrowserCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is BrowserCandidate => {
    if (!candidate || seen.has(candidate.path)) return false;
    seen.add(candidate.path);
    return true;
  });
}

function windowsCandidates(env: NodeJS.ProcessEnv): BrowserCandidate[] {
  const local = env['LOCALAPPDATA'];
  const programFiles = env['PROGRAMFILES'] || 'C:\\Program Files';
  const programFilesX86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return uniqueCandidates([
    joinIfSet(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
      ? { browser: 'Chrome', path: joinIfSet(local, 'Google', 'Chrome', 'Application', 'chrome.exe')! }
      : undefined,
    { browser: 'Chrome', path: path.win32.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') },
    { browser: 'Chrome', path: path.win32.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe') },
    joinIfSet(local, 'Chromium', 'Application', 'chrome.exe')
      ? { browser: 'Chromium', path: joinIfSet(local, 'Chromium', 'Application', 'chrome.exe')! }
      : undefined,
    { browser: 'Chromium', path: path.win32.join(programFiles, 'Chromium', 'Application', 'chrome.exe') },
    joinIfSet(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ? { browser: 'Edge', path: joinIfSet(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')! }
      : undefined,
    { browser: 'Edge', path: path.win32.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
    { browser: 'Edge', path: path.win32.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
  ]);
}

function macCandidates(): BrowserCandidate[] {
  return [
    { browser: 'Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { browser: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
    { browser: 'Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  ];
}

function linuxCandidates(): BrowserCandidate[] {
  return [
    { browser: 'Chrome', path: '/usr/bin/google-chrome' },
    { browser: 'Chrome', path: '/usr/bin/google-chrome-stable' },
    { browser: 'Chromium', path: '/usr/bin/chromium-browser' },
    { browser: 'Chromium', path: '/usr/bin/chromium' },
    { browser: 'Chromium', path: '/snap/bin/chromium' },
    { browser: 'Edge', path: '/usr/bin/microsoft-edge' },
    { browser: 'Edge', path: '/usr/bin/microsoft-edge-stable' },
  ];
}

export function isWslEnvironment(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  return platform === 'linux' && Boolean(env['WSL_DISTRO_NAME'] || env['WSL_INTEROP']);
}

export function getBrowserCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = {}
): BrowserCandidate[] {
  if (platform === 'win32') return windowsCandidates(env);
  if (platform === 'darwin') return macCandidates();
  return linuxCandidates();
}

export function resolveBrowser(options: BrowserResolverOptions = {}): BrowserResolution {
  const platform = options.platform ?? process.platform;
  const supportedPlatform: SupportedPlatform =
    platform === 'win32' || platform === 'darwin' ? platform : 'linux';
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const configuredPath = options.configuredPath?.trim() || undefined;
  const searched = getBrowserCandidates(supportedPlatform, env);
  const context: BrowserResolutionContext = {
    platform: supportedPlatform,
    isWsl: isWslEnvironment(supportedPlatform, env),
    configuredPath,
    searched,
  };

  if (configuredPath) {
    if (exists(configuredPath)) {
      return { found: true, executablePath: configuredPath, source: 'configured', context };
    }
    context.invalidConfiguredPath = configuredPath;
  }

  const detected = searched.find((candidate) => exists(candidate.path));
  if (detected) {
    return { found: true, executablePath: detected.path, source: 'detected', context };
  }
  return { found: false, context };
}
