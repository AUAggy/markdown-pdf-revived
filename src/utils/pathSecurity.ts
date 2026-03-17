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

export function safeReadFile(_href: string, _baseDir: string, _allowedRoot: string): string | null {
  throw new Error('Not implemented');
}

export function computeAllowedRoot(
  _workspaceFolder: string | undefined,
  _filename: string,
  _allowOutside: boolean
): string {
  throw new Error('Not implemented');
}

export function getAllowedRoot(_filename: string): string {
  throw new Error('Not implemented');
}
