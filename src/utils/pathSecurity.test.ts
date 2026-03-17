import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeResolvePath } from './pathSecurity';

// Mocha globals (no @types/mocha installed; declare minimally for strict TS)
declare function describe(title: string, fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
declare function it(title: string, fn: () => void): void;

// Create a temp workspace structure for testing
function createTestWorkspace(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpdf-test-'));
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
});
