import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveStylePathSecure, readUserStylesAsTextCore, fixHrefSecure } from '../template/page';

// Mocha globals
declare function describe(title: string, fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
declare function it(title: string, fn: (this: { skip(): void }) => void): void;

function createTestWorkspace(): { root: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-style-test-'));
  const root = fs.realpathSync(tmpRoot);
  fs.writeFileSync(path.join(root, 'custom.css'), 'body { color: red; }');
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe('resolveStylePathSecure', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('resolves relative path within workspace', () => {
    const result = resolveStylePathSecure('custom.css', ws.root, ws.root);
    assert.strictEqual(result, path.join(ws.root, 'custom.css'));
  });

  it('blocks absolute path outside workspace', () => {
    const result = resolveStylePathSecure('/etc/passwd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });

  it('blocks ../ traversal outside workspace', () => {
    const result = resolveStylePathSecure('../../../etc/passwd', ws.root, ws.root);
    assert.strictEqual(result, null);
  });
});

describe('readUserStylesAsTextCore', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('reads stylesheet within workspace', () => {
    const result = readUserStylesAsTextCore(['custom.css'], ws.root, ws.root);
    assert.ok(result.includes('body { color: red; }'));
  });

  it('returns empty string for stylesheet outside workspace', () => {
    const result = readUserStylesAsTextCore(['/etc/passwd'], ws.root, ws.root);
    assert.strictEqual(result.trim(), '');
  });
});

describe('fixHrefSecure', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('passes through http/https URLs unchanged', () => {
    const result = fixHrefSecure('https://example.com/style.css', ws.root, ws.root);
    assert.strictEqual(result, 'https://example.com/style.css');
  });

  it('blocks tilde-expanded path outside workspace', function () {
    if (process.platform === 'win32') this.skip();
    const result = fixHrefSecure('~/some/style.css', ws.root, ws.root);
    assert.strictEqual(result, null);
  });
});
