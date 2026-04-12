import * as assert from 'assert';
import { sanitizeContent, preEscapeRcdataTags } from './sanitize';

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
