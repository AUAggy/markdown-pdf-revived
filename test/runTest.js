'use strict';

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');

  await runTests({
    version: process.env.VSCODE_TEST_VERSION || '1.109.0',
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions'],
  });
}

main().catch((error) => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
