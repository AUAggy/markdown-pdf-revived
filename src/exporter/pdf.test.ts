import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTempHtmlFile, cleanupTempDir, buildLaunchArgs } from './pdf';

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

describe('buildLaunchArgs', () => {
  it('with sandboxFallback=true, includes --no-sandbox', () => {
    const result = buildLaunchArgs('en', true);
    assert.ok(result.includes('--no-sandbox'));
    assert.ok(result.includes('--disable-setuid-sandbox'));
  });

  it('with sandboxFallback=false, does not include --no-sandbox', () => {
    const result = buildLaunchArgs('en', false);
    assert.ok(!result.includes('--no-sandbox'));
  });

  it('always includes --lang', () => {
    const result = buildLaunchArgs('fr', false);
    assert.ok(result.includes('--lang=fr'));
  });
});
