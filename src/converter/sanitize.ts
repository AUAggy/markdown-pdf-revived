import { showErrorMessage } from '../utils/logger';

// RCDATA/raw-text elements whose opening tags cause HTML5 parsers (including jsdom) to
// enter a mode where all subsequent content is consumed as raw text until the matching
// close tag. If one of these tags appears inline in markdown prose (e.g. "use <title> to
// set the page title") and is passed through by markdown-it (html: true), jsdom will
// swallow everything that follows as the element's text content. DOMPurify never sees
// those subsequent nodes, so they silently disappear from the output — truncating the PDF.
// Pre-escaping these tags before jsdom parses the HTML prevents that entirely.
const RCDATA_TAG_RE = /(<\/?(title|textarea|xmp|noscript|noframes|listing|plaintext)\b[^>]*>)/gi;

export function preEscapeRcdataTags(html: string): string {
  return html.replace(RCDATA_TAG_RE, m => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

// Sanitize user-supplied HTML to prevent XSS (CVE-2024-7739).
// Only markdown-rendered content is sanitized — not trusted internal assets
// (inlined Mermaid script, KaTeX/hljs stylesheets, etc.).
//
// Config rationale:
//   FORCE_BODY      – treat input as a body fragment, not a full document
//   ALLOW_DATA_ATTR – preserve data-* attributes used by Mermaid
//   ADD_TAGS        – allow <svg> and MathML elements so KaTeX renders correctly
//   FORBID_TAGS     – explicitly block <script>, <iframe>, <object> in user content
//   uponSanitizeAttribute hook – block ALL on* event handlers (covers current and future handlers)
//   Fail-closed: returns null on error → export is blocked entirely
export function sanitizeContent(html: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createDOMPurify = require('dompurify') as (window: Window) => {
      sanitize: (s: string, o: object) => string;
      addHook: (hook: string, cb: (node: unknown, data: { attrName: string; keepAttr: boolean }) => void) => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsdom = require('jsdom') as { JSDOM: new (html: string) => { window: Window } };
    const window = new jsdom.JSDOM('').window;
    const DOMPurify = createDOMPurify(window as unknown as Window);

    // Strip ALL event handler attributes (on*) — covers current and future handlers
    DOMPurify.addHook('uponSanitizeAttribute', (_node: unknown, data: { attrName: string; keepAttr: boolean }) => {
      if (/^on/i.test(data.attrName)) {
        data.keepAttr = false;
      }
    });

    return DOMPurify.sanitize(preEscapeRcdataTags(html), {
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: ['svg', 'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac',
        'mover', 'munder', 'munderover', 'mtext', 'mtable', 'mtr', 'mtd',
        'semantics', 'annotation'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base'],
    });
  } catch (error) {
    showErrorMessage('sanitizeContent(): HTML sanitization failed — export blocked for safety.', error);
    return null;
  }
}
