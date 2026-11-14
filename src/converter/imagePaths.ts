import { convertImgPath } from './markdown';

// Post-sanitize image source resolution for PDF export (plan: local image
// file:// regression). Runs after sanitizeContent() and before makeHtml(), so
// it only ever sees sources the sanitizer let through. Local path resolution
// is delegated to convertImgPath()/safeResolvePath() (realpath + boundary
// check) — this module never reads files itself and never adds file: to any
// sanitizer allowlist.

export interface ImagePathDiagnostics {
  blocked: number;
  reasons: string[]; // deduplicated, insertion ordered, path-free strings only
}

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const DATA_URI_BASE64_RE = /^data:[^,]*;base64,/i;
const DATA_URI_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i;
const INERT_SCHEMES = new Set(['mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp']);
const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;

// Returns null when the data URI is acceptable, otherwise the drop reason.
function classifyDataUri(src: string): string | null {
  if (!DATA_URI_BASE64_RE.test(src)) return 'malformed data URI';
  const imageMatch = DATA_URI_IMAGE_RE.exec(src);
  if (!imageMatch) return 'non-image data URI';
  const payload = src.slice(imageMatch[0].length);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor(payload.length * 3 / 4) - padding;
  if (estimatedBytes > MAX_DATA_URI_BYTES) return 'data URI too large';
  return null;
}

export function resolveImagePaths(
  html: string,
  filename: string,
  allowedRoot: string,
  diagnostics?: ImagePathDiagnostics
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html, { xmlMode: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drop = (element: any, reason: string): void => {
    $(element).removeAttr('src');
    if (!diagnostics) return;
    diagnostics.blocked += 1;
    if (!diagnostics.reasons.includes(reason)) diagnostics.reasons.push(reason);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('img[src]').each((_: number, element: any) => {
    const raw = $(element).attr('src') as string;
    const trimmed = raw.trim();
    if (trimmed === '') {
      drop(element, 'empty source');
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      drop(element, 'malformed percent escape');
      return;
    }

    if (decoded.startsWith('//')) {
      drop(element, 'protocol-relative URL');
      return;
    }

    const match = SCHEME_RE.exec(decoded);
    // A single-letter "scheme" is a Windows drive letter (C:docs\a.png), not a
    // scheme: it goes to the path branch where convertImgPath decides.
    const scheme = match && match[1].length > 1 ? match[1].toLowerCase() : null;

    if (scheme === 'http' || scheme === 'https') return;
    if (scheme === 'data') {
      const reason = classifyDataUri(trimmed);
      if (reason !== null) drop(element, reason);
      return;
    }
    if (scheme !== null && INERT_SCHEMES.has(scheme)) return;
    if (scheme !== null) {
      drop(element, `unsupported scheme: ${scheme}`);
      return;
    }

    // No scheme: local path. Strip query/fragment (not part of a filename) and
    // pass the RAW string — convertImgPath/safeResolvePath decode it exactly
    // once. Empty (fail-closed) result drops the source.
    const stripped = trimmed.replace(/[?#].*$/, '');
    const resolved = convertImgPath(stripped, filename, allowedRoot);
    if (resolved === '') {
      drop(element, 'local path blocked or missing');
      return;
    }
    $(element).attr('src', resolved);
  });

  // $.html() would wrap the fragment in <html><head></head><body>…; the export
  // pipeline needs the body markup itself (same pattern as transformCallouts).
  return $('body').html() ?? html;
}
