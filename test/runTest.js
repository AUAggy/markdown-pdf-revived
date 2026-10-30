'use strict';

const fs = require('fs');
const path = require('path');
const { runTests } = require('@vscode/test-electron');
const workspaceFixture = require('./workspaceFixture');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const fixture = workspaceFixture.create();

  try {
    await runTests({
      version: process.env.VSCODE_TEST_VERSION || '1.109.0',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions', fixture.workspaceFile],
      extensionTestsEnv: fixture.env,
    });
  } finally {
    fixture.cleanup();
  }
}

main().catch((error) => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
