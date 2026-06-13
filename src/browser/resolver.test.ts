import * as assert from 'assert';
import { getBrowserCandidates, isWslEnvironment, resolveBrowser } from './resolver';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

describe('browser resolver', () => {
  it('selects a valid configured executable first', () => {
    const configured = '/custom/browser';
    const result = resolveBrowser({
      platform: 'linux',
      configuredPath: configured,
      exists: (candidate) => candidate === configured || candidate === '/usr/bin/google-chrome',
    });
    assert.ok(result.found);
    assert.strictEqual(result.executablePath, configured);
    assert.strictEqual(result.source, 'configured');
  });

  it('falls back from an invalid configured path and retains it for diagnostics', () => {
    const result = resolveBrowser({
      platform: 'linux',
      configuredPath: '/missing/browser',
      exists: (candidate) => candidate === '/usr/bin/google-chrome',
    });
    assert.ok(result.found);
    assert.strictEqual(result.executablePath, '/usr/bin/google-chrome');
    assert.strictEqual(result.context.invalidConfiguredPath, '/missing/browser');
  });

  it('detects Edge after Chrome and Chromium candidates', () => {
    const result = resolveBrowser({
      platform: 'linux',
      exists: (candidate) => candidate === '/usr/bin/microsoft-edge-stable',
    });
    assert.ok(result.found);
    assert.strictEqual(result.executablePath, '/usr/bin/microsoft-edge-stable');
  });

  it('uses deterministic candidate ordering', () => {
    const result = resolveBrowser({
      platform: 'linux',
      exists: (candidate) => candidate === '/usr/bin/google-chrome' || candidate === '/snap/bin/chromium',
    });
    assert.ok(result.found);
    assert.strictEqual(result.executablePath, '/usr/bin/google-chrome');
  });

  it('returns typed context when no browser exists', () => {
    const result = resolveBrowser({ platform: 'darwin', exists: () => false });
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.context.platform, 'darwin');
    assert.ok(result.context.searched.length >= 3);
  });

  it('constructs Windows paths without empty prefixes', () => {
    const paths = getBrowserCandidates('win32', {
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      PROGRAMFILES: 'D:\\Programs',
      'PROGRAMFILES(X86)': 'E:\\Programs32',
    }).map((candidate) => candidate.path);
    assert.strictEqual(paths[0], 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe');
    assert.ok(paths.includes('D:\\Programs\\Microsoft\\Edge\\Application\\msedge.exe'));
    assert.ok(paths.every((candidate) => !candidate.startsWith('\\')));
  });

  it('considers stable Chrome, Chromium, and Edge on macOS', () => {
    const candidates = getBrowserCandidates('darwin').map((candidate) => candidate.browser);
    assert.deepStrictEqual(candidates, ['Chrome', 'Chromium', 'Edge']);
  });

  it('considers standard package and Snap locations on Linux', () => {
    const paths = getBrowserCandidates('linux').map((candidate) => candidate.path);
    assert.ok(paths.includes('/usr/bin/google-chrome-stable'));
    assert.ok(paths.includes('/usr/bin/chromium'));
    assert.ok(paths.includes('/snap/bin/chromium'));
  });

  it('treats WSL as Linux and searches no Windows executables', () => {
    const result = resolveBrowser({
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      exists: () => false,
    });
    assert.strictEqual(result.context.isWsl, true);
    assert.ok(result.context.searched.every((candidate) => candidate.path.startsWith('/')));
    assert.strictEqual(isWslEnvironment('linux', { WSL_INTEROP: '/run/WSL/1_interop' }), true);
  });

  it('accepts an unsupported Chromium browser only when configured', () => {
    const custom = '/opt/brave.com/brave/brave-browser';
    const detected = resolveBrowser({ platform: 'linux', exists: (candidate) => candidate === custom });
    assert.strictEqual(detected.found, false);
    const configured = resolveBrowser({
      platform: 'linux',
      configuredPath: custom,
      exists: (candidate) => candidate === custom,
    });
    assert.ok(configured.found);
    assert.strictEqual(configured.executablePath, custom);
  });
});
