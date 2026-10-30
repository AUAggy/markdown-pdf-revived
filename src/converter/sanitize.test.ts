import * as assert from 'assert';
import { sanitizeContent, preEscapeRcdataTags, stripStyleElements } from './sanitize';

// Mocha globals
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

describe('sanitizeContent', () => {
  it('strips onclick attribute', () => {
    const result = sanitizeContent('<div onclick="alert(1)">text</div>');
    assert.ok(result);
    assert.ok(!result.includes('onclick'));
  });

  it('strips ondrop attribute (not in original FORBID_ATTR)', () => {
    const result = sanitizeContent('<div ondrop="alert(1)">text</div>');
    assert.ok(result);
    assert.ok(!result.includes('ondrop'));
  });

  it('strips onanimationend attribute', () => {
    const result = sanitizeContent('<div onanimationend="alert(1)">text</div>');
    assert.ok(result);
    assert.ok(!result.includes('onanimationend'));
  });

  it('strips onpointerdown attribute', () => {
    const result = sanitizeContent('<div onpointerdown="alert(1)">text</div>');
    assert.ok(result);
    assert.ok(!result.includes('onpointerdown'));
  });

  it('allows safe attributes (class, id, data-*)', () => {
    const result = sanitizeContent('<div class="foo" id="bar" data-x="1">text</div>');
    assert.ok(result);
    assert.ok(result.includes('class="foo"'));
    assert.ok(result.includes('id="bar"'));
    assert.ok(result.includes('data-x="1"'));
  });

  it('blocks script tags', () => {
    const result = sanitizeContent('<script>alert(1)</script><p>safe</p>');
    assert.ok(result);
    assert.ok(!result.includes('<script'));
    assert.ok(result.includes('safe'));
  });

  it('returns non-null for valid HTML input (basic sanity check)', () => {
    const result = sanitizeContent('<p>hello</p>');
    assert.ok(result !== null);
  });

  it('blocks normal style elements and their CSS payload', () => {
    const result = sanitizeContent('<style>body{color:red}</style><p>safe</p>');
    assert.ok(result);
    assert.ok(!result.toLowerCase().includes('<style'));
    assert.ok(!result.includes('body{color:red}'));
    assert.ok(result.includes('safe'));
  });

  it('blocks mixed-case style elements', () => {
    const result = sanitizeContent('<StYlE>body{color:red}</sTyLe><p>safe</p>');
    assert.ok(result);
    assert.ok(!result.toLowerCase().includes('<style'));
    assert.ok(!result.includes('body{color:red}'));
  });

  it('blocks style elements with attributes and remote CSS references', () => {
    const result = sanitizeContent(
      '<style media="print">@import "https://example.invalid/a.css";' +
      '.x{background:url(https://example.invalid/b.png)}</style><p>safe</p>'
    );
    assert.ok(result);
    assert.ok(!result.includes('example.invalid'));
    assert.ok(result.includes('safe'));
  });

  it('preserves content before and after a blocked style element', () => {
    const result = sanitizeContent('<h1>Before</h1><style>.x{display:none}</style><h2>After</h2>');
    assert.ok(result);
    assert.ok(result.indexOf('Before') < result.indexOf('After'));
  });

  it('recovers block content after an unclosed style element', () => {
    const result = sanitizeContent('<h1>Before</h1><style>.x{display:none}<h2>After</h2><p>Visible</p>');
    assert.ok(result);
    assert.ok(result.includes('Before'));
    assert.ok(result.includes('After'));
    assert.ok(result.includes('Visible'));
    assert.ok(!result.includes('display:none'));
  });

  it('removes a stray style closing tag without truncating content', () => {
    const result = sanitizeContent('<p>Before</p></style><p>After</p>');
    assert.ok(result);
    assert.ok(result.includes('Before'));
    assert.ok(result.includes('After'));
  });

  it('preserves escaped style markup as prose', () => {
    const result = sanitizeContent('<p>&lt;style&gt;body{}&lt;/style&gt;</p>');
    assert.ok(result);
    assert.ok(result.includes('&lt;style&gt;'));
  });

  it('retains sanitized inline style attributes', () => {
    const result = sanitizeContent('<p style="color: red">Styled text</p>');
    assert.ok(result);
    assert.ok(result.includes('style="color: red"'));
  });

  it('continues to block dangerous elements and event handlers', () => {
    const result = sanitizeContent(
      '<script>x</script><iframe></iframe><object></object><embed><base href="https://example.com">' +
      '<p onclick="x()">safe</p>'
    );
    assert.ok(result);
    for (const blocked of ['script', 'iframe', 'object', 'embed', 'base', 'onclick']) {
      assert.ok(!result.toLowerCase().includes(blocked));
    }
    assert.ok(result.includes('safe'));
  });

  it('preserves safe HTML, SVG, MathML, Mermaid, footnote, and callout markup', () => {
    const result = sanitizeContent(
      '<div class="mermaid callout footnote"><svg><path d="M0 0"></path></svg>' +
      '<math><mrow><mi>x</mi></mrow></math></div>'
    );
    assert.ok(result);
    assert.ok(result.includes('class="mermaid callout footnote"'));
    assert.ok(result.includes('<svg>'));
    assert.ok(result.includes('<math>'));
  });

  it('blocks event handlers and executable URLs across HTML, SVG and MathML reparsing', () => {
    // Exercise our string-output configuration, not DOMPurify's unused IN_PLACE,
    // SAFE_FOR_TEMPLATES or XHTML modes from the package advisories.
    const result = sanitizeContent(
      '<div><template><img src="x" onerror="alert(1)"></template>' +
      '<svg onload="alert(1)"><a xlink:href="javascript:alert(1)">bad</a>' +
      '<animate attributeName="href" values="javascript:alert(1)"></animate></svg>' +
      '<math><mtext><a href="jav&#x61;script:alert(1)" onclick="alert(1)">bad</a></mtext></math>' +
      '<a href="https://example.invalid/safe">safe link</a></div>'
    );
    assert.ok(result !== null);
    // Reparse what a browser consumes, including detached template fragments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(result);
    try {
      interface Element {
        getAttributeNames(): string[];
        getAttribute(name: string): string | null;
        tagName: string;
        content?: Root;
      }
      interface Root { querySelectorAll(selector: string): ArrayLike<Element>; }
      function check(root: Root): void {
        for (const element of Array.from(root.querySelectorAll('*'))) {
          for (const name of element.getAttributeNames()) {
            assert.ok(!/^on/i.test(name), `event attribute survived: ${name}`);
            if (['href', 'src', 'xlink:href'].includes(name)) {
              assert.ok(!/^\s*javascript:/i.test(element.getAttribute(name) ?? ''), 'executable URL survived');
            }
          }
          if (element.tagName === 'TEMPLATE' && element.content) { check(element.content); }
        }
      }
      check(dom.window.document);
      assert.ok(!dom.window.document.querySelector('script, iframe, object, embed, animate'));
      assert.ok(dom.window.document.querySelector('a[href="https://example.invalid/safe"]'));
    } finally {
      dom.window.close();
    }
  });

  it('preserves SVG drawing, MathML structure and inline styling after the DOMPurify patch', () => {
    const result = sanitizeContent(
      '<svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="black"></path></svg>' +
      '<math><mfrac><mi>x</mi><msup><mi>y</mi><mn>2</mn></msup></mfrac></math>' +
      '<p style="color: red" data-callout="note">visible</p>'
    );
    assert.ok(result !== null);
    for (const expected of ['viewBox="0 0 10 10"', 'stroke="black"', '<mfrac>', '<msup>', 'style="color: red"', 'data-callout="note"']) {
      assert.ok(result.includes(expected), `supported markup lost: ${expected}`);
    }
  });

  // Regression: inline <title> in prose triggers HTML5 RCDATA parsing mode in jsdom,
  // causing all subsequent content to be swallowed as the title's raw text and then
  // silently dropped by DOMPurify — truncating the PDF output.
  it('preserves content after inline <title> tag in prose', () => {
    const html = '<p>Common tags include <title> for page titles.</p><h2>Next Section</h2><p>This must survive.</p>';
    const result = sanitizeContent(html);
    assert.ok(result !== null);
    assert.ok(result.includes('Next Section'), 'heading after <title> should be preserved');
    assert.ok(result.includes('This must survive'), 'paragraph after <title> should be preserved');
  });

  it('preserves content after inline <textarea> tag in prose', () => {
    const html = '<p>Use <textarea> for multiline input.</p><h2>After Textarea</h2>';
    const result = sanitizeContent(html);
    assert.ok(result !== null);
    assert.ok(result.includes('After Textarea'), 'content after <textarea> should be preserved');
  });
});

describe('preEscapeRcdataTags', () => {
  it('escapes <title> tags', () => {
    assert.ok(preEscapeRcdataTags('<title>foo</title>').includes('&lt;title&gt;'));
  });

  it('escapes closing </title> tags', () => {
    assert.ok(preEscapeRcdataTags('</title>').includes('&lt;/title&gt;'));
  });

  it('is case-insensitive', () => {
    assert.ok(preEscapeRcdataTags('<TITLE>foo</TITLE>').includes('&lt;TITLE&gt;'));
  });

  it('does not affect already-escaped entities', () => {
    const input = '&lt;title&gt;already escaped&lt;/title&gt;';
    assert.strictEqual(preEscapeRcdataTags(input), input);
  });

  it('does not affect normal HTML tags', () => {
    const input = '<h2>Hello</h2><p>World</p><div class="foo">bar</div>';
    assert.strictEqual(preEscapeRcdataTags(input), input);
  });

  it('does not affect "title" in attribute values', () => {
    const input = '<h2 id="my-title">Section</h2>';
    assert.strictEqual(preEscapeRcdataTags(input), input);
  });
});

describe('stripStyleElements', () => {
  it('removes multiple style blocks', () => {
    assert.strictEqual(
      stripStyleElements('<p>A</p><style>.a{}</style><p>B</p><STYLE>.b{}</STYLE><p>C</p>'),
      '<p>A</p><p>B</p><p>C</p>'
    );
  });

  it('leaves escaped style prose unchanged', () => {
    const input = '&lt;style&gt;.x{}&lt;/style&gt;';
    assert.strictEqual(stripStyleElements(input), input);
  });
});
