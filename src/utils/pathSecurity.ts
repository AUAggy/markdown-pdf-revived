export function safeResolvePath(_href: string, _baseDir: string, _allowedRoot: string): string | null {
  throw new Error('Not implemented');
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
