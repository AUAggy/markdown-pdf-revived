export interface BrowserLaunchOptions {
  executablePath: string;
  args: string[];
}

export class BrowserLaunchError extends Error {
  constructor(
    public readonly executablePath: string,
    public readonly initialError: unknown,
    public readonly fallbackError?: unknown
  ) {
    super(fallbackError ? 'Sandboxed and fallback browser launches failed.' : 'Browser launch failed.');
    this.name = 'BrowserLaunchError';
  }
}

export function buildLaunchArgs(language: string, sandboxFallback = false): string[] {
  const args = [`--lang=${language}`];
  if (sandboxFallback) args.push('--no-sandbox', '--disable-setuid-sandbox');
  return args;
}

export function isRecognizedSandboxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    /no usable sandbox/i,
    /running as root without --no-sandbox/i,
    /failed to move to new namespace.*operation not permitted/i,
    /the SUID sandbox helper binary was found, but is not configured correctly/i,
  ].some((pattern) => pattern.test(message));
}

export async function launchBrowserWithPolicy<T>(
  launch: (options: BrowserLaunchOptions) => Promise<T>,
  executablePath: string,
  platform: NodeJS.Platform,
  language: string
): Promise<T> {
  try {
    return await launch({
      executablePath,
      args: buildLaunchArgs(language),
    });
  } catch (initialError) {
    if (platform !== 'linux' || !isRecognizedSandboxError(initialError)) {
      throw new BrowserLaunchError(executablePath, initialError);
    }
    try {
      return await launch({
        executablePath,
        args: buildLaunchArgs(language, true),
      });
    } catch (fallbackError) {
      throw new BrowserLaunchError(executablePath, initialError, fallbackError);
    }
  }
}
