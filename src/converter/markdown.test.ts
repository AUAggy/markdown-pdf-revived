import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { inlineIncludesSecure, convertImgPath, escapeHtmlAttr } from './markdown';

// Mocha globals (no @types/mocha in strict mode — declare minimally)
declare function describe(title: string, fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
declare function it(title: string, fn: (this: { skip(): void }) => void): void;

function createTestWorkspace(): { root: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-inc-test-'));
  const root = fs.realpathSync(tmpRoot);
  fs.writeFileSync(path.join(root, 'main.md'), '# Main\n:[inc](child.md)');
  fs.writeFileSync(path.join(root, 'child.md'), 'child content');
  fs.writeFileSync(path.join(root, 'a.md'), ':[b](b.md)');
  fs.writeFileSync(path.join(root, 'b.md'), ':[a](a.md)');
  // Diamond: d.md is included by both b2.md and c.md
  fs.writeFileSync(path.join(root, 'diamond-root.md'), ':[b2](b2.md)\n:[c](c.md)');
  fs.writeFileSync(path.join(root, 'b2.md'), ':[d](d.md)');
  fs.writeFileSync(path.join(root, 'c.md'), ':[d](d.md)');
  fs.writeFileSync(path.join(root, 'd.md'), 'diamond-leaf');
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe('inlineIncludesSecure', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => { ws = createTestWorkspace(); });
  after(() => { ws.cleanup(); });

  it('inlines a valid include within workspace', () => {
    const result = inlineIncludesSecure(
      ':[inc](child.md)',
      path.join(ws.root, 'main.md'),
      ws.root
    );
    assert.strictEqual(result, 'child content');
  });

  it('blocks include with ../ traversal outside workspace', () => {
    const result = inlineIncludesSecure(
      ':[x](../../../etc/passwd)',
      path.join(ws.root, 'main.md'),
      ws.root
    );
    assert.strictEqual(result, '');
  });

  it('blocks percent-encoded traversal in include path', () => {
    const result = inlineIncludesSecure(
      ':[x](%2E%2E%2F%2E%2E%2Fetc%2Fpasswd)',
      path.join(ws.root, 'main.md'),
      ws.root
    );
    assert.strictEqual(result, '');
  });

  it('detects circular includes (A → B → A)', () => {
    const result = inlineIncludesSecure(
      ':[a](a.md)',
      path.join(ws.root, 'test.md'),
      ws.root
    );
    // a.md includes b.md which includes a.md — circular, second a.md returns ''
    assert.ok(!result.includes(':[a]'));
  });

  it('stops at MAX_INCLUDE_DEPTH (10 levels)', () => {
    // Create a chain: level0 includes level1, ..., level9 includes level10, level10 has content
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(ws.root, `level${i}.md`), `:[next](level${i + 1}.md)`);
    }
    fs.writeFileSync(path.join(ws.root, 'level10.md'), 'DEEP_CONTENT');
    const result = inlineIncludesSecure(
      ':[start](level0.md)',
      path.join(ws.root, 'test.md'),
      ws.root
    );
    // depth >= 10 blocks level10 from being inlined
    assert.ok(!result.includes('DEEP_CONTENT'));
  });

  it('allows diamond includes (D included twice from different branches)', () => {
    const result = inlineIncludesSecure(
      fs.readFileSync(path.join(ws.root, 'diamond-root.md'), 'utf-8'),
      path.join(ws.root, 'diamond-root.md'),
      ws.root
    );
    // "diamond-leaf" should appear twice (once per branch)
    const count = (result.match(/diamond-leaf/g) || []).length;
    assert.strictEqual(count, 2);
  });
});

describe('convertImgPath', () => {
  let ws: ReturnType<typeof createTestWorkspace>;

  before(() => {
    ws = createTestWorkspace();
    fs.writeFileSync(path.join(ws.root, 'image.png'), 'fake-png');
  });
  after(() => { ws.cleanup(); });

  it('returns file:// URI for valid image within workspace', () => {
    const result = convertImgPath('image.png', path.join(ws.root, 'doc.md'), ws.root);
    assert.ok(result.startsWith('file://'));
    assert.ok(result.includes('image.png'));
  });

  it('returns empty string for image path outside workspace', () => {
    const result = convertImgPath('../../../etc/passwd', path.join(ws.root, 'doc.md'), ws.root);
    assert.strictEqual(result, '');
  });

  it('passes through https URLs unchanged', () => {
    const result = convertImgPath('https://example.com/img.png', path.join(ws.root, 'doc.md'), ws.root);
    assert.strictEqual(result, 'https://example.com/img.png');
  });

  it('passes through http URLs unchanged', () => {
    const result = convertImgPath('http://example.com/img.png', path.join(ws.root, 'doc.md'), ws.root);
    assert.strictEqual(result, 'http://example.com/img.png');
  });
});

describe('escapeHtmlAttr', () => {
  it('HTML-encodes double quotes to prevent attribute breakout', () => {
    assert.strictEqual(escapeHtmlAttr('" onmouseover="alert(1)'), '&quot; onmouseover=&quot;alert(1)');
  });

  it('passes through normal class names unchanged', () => {
    assert.strictEqual(escapeHtmlAttr('warning'), 'warning');
    assert.strictEqual(escapeHtmlAttr('my-custom-class'), 'my-custom-class');
  });

  it('encodes angle brackets', () => {
    assert.strictEqual(escapeHtmlAttr('<script>'), '&lt;script&gt;');
  });

  it('encodes ampersands', () => {
    assert.strictEqual(escapeHtmlAttr('a&b'), 'a&amp;b');
  });

  it('encodes single quotes', () => {
    assert.strictEqual(escapeHtmlAttr("it's"), 'it&#39;s');
  });
});
