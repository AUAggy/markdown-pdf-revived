import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveImagePaths, type ImagePathDiagnostics } from './imagePaths';

// Mocha globals (no @types/mocha in strict mode — declare minimally)
declare function describe(title: string, fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
declare function it(title: string, fn: (this: { skip(): void }) => void): void;

function createTestWorkspace(): { root: string; outsideFile: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-imgpath-test-'));
  const root = fs.realpathSync(tmpRoot);
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'doc.md'), '# Doc');
  fs.writeFileSync(path.join(root, 'assets', '01.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(root, '02.png'), 'fake-png');
  fs.writeFileSync(path.join(root, 'a.png'), 'fake-png');
  fs.writeFileSync(path.join(root, 'a#b.png'), 'fake-png');
  // A file that exists but sits outside the allowed root, reached via ../
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-imgpath-outside-'));
  fs.writeFileSync(path.join(outsideDir, 'outside.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const outsideFile = fs.realpathSync(path.join(outsideDir, 'outside.svg'));
  return {
    root,
    outsideFile,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    },
  };
}

describe('resolveImagePaths', () => {
  let ws: ReturnType<typeof createTestWorkspace>;
  let docPath: string;

  before(() => { ws = createTestWorkspace(); docPath = path.join(ws.root, 'doc.md'); });
  after(() => { ws.cleanup(); });

  function resolveOne(src: string | null, allowedRoot?: string): { out: string; diagnostics: ImagePathDiagnostics } {
    const diagnostics: ImagePathDiagnostics = { blocked: 0, reasons: [] };
    const html = src === null
      ? '<p><img alt="no-src"></p>'
      : `<p><img src="${src}" alt="a"></p>`;
    const out = resolveImagePaths(html, docPath, allowedRoot ?? ws.root, diagnostics);
    return { out, diagnostics };
  }

  const firstImgSrc = (html: string): string | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cheerio = require('cheerio') as typeof import('cheerio');
    return cheerio.load(html)('img').first().attr('src');
  };

  it('has no type parameter (PDF-only wiring is the caller’s responsibility)', () => {
    // The resolver must stay pure with respect to export type: its runtime
    // signature is (html, filename, allowedRoot, diagnostics) with no type
    // parameter — four positional parameters, none of them the export type.
    assert.strictEqual(resolveImagePaths.length, 4);
  });

  it('resolves a relative image inside the workspace (row 1)', () => {
    const { out, diagnostics } = resolveOne('assets/01.svg');
    const src = firstImgSrc(out);
    assert.ok(src !== undefined);
    assert.ok(src!.startsWith('file://'), `expected file:// URI, got ${src}`);
    assert.ok(src!.includes('01.svg'));
    assert.strictEqual(diagnostics.blocked, 0);
    assert.deepStrictEqual(diagnostics.reasons, []);
  });

  it('resolves an absolute path inside the workspace (row 2)', () => {
    const { out, diagnostics } = resolveOne(path.join(ws.root, '02.png'));
    const src = firstImgSrc(out);
    assert.ok(src !== undefined && src.startsWith('file://'));
    assert.ok(src!.includes('02.png'));
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('drops ../ traversal to an existing file outside the root (row 3)', () => {
    const rel = path.relative(ws.root, ws.outsideFile); // starts with ..
    const { out, diagnostics } = resolveOne(rel);
    assert.strictEqual(firstImgSrc(out), undefined, 'src must be removed');
    assert.strictEqual(diagnostics.blocked, 1);
    assert.deepStrictEqual(diagnostics.reasons, ['local path blocked or missing']);
  });

  it('drops a workspace symlink pointing outside the root (row 4)', function () {
    if (process.platform === 'win32') this.skip();
    fs.symlinkSync(ws.outsideFile, path.join(ws.root, 'link.svg'));
    try {
      const { out, diagnostics } = resolveOne('link.svg');
      assert.strictEqual(firstImgSrc(out), undefined, 'src must be removed');
      assert.strictEqual(diagnostics.blocked, 1);
      assert.deepStrictEqual(diagnostics.reasons, ['local path blocked or missing']);
    } finally {
      fs.unlinkSync(path.join(ws.root, 'link.svg'));
    }
  });

  it('drops a missing file (row 5)', () => {
    const { out, diagnostics } = resolveOne('missing.png');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.strictEqual(diagnostics.blocked, 1);
    assert.deepStrictEqual(diagnostics.reasons, ['local path blocked or missing']);
  });

  it('leaves https/http sources unchanged (row 6)', () => {
    const { out, diagnostics } = resolveOne('https://example.com/a.png');
    assert.strictEqual(firstImgSrc(out), 'https://example.com/a.png');
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('drops protocol-relative URLs (row 7)', () => {
    const { out, diagnostics } = resolveOne('//example.com/a.png');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.strictEqual(diagnostics.blocked, 1);
    assert.deepStrictEqual(diagnostics.reasons, ['protocol-relative URL']);
  });

  it('leaves valid base64 image data URIs unchanged (row 8)', () => {
    const { out, diagnostics } = resolveOne('data:image/png;base64,iVBORw0KGgo=');
    assert.strictEqual(firstImgSrc(out), 'data:image/png;base64,iVBORw0KGgo=');
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('drops non-image data URIs (row 9)', () => {
    const { out, diagnostics } = resolveOne('data:text/html;base64,AAA');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['non-image data URI']);
  });

  it('drops non-base64 data URIs (row 10)', () => {
    const { out, diagnostics } = resolveOne('data:image/svg+xml,<svg/>');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['malformed data URI']);
  });

  it('drops data URIs estimating over 2 MB decoded (row 11)', () => {
    const { out, diagnostics } = resolveOne('data:image/png;base64,' + 'A'.repeat(3_000_000));
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['data URI too large']);
  });

  it('keeps emoji-sized data URIs (~1 KB) unchanged (row 12)', () => {
    const { out, diagnostics } = resolveOne('data:image/png;base64,' + 'A'.repeat(1024));
    assert.ok(firstImgSrc(out)!.startsWith('data:image/png;base64,'));
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('drops javascript: sources if the sanitizer contract ever changes (row 13)', () => {
    const { out, diagnostics } = resolveOne('javascript:alert(1)');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['unsupported scheme: javascript']);
  });

  it('classifies percent-encoded schemes after decoding (row 14)', () => {
    const { out, diagnostics } = resolveOne('file%3A%2F%2F%2Fetc%2Fhosts');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['unsupported scheme: file']);
  });

  it('drops uppercase FILE: sources (row 15)', () => {
    const { out, diagnostics } = resolveOne('FILE:///etc/hosts');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['unsupported scheme: file']);
  });

  it('leaves inert schemes unchanged (row 16)', () => {
    for (const src of ['mailto:x@y.z', 'cid:foo', 'xmpp:a@b']) {
      const { out, diagnostics } = resolveOne(src);
      assert.strictEqual(firstImgSrc(out), src);
      assert.strictEqual(diagnostics.blocked, 0);
    }
  });

  it('drops sources with malformed percent escapes (row 17)', () => {
    const { out, diagnostics } = resolveOne('100%.png');
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.deepStrictEqual(diagnostics.reasons, ['malformed percent escape']);
  });

  it('strips query and fragment before resolving local paths (row 18)', () => {
    for (const src of ['a.png?v=1', 'a.png#frag']) {
      const { out, diagnostics } = resolveOne(src);
      const resolved = firstImgSrc(out);
      assert.ok(resolved !== undefined && resolved.startsWith('file://') && resolved.includes('a.png'), `${src} -> ${resolved}`);
      assert.ok(!/[?#]/.test(resolved!.split('file://')[1] ?? ''), 'query/fragment must not leak into the URI');
      assert.strictEqual(diagnostics.blocked, 0);
    }
  });

  it('percent-encoded # stays a literal filename character (row 19)', () => {
    const { out, diagnostics } = resolveOne('a%23b.png');
    const resolved = firstImgSrc(out);
    assert.ok(resolved !== undefined && resolved.startsWith('file://'));
    assert.ok(resolved!.includes('%23') || resolved!.includes('a#b.png'), `got ${resolved}`);
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('drops empty and whitespace-only sources (row 20)', () => {
    for (const src of ['', '   ']) {
      const { out, diagnostics } = resolveOne(src);
      assert.strictEqual(firstImgSrc(out), undefined, `src must be removed for ${JSON.stringify(src)}`);
      assert.deepStrictEqual(diagnostics.reasons, ['empty source']);
      assert.strictEqual(diagnostics.blocked, 1);
    }
  });

  it('ignores img elements without a src attribute (row 21)', () => {
    const { out, diagnostics } = resolveOne(null);
    assert.strictEqual(firstImgSrc(out), undefined);
    assert.ok(out.includes('alt="no-src"'));
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('leaves srcset untouched when src is absent (row 24)', () => {
    const diagnostics: ImagePathDiagnostics = { blocked: 0, reasons: [] };
    const out = resolveImagePaths('<p><img srcset="a.png 1x, b.png 2x" alt="a"></p>', docPath, ws.root, diagnostics);
    assert.ok(out.includes('srcset="a.png 1x, b.png 2x"'));
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('keeps intact images when another is blocked, and dedupes duplicate reasons (rows 22-23)', () => {
    const diagnostics: ImagePathDiagnostics = { blocked: 0, reasons: [] };
    const out = resolveImagePaths(
      `<p><img src="a.png" alt="ok"><img src="missing.png" alt="one"><img src="missing2.png" alt="two"></p>`,
      docPath, ws.root, diagnostics
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cheerio = require('cheerio') as typeof import('cheerio');
    const $ = cheerio.load(out);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcs = $('img').map((_i: number, el: any) => $(el).attr('src')).get() as (string | undefined)[];
    assert.strictEqual(srcs[0] !== undefined && srcs[0].startsWith('file://'), true, 'valid image must survive');
    assert.strictEqual(srcs[1], undefined);
    assert.strictEqual(srcs[2], undefined);
    assert.strictEqual(diagnostics.blocked, 2);
    assert.deepStrictEqual(diagnostics.reasons, ['local path blocked or missing']);
  });

  it('resolves outside the workspace when allowedRoot is the filesystem root (row 25)', () => {
    const rel = path.relative(ws.root, ws.outsideFile);
    const fsRoot = path.parse(path.resolve(docPath)).root;
    const { out, diagnostics } = resolveOne(rel, fsRoot);
    const resolved = firstImgSrc(out);
    assert.ok(resolved !== undefined && resolved.startsWith('file://'), 'escape hatch must resolve without special-casing');
    assert.strictEqual(diagnostics.blocked, 0);
  });

  it('never leaves src="" behind', () => {
    const { out } = resolveOne('');
    assert.ok(!out.includes('src=""'), 'dropped sources must remove the attribute, not empty it');
    assert.ok(out.includes('alt="a"'));
  });

  it('works without a diagnostics object', () => {
    const out = resolveImagePaths('<p><img src="missing.png" alt="a"></p>', docPath, ws.root);
    assert.ok(!out.includes('src='));
  });

  describe('Windows path shapes (row 26)', () => {
    it('must not throw and must classify drive paths via the path branch', function () {
      if (process.platform !== 'win32') this.skip();
      const insideForward = path.join(ws.root, 'a.png').split(path.sep).join('/');
      const insideBack = path.join(ws.root, 'a.png');
      const fileUri = 'file:///C:/docs/a.png';

      const resolvedForward = resolveOne(insideForward);
      assert.ok(firstImgSrc(resolvedForward.out)!.startsWith('file://'), 'C:/… inside root must resolve');
      const resolvedBack = resolveOne(insideBack);
      assert.ok(firstImgSrc(resolvedBack.out)!.startsWith('file://'), 'C:\\… inside root must resolve');

      const fileUriResult = resolveOne(fileUri);
      assert.strictEqual(firstImgSrc(fileUriResult.out), undefined, 'file: must stay unsupported');
      assert.deepStrictEqual(fileUriResult.diagnostics.reasons, ['unsupported scheme: file']);

      for (const shape of ['C:docs\\a.png', '\\\\?\\' + path.join(ws.root, 'a.png')]) {
        // Drive-relative and \\?\ long paths: only "must not throw" is pinned.
        resolveOne(shape);
      }
    });
  });
});
