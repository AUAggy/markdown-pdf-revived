'use strict';

const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

async function run() {
  const mocha = new Mocha({
    color: true,
    timeout: 60_000,
    ui: 'tdd',
  });

  const testsRoot = path.resolve(__dirname);
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.sort().forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

  await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { run };
