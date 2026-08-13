import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTempHtmlFile, cleanupTempDir, closeBrowserBounded } from './pdf';

// Mocha globals
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

describe('createTempHtmlFile', () => {
  it('creates a unique temp directory with HTML file inside', () => {
    const { tempDir, tmpfilename } = createTempHtmlFile('test-doc', '<html>content</html>');
    try {
      assert.ok(fs.existsSync(tempDir));
      assert.ok(tempDir.includes('markdown-pdf-'));
      assert.ok(fs.existsSync(tmpfilename));
      assert.strictEqual(fs.readFileSync(tmpfilename, 'utf8'), '<html>content</html>');
      assert.ok(tmpfilename.endsWith('test-doc.html'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates different directories on successive calls', () => {
    const a = createTempHtmlFile('doc', 'a');
    const b = createTempHtmlFile('doc', 'b');
    try {
      assert.notStrictEqual(a.tempDir, b.tempDir);
    } finally {
      fs.rmSync(a.tempDir, { recursive: true, force: true });
      fs.rmSync(b.tempDir, { recursive: true, force: true });
    }
  });
});

describe('cleanupTempDir', () => {
  it('removes temp directory and contents', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-cleanup-test-'));
    fs.writeFileSync(path.join(tempDir, 'file.html'), 'data');
    cleanupTempDir(tempDir);
    assert.ok(!fs.existsSync(tempDir));
  });

  it('does not throw when directory does not exist', () => {
    assert.doesNotThrow(() => cleanupTempDir('/nonexistent/path'));
  });

  it('does nothing when passed undefined', () => {
    assert.doesNotThrow(() => cleanupTempDir(undefined));
  });
});

describe('closeBrowserBounded', () => {
  function fakeBrowser(overrides: {
    close?: () => Promise<void>;
    process?: () => { kill(): boolean } | null;
  }) {
    const killed = { count: 0 };
    return {
      killed,
      browser: {
        close: overrides.close ?? (() => Promise.resolve()),
        process:
          overrides.process ??
          (() => ({
            kill: () => {
              killed.count++;
              return true;
            },
          })),
      },
    };
  }

  it('resolves without killing when close() resolves in time', async () => {
    const { browser, killed } = fakeBrowser({});
    await closeBrowserBounded(browser, 50);
    assert.strictEqual(killed.count, 0);
  });

  it('settles within the bound and kills the process when close() never resolves', async () => {
    const { browser, killed } = fakeBrowser({ close: () => new Promise(() => { /* never */ }) });
    const start = Date.now();
    await closeBrowserBounded(browser, 50);
    assert.ok(Date.now() - start < 2000, 'must not wait for the hung close()');
    assert.strictEqual(killed.count, 1);
  });

  it('kills the process when close() rejects', async () => {
    const { browser, killed } = fakeBrowser({ close: () => Promise.reject(new Error('boom')) });
    await closeBrowserBounded(browser, 50);
    assert.strictEqual(killed.count, 1);
  });

  it('does not throw when close() hangs and process() returns null', async () => {
    const { browser } = fakeBrowser({
      close: () => new Promise(() => { /* never */ }),
      process: () => null,
    });
    await assert.doesNotReject(() => closeBrowserBounded(browser, 50));
  });

  it('does not throw when kill() itself throws', async () => {
    const { browser } = fakeBrowser({
      close: () => Promise.reject(new Error('boom')),
      process: () => ({ kill: () => { throw new Error('kill failed'); } }),
    });
    await assert.doesNotReject(() => closeBrowserBounded(browser, 50));
  });
});
