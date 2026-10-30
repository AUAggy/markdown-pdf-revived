// Parser security regression tests (plan workstream A).
//
// Guards the declared patched floors for the advisories below and pins
// ordinary parser output so a future markdown-it / js-yaml update cannot
// silently change document rendering.
//
//   markdown-it GHSA-vfgh-jcmw-g37q  quadratic inline-HTML parsing (html: true)   fixed 14.3.3
//   markdown-it GHSA-gfr2-rv44-r23c  quadratic multi-line reference definitions   fixed 14.3.3
//   js-yaml     GHSA-2883-xcg3-v3hh  empty merge sources bypass CPU limit         fixed 3.15.2
//
// Pathological (CPU-blowup) inputs run in child processes with hard timeouts
// in parser-adversarial.test.ts. This file stays fast and deterministic.

import * as assert from 'assert';
import * as path from 'path';
import { markdownItKaTeX } from './katex';

// Mocha globals (no @types/mocha in strict mode — declare minimally)
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`unparseable version: ${v}`);
  }
  return [parts[0], parts[1], parts[2]];
}

function versionAtLeast(actual: string, floor: string): boolean {
  const a = parseVersion(actual);
  const f = parseVersion(floor);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== f[i]) { return a[i] > f[i]; }
  }
  return true;
}

type RequireFn = ((id: string) => unknown) & {
  resolve: (id: string, opts?: { paths?: string[] }) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireFn = require as unknown as RequireFn;

function installedMarkdownIt(): { version: string; instance: { render: (s: string) => string } } {
  // Resolve the same instance the converter loads (node_modules/markdown-it)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MarkdownIt = requireFn('markdown-it') as new (opts: object) => { render: (s: string) => string };
  const pkgPath = requireFn.resolve('markdown-it/package.json');
  const version = requireFn(pkgPath) as { version: string };
  return { version: version.version, instance: new MarkdownIt({ html: true }) };
}

// The js-yaml instance gray-matter actually loads (may be a nested copy),
// not merely a top-level package of the same name.
function grayMatterJsYaml(): { version: string; safeLoad: (s: string) => unknown } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const grayMatterPkgDir = path.dirname(requireFn.resolve('gray-matter/package.json'));
  const jsYamlDir = path.dirname(requireFn.resolve('js-yaml', { paths: [grayMatterPkgDir] }));
  const pkg = requireFn(path.join(jsYamlDir, 'package.json')) as { version: string };
  const lib = requireFn(path.join(jsYamlDir)) as { safeLoad: (s: string) => unknown };
  return { version: pkg.version, safeLoad: lib.safeLoad };
}

describe('parser security floors (workstream A)', () => {

  it('markdown-it is at least 14.3.3 (GHSA-vfgh-jcmw-g37q, GHSA-gfr2-rv44-r23c)', () => {
    const { version } = installedMarkdownIt();
    assert.ok(
      versionAtLeast(version, '14.3.3'),
      `markdown-it ${version} is below the patched floor 14.3.3`
    );
  });

  it('js-yaml loaded by gray-matter is at least 3.15.2 (GHSA-2883-xcg3-v3hh)', () => {
    const { version } = grayMatterJsYaml();
    assert.ok(
      versionAtLeast(version, '3.15.2'),
      `gray-matter resolves js-yaml ${version}, below the patched floor 3.15.2`
    );
  });
});

describe('parser ordinary output regression (workstream A)', () => {
  const md = installedMarkdownIt().instance;

  it('renders headings, code, links and reference definitions unchanged', () => {
    const html = md.render('# Title\n\n[x]\n\n[x]: /url "t"\n\n```\ncode block\n```\n');
    assert.ok(html.includes('<h1>Title</h1>'), 'heading output');
    assert.ok(html.includes('<a href="/url" title="t">x</a>'), 'reference link output');
    assert.ok(html.includes('<pre><code>code block\n</code></pre>'), 'fenced code output');
  });

  it('keeps closed inline HTML parsing with html enabled', () => {
    const html = md.render('a <!-- ok --> <b>bold</b>');
    assert.ok(html.includes('<!-- ok -->'), 'closed HTML comment kept');
    assert.ok(html.includes('<b>bold</b>'), 'inline tag kept');
  });

  it('documents post-patch behaviour after an unclosed HTML special', () => {
    // Since 14.3.3 an unclosed comment/PI/CDATA degrades to text for that
    // construct; ordinary open/close tags in the same paragraph still parse.
    const html = md.render('a <!-- unclosed <b>bold</b>');
    assert.ok(html.includes('&lt;!-- unclosed'), 'unclosed special becomes text');
    assert.ok(html.includes('<b>bold</b>'), 'following tags still parse');
  });

  it('keeps anchor, footnote and KaTeX plugin output stable', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MarkdownIt = requireFn('markdown-it') as new (opts: object) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md2: any = new MarkdownIt({ html: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    md2.use(requireFn('markdown-it-anchor'), {
      slugify: (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, '-'),
      permalink: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    md2.use(requireFn('markdown-it-footnote'));
    md2.use(markdownItKaTeX);
    const html = md2.render('# Hello World\n\ntext[^1]\n\n$$\nx = y^2\n$$\n\n[^1]: note');
    assert.ok(html.includes('<h1 id="hello-world"'), 'anchor id');
    assert.ok(html.includes('class="footnote-ref"'), 'footnote ref');
    assert.ok(html.includes('class="footnotes-sep"'), 'footnotes section');
    assert.ok(html.includes('katex'), 'KaTeX markup rendered');
  });
});

describe('frontmatter parsing via gray-matter (workstream A2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const grayMatter = requireFn('gray-matter') as (s: string) => { data: Record<string, unknown>; content: string };

  it('parses title, per-document options and unicode values', () => {
    const { data, content } = grayMatter('---\ntitle: "Über título"\nbreaks: true\nmath: false\n---\n\n# Body\n');
    assert.strictEqual(data['title'], 'Über título');
    assert.strictEqual(data['breaks'], true);
    assert.strictEqual(data['math'], false);
    assert.strictEqual(content.trim(), '# Body');
  });

  it('parses benign aliases and merge keys', () => {
    const { data } = grayMatter('---\nbase: &b { a: 1, b: 2 }\ndoc:\n  <<: [*b]\n  c: 3\n---\nx\n');
    const doc = data['doc'] as Record<string, number>;
    assert.deepStrictEqual(doc, { a: 1, b: 2, c: 3 });
  });

  it('returns empty data for documents without frontmatter', () => {
    const { data, content } = grayMatter('# No frontmatter\n');
    assert.deepStrictEqual(data, {});
    assert.strictEqual(content.trim(), '# No frontmatter');
  });

  it('throws on malformed YAML (export fails fast instead of hanging)', () => {
    // convertMarkdownToHtml calls gray-matter outside its inner try block;
    // the exception propagates to the export error handler in extension.ts.
    assert.throws(() => grayMatter('---\ntitle: [unclosed\n---\nbody\n'));
  });
});
