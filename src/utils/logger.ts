export function showErrorMessage(msg: string, error?: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as typeof import('vscode');
  vscode.window.showErrorMessage('ERROR: ' + msg);
  console.log('ERROR: ' + msg);
  if (error) {
    vscode.window.showErrorMessage(String(error));
    console.log(error);
  }
}

export function logError(msg: string, error: unknown): void {
  console.error('ERROR: ' + msg, error);
}

export function reportBlockedImages(blocked: number, reasons: string[]): void {
  if (blocked === 0) return;
  logError('resolveImagePaths(): image sources skipped', { blocked, reasons });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as typeof import('vscode');
  vscode.window.showWarningMessage(`[Markdown PDF]: ${blocked} image(s) skipped (${reasons.join(', ')}).`);
}

export function setBooleanValue(frontmatterValue: unknown, configValue: boolean): boolean {
  if (frontmatterValue === false) return false;
  return (frontmatterValue as boolean) || configValue;
}
