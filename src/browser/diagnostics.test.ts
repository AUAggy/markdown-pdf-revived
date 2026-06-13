import * as assert from 'assert';
import { formatBrowserLaunchFailure, formatBrowserNotFound, summarizeLaunchError } from './diagnostics';
import { BrowserLaunchError } from './launch';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

describe('browser diagnostics', () => {
  it('reports invalid configuration, setting guidance, and searched locations', () => {
    const message = formatBrowserNotFound({
      platform: 'linux',
      isWsl: false,
      configuredPath: '/missing',
      invalidConfiguredPath: '/missing',
      searched: [{ browser: 'Chrome', path: '/usr/bin/google-chrome' }],
    });
    assert.ok(message.includes('/missing'));
    assert.ok(message.includes('markdown-pdf.executablePath'));
    assert.ok(message.includes('/usr/bin/google-chrome'));
  });

  it('adds WSL-specific installation guidance', () => {
    const message = formatBrowserNotFound({
      platform: 'linux',
      isWsl: true,
      searched: [],
    });
    assert.ok(message.includes('inside the WSL distribution'));
  });

  it('normalizes and bounds launch stderr to its first line', () => {
    const message = summarizeLaunchError(new Error(`first ${'x'.repeat(400)}\nPRIVATE DOCUMENT CONTENT`));
    assert.ok(message.length <= 240);
    assert.ok(!message.includes('\n'));
    assert.ok(!message.includes('PRIVATE DOCUMENT CONTENT'));
  });

  it('identifies the selected executable and platform', () => {
    const message = formatBrowserLaunchFailure(
      new BrowserLaunchError('/opt/chrome', new Error('permission denied')),
      'linux'
    );
    assert.ok(message.includes('/opt/chrome'));
    assert.ok(message.includes('linux'));
    assert.ok(message.includes('permission denied'));
  });

  it('states that both launch attempts failed', () => {
    const message = formatBrowserLaunchFailure(
      new BrowserLaunchError('/opt/chrome', new Error('No usable sandbox'), new Error('fallback failed')),
      'linux'
    );
    assert.ok(message.includes('sandboxed attempt failed'));
    assert.ok(message.includes('fallback also failed'));
  });
});
