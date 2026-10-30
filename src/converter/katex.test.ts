import * as assert from 'assert';
import { spawnSync } from 'child_process';
import MarkdownIt from 'markdown-it';
import { markdownItKaTeX } from './katex';
import { sanitizeContent } from './sanitize';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): { timeout(ms: number): void };

function render(source: string): string {
  return new MarkdownIt({ html: true }).use(markdownItKaTeX).render(source);
}

describe('KaTeX compatibility and security', () => {

  it('renders inline math', () => {
    const html = render('Inline $x^2$ done.');
    assert.strictEqual((html.match(/class="katex"/g) ?? []).length, 1);
    assert.ok(!html.includes('katex-display'), 'inline math must not use display layout');
  });

  it('renders display math on one line and across lines', () => {
    const single = render('$$E = mc^2$$');
    assert.strictEqual((single.match(/class="katex-display"/g) ?? []).length, 1);

    const multi = render('$$ E =\n\\frac{a}{b}\n$$');
    assert.strictEqual((multi.match(/class="katex-display"/g) ?? []).length, 1);
    assert.ok(multi.includes('<mfrac>'), 'multi-line display math must render its fraction');
    assert.ok(!multi.includes('$'), 'display delimiters must not leak into output');
  });

  it('keeps the documented fallback for bare $$ delimiter lines', () => {
    // The fork's block rule needs content on the opening line (pre-existing
    // parser behaviour, unchanged by the 0.18 upgrade). A bare $$ line pair
    // therefore renders as inline math with one literal dollar left over.
    // Pin it so a future parser change cannot alter output silently.
    const html = render('$$\n\\frac{a}{b}\n$$');
    assert.strictEqual((html.match(/class="katex-display"/g) ?? []).length, 0);
    assert.strictEqual((html.match(/class="katex"/g) ?? []).length, 1);
  });

  it('produces sanitizer-compatible MathML and HTML output', () => {
    const sanitized = sanitizeContent(render('$$\\frac{a}{b}$$'));
    assert.ok(sanitized);
    assert.ok(sanitized.includes('<math'));
    assert.ok(sanitized.includes('<mfrac>'));
    assert.ok(sanitized.includes('katex-html'), 'visual HTML layer must survive sanitization');
  });

  it('keeps untrusted link and image commands disabled', () => {
    const html = render('$\\href{javascript:alert(1)}{click}$\n\n$\\includegraphics{https://example.invalid/remote.png}$');
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(!html.includes('<img'));
  });

  it('treats malformed math as an inline error without breaking the paragraph', () => {
    const html = render('Before $\\frac{$ after.');
    assert.ok(html.includes('katex-error'));
    assert.ok(html.includes('Before'));
    assert.ok(html.includes('after.'));
  });

  it('ignores inherited trust settings (GHSA-238p-pmpm-9mq7)', () => {
    // Isolate prototype pollution from the shared test process and exercise the
    // raw renderer, so the downstream sanitizer cannot mask a KaTeX regression.
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('assert');
      const katex = require(process.argv[1]);
      const expression = String.fromCharCode(92) + 'href{javascript:alert(1)}{click}';
      Object.defineProperty(Object.prototype, 'trust', { configurable: true, writable: true, value: true });
      try {
        // Explicit options object, and one whose prototype carries trust.
        const options = [ { throwOnError: false }, Object.create({ trust: true }) ];
        for (const option of options) {
          assert.ok(!katex.renderToString(expression, option).includes('href="javascript:'),
            'inherited trust must not enable executable output');
        }
      } finally {
        delete Object.prototype.trust;
      }
    `, require.resolve('katex')], { timeout: 5000, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stderr);
  }).timeout(10000);
});
