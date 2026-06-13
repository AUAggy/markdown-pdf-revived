import * as fs from 'fs';

export function exportHtml(data: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filename, data, 'utf-8', (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
