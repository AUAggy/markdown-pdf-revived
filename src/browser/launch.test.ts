import * as assert from 'assert';
import {
  BrowserLaunchError,
  buildLaunchArgs,
  isRecognizedSandboxError,
  launchBrowserWithPolicy,
  type BrowserLaunchOptions,
} from './launch';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void | Promise<void>): void;

describe('browser launch policy', () => {
  it('launches once with the sandbox on Linux', async () => {
    const calls: BrowserLaunchOptions[] = [];
    const browser = await launchBrowserWithPolicy(async (options) => {
      calls.push(options);
      return 'browser';
    }, '/browser', 'linux', 'en');
    assert.strictEqual(browser, 'browser');
    assert.strictEqual(calls.length, 1);
    assert.ok(!calls[0].args.includes('--no-sandbox'));
  });

  it('retries recognized Linux sandbox failures without the sandbox', async () => {
    const calls: BrowserLaunchOptions[] = [];
    const browser = await launchBrowserWithPolicy(async (options) => {
      calls.push(options);
      if (calls.length === 1) throw new Error('No usable sandbox!');
      return 'browser';
    }, '/browser', 'linux', 'en');
    assert.strictEqual(browser, 'browser');
    assert.strictEqual(calls.length, 2);
    assert.ok(!calls[0].args.includes('--no-sandbox'));
    assert.ok(calls[1].args.includes('--no-sandbox'));
  });

  it('recognizes the root-without-sandbox failure', () => {
    assert.strictEqual(isRecognizedSandboxError(
      new Error('Running as root without --no-sandbox is not supported.')
    ), true);
  });

  it('does not retry unrelated Linux launch failures', async () => {
    let calls = 0;
    await assert.rejects(
      launchBrowserWithPolicy(async () => {
        calls += 1;
        throw new Error('Process exited with code 0');
      }, '/browser', 'linux', 'en'),
      BrowserLaunchError
    );
    assert.strictEqual(calls, 1);
  });

  it('does not retry sandbox-like failures outside Linux', async () => {
    let calls = 0;
    await assert.rejects(
      launchBrowserWithPolicy(async () => {
        calls += 1;
        throw new Error('No usable sandbox');
      }, '/browser', 'darwin', 'en'),
      BrowserLaunchError
    );
    assert.strictEqual(calls, 1);
  });

  it('retains both errors when the Linux fallback fails', async () => {
    let calls = 0;
    try {
      await launchBrowserWithPolicy(async () => {
        calls += 1;
        throw new Error(calls === 1 ? 'No usable sandbox' : 'fallback failed');
      }, '/browser', 'linux', 'en');
      assert.fail('expected launch failure');
    } catch (error) {
      assert.ok(error instanceof BrowserLaunchError);
      assert.ok(error.fallbackError instanceof Error);
    }
    assert.strictEqual(calls, 2);
  });

  it('adds only the controlled fallback arguments', () => {
    assert.deepStrictEqual(buildLaunchArgs('fr'), ['--lang=fr']);
    assert.deepStrictEqual(
      buildLaunchArgs('fr', true),
      ['--lang=fr', '--no-sandbox', '--disable-setuid-sandbox']
    );
  });
});
