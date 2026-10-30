// Adversarial parser input tests (plan workstream A).
//
// Each pathological case runs in a child process with a hard timeout, so a
// reintroduced complexity bug (quadratic parsing, unbounded merge work) fails
// the suite by timeout instead of hanging the shared mocha process. Timings
// below were validated on vulnerable vs patched versions on 30 October 2026:
//
//   inline-HTML quadratic   markdown-it 14.3.0: ~1.6 s  -> 14.3.3: ~20 ms   (GHSA-vfgh-jcmw-g37q)
//   refdef quadratic        markdown-it 14.3.0: ~170 ms -> 14.3.3: ~25 ms   (GHSA-gfr2-rv44-r23c)
//   empty merge sources     js-yaml 3.15.1: accepted   -> 3.15.2: throws   (GHSA-2883-xcg3-v3hh)
//
// Inputs must stay modest: large enough that the vulnerable versions degrade
// measurably, small enough that the patched versions finish well inside the
// timeout on slow CI machines.

import * as assert from 'assert';
import * as path from 'path';
import { spawnSync } from 'child_process';

// Mocha globals (no @types/mocha in strict mode — declare minimally)
declare function describe(title: string, fn: () => void): void;
interface ItResult { timeout(ms: number): void; }
declare function it(title: string, fn: () => void): ItResult;

type RequireFn = ((id: string) => unknown) & {
  resolve: (id: string, opts?: { paths?: string[] }) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireFn = require as unknown as RequireFn;

const HARD_TIMEOUT_MS = 20000;

interface ChildResult {
  name: string;
  status: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

function runBoundedChild(name: string, script: string, moduleDir: string, input?: string): ChildResult {
  const res = spawnSync(process.execPath, ['-e', script, moduleDir], {
    timeout: HARD_TIMEOUT_MS,
    encoding: 'utf8',
    // stdin avoids platform-specific environment/argument size limits.
    input,
  });
  return {
    name,
    status: res.status,
    signal: res.signal,
    timedOut: !!res.error && (res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || res.error?.message || '').trim(),
  };
}

function assertCompleted(r: ChildResult): void {
  if (r.timedOut || r.signal === 'SIGTERM') {
    assert.fail(`${r.name}: child exceeded hard timeout ${HARD_TIMEOUT_MS}ms — complexity regression likely`);
  }
  if (r.status !== 0) {
    assert.fail(`${r.name}: child exited ${r.status}: ${r.stderr || r.stdout}`);
  }
}

// markdown-it must complete rendering the input; the script prints elapsed
// time for diagnostics and exits non-zero on any parse exception.
const MARKDOWN_IT_RENDER = `
const path = require('path');
const MarkdownIt = require(path.join(process.argv[1]));
const md = new MarkdownIt({ html: true });
const src = require('fs').readFileSync(0, 'utf8');
const t0 = process.hrtime.bigint();
md.render(src);
console.log('rendered', src.length, 'chars in', (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0), 'ms');
`;

describe('adversarial markdown-it inputs complete within hard bounds', () => {
  const markdownItDir = path.dirname(requireFn.resolve('markdown-it/package.json'));

  it('repeated unclosed HTML comments in a paragraph (GHSA-vfgh-jcmw-g37q)', function () {
    // ~80 KB; vulnerable 14.3.0: quadratic (~1.6 s), patched: linear (~20 ms)
    const src = 'x ' + '<!--'.repeat(20000);
    assertCompleted(runBoundedChild(
      'inline-html-quadratic',
      MARKDOWN_IT_RENDER,
      markdownItDir,
      src
    ));
  }).timeout(HARD_TIMEOUT_MS + 10000);

  it('single multi-line link reference definition (GHSA-gfr2-rv44-r23c)', function () {
    // ~240 KB; vulnerable 14.3.0: quadratic, patched: linear (~25 ms)
    const src = '[x]: /url\n  "' + 'a\n  '.repeat(60000) + '"';
    assertCompleted(runBoundedChild(
      'refdef-quadratic',
      MARKDOWN_IT_RENDER,
      markdownItDir,
      src
    ));
  }).timeout(HARD_TIMEOUT_MS + 10000);
});

describe('adversarial js-yaml inputs are bounded (GHSA-2883-xcg3-v3hh)', () => {
  function grayMatterJsYamlDir(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const grayMatterPkgDir = path.dirname(requireFn.resolve('gray-matter/package.json'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return path.dirname(requireFn.resolve('js-yaml', { paths: [grayMatterPkgDir] }));
  }

  it('rejects merge sequences over 100 entries', function () {
    const script = `
const path = require('path');
const yaml = require(path.join(process.argv[1]));
let threw = null;
try { yaml.safeLoad('a: 1\\nb:\\n  <<: [' + '{}, '.repeat(5000) + '{}]\\n'); }
catch (e) { threw = e; }
if (!threw) { console.error('over-size merge sequence was accepted'); process.exit(2); }
console.log('threw:', threw.message.split('\\n')[0]);
`;
    assertCompleted(runBoundedChild('yaml-merge-sequence-limit', script, grayMatterJsYamlDir()));
  }).timeout(HARD_TIMEOUT_MS + 10000);

  it('charges empty merge sources against maxTotalMergeKeys', function () {
    const script = `
const path = require('path');
const yaml = require(path.join(process.argv[1]));
// 300 keys x 100-entry empty merge sequences: 30000 merged sources that
// charged zero work before 3.15.2 and are accepted by vulnerable versions.
let src = '';
for (let i = 0; i < 300; i++) src += 'k' + i + ': {<<: [' + '{}, '.repeat(99) + '{}]}\\n';
let threw = null;
try { yaml.safeLoad(src); } catch (e) { threw = e; }
if (!threw) { console.error('30000 empty merge sources were accepted'); process.exit(2); }
if (!/maxTotalMergeKeys/.test(threw.message)) { console.error('unexpected error:', threw.message); process.exit(3); }
// benign merge still parses after the bounds
const doc = yaml.safeLoad('base: &b { a: 1 }\\ndoc:\\n  <<: [*b]\\n  c: 2\\n');
if (doc.doc.c !== 2 || doc.doc.a !== 1) { console.error('benign merge broken'); process.exit(4); }
console.log('bounded + benign ok');
`;
    assertCompleted(runBoundedChild('yaml-empty-merge-charging', script, grayMatterJsYamlDir()));
  }).timeout(HARD_TIMEOUT_MS + 10000);
});
