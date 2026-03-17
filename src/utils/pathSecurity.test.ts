import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeResolvePath, safeReadFile, computeAllowedRoot } from './pathSecurity';

// Mocha globals (no @types/mocha installed; declare minimally for strict TS)
declare function describe(title: string, fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
declare function it(title: string, fn: (this: { skip(): void }) => void): void;

// Create a temp workspace structure for testing
function createTestWorkspace(): { root: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-test-'));
  // Resolve symlinks so paths are canonical (e.g. macOS /var -> /private/var)
  const root = fs.realpathSync(tmpRoot);
  fs.mkdirSync(path.join(root, 'subdir'), { recursive: true });
  fs.writeFileSync(path.join(root, 'valid.md'), '# Valid');
  fs.writeFileSync(path.join(root, 'subdir', 'nested.md'), '# Nested');
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe('safeResolvePath', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('returns valid path for file within workspace', () => {
    const result = safeResolvePath('valid.md', ws.root, ws.root);
    assert.strictEqual(result, path.join(ws.root, 'valid.md'));
  });

  it('returns null for ../ traversal outside workspace', () => {
    const result = safeResolvePath('../../../etc/passwd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for percent-encoded traversal (%2E%2E%2F)', () => {
    const result = safeResolvePath('%2E%2E%2Fetc%2Fpasswd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for malformed percent sequences', () => {
    const result = safeResolvePath('%GGbadpath', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for empty string input', () => {
    const result = safeResolvePath('', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns valid path for nested file within workspace', () => {
    const result = safeResolvePath('subdir/nested.md', ws.root, ws.root);
    assert.strictEqual(result, path.join(ws.root, 'subdir', 'nested.md'));
  });

  it('returns valid path when file is exactly the root (rel === "")', () => {
    const result = safeResolvePath(ws.root, '/', ws.root);
    assert.strictEqual(result, ws.root);
  });

  it('returns null for absolute path outside workspace', () => {
    const result = safeResolvePath('/etc/passwd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for symlink pointing outside workspace', function () {
    if (process.platform === 'win32') this.skip();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(ws.root, 'evil-link.txt'));
    try {
      const result = safeResolvePath('evil-link.txt', ws.root, ws.root);
      assert.strictEqual(result, null);
    } finally {
      fs.unlinkSync(path.join(ws.root, 'evil-link.txt'));
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('returns valid path for symlink pointing within workspace', function () {
    if (process.platform === 'win32') this.skip();
    fs.symlinkSync(path.join(ws.root, 'valid.md'), path.join(ws.root, 'good-link.md'));
    try {
      const result = safeResolvePath('good-link.md', ws.root, ws.root);
      assert.strictEqual(result, path.join(ws.root, 'valid.md'));
    } finally {
      fs.unlinkSync(path.join(ws.root, 'good-link.md'));
    }
  });
});

describe('safeReadFile', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('returns file contents for valid path within workspace', () => {
    const result = safeReadFile('valid.md', ws.root, ws.root);
    assert.strictEqual(result, '# Valid');
  });

  it('returns null for path outside workspace', () => {
    const result = safeReadFile('../../../etc/passwd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for directory (not regular file)', () => {
    const result = safeReadFile('subdir', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for nonexistent file', () => {
    const result = safeReadFile('nonexistent.md', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('returns null for symlink pointing outside workspace', function () {
    if (process.platform === 'win32') this.skip();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top secret');
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(ws.root, 'evil-read.txt'));
    try {
      const result = safeReadFile('evil-read.txt', ws.root, ws.root);
      assert.strictEqual(result, null);
    } finally {
      fs.unlinkSync(path.join(ws.root, 'evil-read.txt'));
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('reads file via symlink pointing within workspace (real path resolved before open)', function () {
    if (process.platform === 'win32') this.skip();
    fs.symlinkSync(path.join(ws.root, 'valid.md'), path.join(ws.root, 'internal-link.md'));
    try {
      const result = safeReadFile('internal-link.md', ws.root, ws.root);
      assert.strictEqual(result, '# Valid');
    } finally {
      fs.unlinkSync(path.join(ws.root, 'internal-link.md'));
    }
  });
});

describe('computeAllowedRoot', () => {
  it('returns workspace folder when provided', () => {
    const result = computeAllowedRoot('/workspace/project', '/workspace/project/doc.md', false);
    assert.strictEqual(result, '/workspace/project');
  });

  it('falls back to document directory when no workspace', () => {
    const result = computeAllowedRoot(undefined, '/home/user/doc.md', false);
    assert.strictEqual(result, '/home/user');
  });

  it('returns / on Unix when escape hatch is enabled', function () {
    if (process.platform === 'win32') this.skip();
    const result = computeAllowedRoot('/workspace', '/workspace/doc.md', true);
    assert.strictEqual(result, '/');
  });

  it('returns drive root on Windows when escape hatch is enabled', function () {
    if (process.platform !== 'win32') this.skip();
    const result = computeAllowedRoot('C:\\workspace', 'C:\\workspace\\doc.md', true);
    assert.strictEqual(result, 'C:\\');
  });
});
