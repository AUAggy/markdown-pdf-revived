import * as fs from 'fs';
import * as path from 'path';

export function safeResolvePath(href: string, baseDir: string, allowedRoot: string): string | null {
  if (!href) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null; // malformed percent sequence
  }

  // Strip quotes and normalize separators
  decoded = decoded.replace(/("|')/g, '').replace(/\\/g, '/');

  // Resolve to absolute path
  const absolute = path.isAbsolute(decoded)
    ? path.resolve(decoded)
    : path.resolve(baseDir, decoded);

  // Resolve symlinks to real path
  let realPath: string;
  try {
    realPath = fs.realpathSync(absolute);
  } catch {
    return null; // file doesn't exist or can't be resolved
  }

  // Boundary check: resolved path must be within allowedRoot
  // Also resolve symlinks in allowedRoot so comparison is consistent (e.g. macOS /tmp -> /private/tmp)
  let normalizedRoot: string;
  try {
    normalizedRoot = fs.realpathSync(path.resolve(allowedRoot));
  } catch {
    normalizedRoot = path.resolve(allowedRoot);
  }
  const rel = path.relative(normalizedRoot, realPath);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return realPath;
  }

  return null;
}

export function safeReadFile(href: string, baseDir: string, allowedRoot: string): string | null {
  const resolvedPath = safeResolvePath(href, baseDir, allowedRoot);
  if (!resolvedPath) return null;

  let fd: number | undefined;
  try {
    // O_NOFOLLOW prevents symlink swap between realpathSync and open (non-Windows only)
    const flags = process.platform === 'win32'
      ? fs.constants.O_RDONLY
      : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
    fd = fs.openSync(resolvedPath, flags);

    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return null;

    // readFileSync(fd) reads from position 0 on a freshly opened fd
    return fs.readFileSync(fd, 'utf-8');
  } catch {
    return null; // ELOOP on symlink swap, permission error, or any other error
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
  }
}

export function computeAllowedRoot(
  workspaceFolder: string | undefined,
  filename: string,
  allowOutside: boolean
): string {
  if (allowOutside) {
    return path.parse(path.resolve(filename)).root;
  }
  return workspaceFolder ?? path.dirname(filename);
}

export function getAllowedRoot(filename: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as typeof import('vscode');
  const resource = vscode.Uri.file(filename);
  const workspace = vscode.workspace.getWorkspaceFolder(resource);
  const allowOutside = vscode.workspace
    .getConfiguration('markdown-pdf')
    .get<boolean>('allowPathsOutsideWorkspace') ?? false;
  return computeAllowedRoot(workspace?.uri.fsPath, filename, allowOutside);
}
