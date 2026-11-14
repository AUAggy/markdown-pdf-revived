import * as fs from 'fs';

export function isExistsPath(filePath: string): boolean {
  if (filePath.length === 0) return false;
  try {
    fs.accessSync(filePath);
    return true;
  } catch (error) {
    console.warn((error as Error).message);
    return false;
  }
}

export function isExistsDir(dirPath: string): boolean {
  if (dirPath.length === 0) return false;
  try {
    if (fs.statSync(dirPath).isDirectory()) return true;
    console.warn('Directory does not exist!');
    return false;
  } catch (error) {
    console.warn((error as Error).message);
    return false;
  }
}

// encode=undefined → utf-8 string; encode=null → raw Buffer; encode=string → that encoding
export function readFile(filename: string, encode?: BufferEncoding | null): string | Buffer {
  if (filename.length === 0) return '';

  if (filename.startsWith('file://')) {
    if (process.platform === 'win32') {
      filename = filename.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
    } else {
      filename = filename.replace(/^file:\/\//, '');
    }
  }

  if (!isExistsPath(filename)) return '';

  if (encode === null) {
    return fs.readFileSync(filename);
  }
  return fs.readFileSync(filename, encode ?? 'utf-8');
}

export function mkdir(dirPath: string): void {
  if (isExistsDir(dirPath)) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mkdirp = require('mkdirp') as { sync: (p: string) => void };
  mkdirp.sync(dirPath);
}
