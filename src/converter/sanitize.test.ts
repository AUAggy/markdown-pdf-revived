import * as assert from 'assert';
import { sanitizeContent } from './sanitize';

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

  it('returns null on error (fail-closed)', () => {
    const result = sanitizeContent('<p>hello</p>');
    assert.ok(result !== null);
  });
});
