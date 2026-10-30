import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void): void;

// Manifest assertions. These guard the settings contract that the resource-aware
// accessors in this module depend on.
interface SettingSchema {
  type?: string;
  scope?: string;
  default?: unknown;
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
) as { contributes: { configuration: { properties: Record<string, SettingSchema> } } };

const settings = packageJson.contributes.configuration.properties;

describe('settings manifest', () => {
  it('declares markdown-pdf.styles as resource-scoped', () => {
    // Without this scope, folder-level stylesheets in a multi-root workspace
    // never reach config.styles(uri); issue #455 upstream.
    assert.ok(settings['markdown-pdf.styles'], 'markdown-pdf.styles must be contributed');
    assert.strictEqual(settings['markdown-pdf.styles'].scope, 'resource');
    assert.deepStrictEqual(settings['markdown-pdf.styles'].default, []);
  });

  it('declares every setting that config reads per resource as resource-scoped', () => {
    // Each of these is read with a resource URI so folder settings apply.
    const resourceScoped = [
      'markdown-pdf.styles',
      'markdown-pdf.displayHeaderFooter',
      'markdown-pdf.headerTemplate',
      'markdown-pdf.footerTemplate',
      'markdown-pdf.printBackground',
      'markdown-pdf.orientation',
      'markdown-pdf.format',
      'markdown-pdf.margin.top',
      'markdown-pdf.margin.bottom',
      'markdown-pdf.margin.right',
      'markdown-pdf.margin.left',
    ];
    for (const key of resourceScoped) {
      assert.ok(settings[key], `${key} must be contributed`);
      assert.strictEqual(settings[key].scope, 'resource', `${key} must be resource-scoped`);
    }
  });
});
