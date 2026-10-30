'use strict';

// Multi-root workspace fixture for the resource-scoped stylesheet test.
//
// Runs create this before launching VS Code and pass the location through the
// environment, so the folder-scope test can write per-folder settings into two
// real workspace folders. Nothing is written inside the repository.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FOLDERS = ['alpha', 'beta'];

function create() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-pdf-workspace-')));
  const folderPaths = FOLDERS.map(name => {
    const folder = path.join(root, name);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  });

  const workspaceFile = path.join(root, 'multi-root.code-workspace');
  fs.writeFileSync(
    workspaceFile,
    JSON.stringify(
      {
        folders: folderPaths.map(folder => ({ path: folder })),
        settings: {},
      },
      null,
      2
    ) + '\n'
  );

  return {
    workspaceFile,
    folderPaths,
    env: {
      MARKDOWN_PDF_TEST_WORKSPACE: workspaceFile,
      MARKDOWN_PDF_TEST_FOLDERS: folderPaths.join(path.delimiter),
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

module.exports = { create };
