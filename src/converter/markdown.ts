import * as path from 'path';
import * as url from 'url';
import type * as vscode from 'vscode';
import { EXTENSION_ROOT, config } from '../config/settings';
import { readFile } from '../utils/file';
import { showErrorMessage, setBooleanValue } from '../utils/logger';
import { slug } from './slug';
import { markdownItKaTeX } from './katex';
import { safeResolvePath, safeReadFile } from '../utils/pathSecurity';

const INCLUDE_RE = /:\[[^\]]+\]\(([^)]+)\)/g;
const MAX_INCLUDE_DEPTH = 10;

export function inlineIncludesSecure(
  markdown: string,
  filename: string,
  allowedRoot: string,
  depth = 0,
  seen = new Set<string>()
): string {
  if (depth >= MAX_INCLUDE_DEPTH) return markdown;

  return markdown.replace(INCLUDE_RE, (_match: string, includeTarget: string) => {
    const baseDir = path.dirname(filename);

    // Resolve path first for cycle detection
    const realPath = safeResolvePath(includeTarget, baseDir, allowedRoot);
    if (!realPath) return '';
    if (seen.has(realPath)) return '';

    // Read file content (TOCTOU-safe)
    const content = safeReadFile(includeTarget, baseDir, allowedRoot);
    if (content === null) return '';

    // Per-branch copy of seen set
    const nextSeen = new Set(seen);
    nextSeen.add(realPath);
    return inlineIncludesSecure(content, realPath, allowedRoot, depth + 1, nextSeen);
  });
}

function convertImgPath(src: string, filename: string): string {
  try {
    let href = decodeURIComponent(src)
      .replace(/("|')/g, '')
      .replace(/\\/g, '/')
      .replace(/#/g, '%23');
    const protocol = url.parse(href).protocol;
    if (protocol === 'file:' && !href.startsWith('file:///')) {
      return href.replace(/^file:\/\//, 'file:///');
    } else if (protocol === 'file:') {
      return href;
    } else if (!protocol || path.isAbsolute(href)) {
      href = path.resolve(path.dirname(filename), href)
        .replace(/\\/g, '/')
        .replace(/#/g, '%23');
      if (href.startsWith('//')) return 'file:' + href;
      if (href.startsWith('/')) return 'file://' + href;
      return 'file:///' + href;
    }
    return src;
  } catch (error) {
    showErrorMessage('convertImgPath()', error);
    return src;
  }
}

function transformCallouts(html: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html, { xmlMode: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('blockquote').each((_: number, el: any) => {
    const firstP = $(el).find('p').first();
    const text = firstP.text().trim();
    const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (!match) return;
    const type = match[1].toLowerCase();
    const label = match[1].toUpperCase();
    // Remove the [!TYPE] marker from the first paragraph's HTML
    const currentHtml = firstP.html() ?? '';
    firstP.html(currentHtml.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](<br\s*\/?>)?/i, '').trim());
    // Add the label paragraph before the content
    firstP.before(`<p class="callout-label">${label}</p>`);
    // Apply callout class and data attribute to the blockquote element
    $(el).attr('class', `callout callout-${type}`);
    $(el).attr('data-callout', type);
  });
  return $('body').html() ?? html;
}

export interface ConvertResult {
  html: string;
  title?: string;  // from YAML frontmatter, if present
}

export function convertMarkdownToHtml(filename: string, type: string, text: string): ConvertResult | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const grayMatter = require('gray-matter') as (s: string) => { data: Record<string, unknown>; content: string };
  const matterParts = grayMatter(text);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as typeof import('vscode');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAllowedRoot } = require('../utils/pathSecurity') as typeof import('../utils/pathSecurity');
  const allowedRoot = getAllowedRoot(filename);
  const markdownContent = inlineIncludesSecure(matterParts.content, filename, allowedRoot);

  let statusbarMessage: vscode.Disposable | undefined;
  try {
    try {
      statusbarMessage = vscode.window.setStatusBarMessage('$(markdown) Converting (convertMarkdownToHtml) ...');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const hljs = require('highlight.js') as { getLanguage: (l: string) => unknown; highlight: (l: string, s: string, b: boolean) => { value: string } };
      const breaks = setBooleanValue(matterParts.data['breaks'], config.breaks());

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const MarkdownIt = require('markdown-it') as new (opts: object) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md: any = new MarkdownIt({
        html: true,
        breaks,
        highlight: function (str: string, lang: string): string {
          if (lang && lang.match(/\bmermaid\b/i)) {
            return `<div class="mermaid">${str}</div>`;
          }
          if (lang && hljs.getLanguage(lang)) {
            try {
              str = hljs.highlight(lang, str, true).value;
            } catch (error) {
              str = md.utils.escapeHtml(str);
              showErrorMessage('markdown-it:highlight', error);
            }
          } else {
            str = md.utils.escapeHtml(str);
          }
          return '<pre class="hljs"><code><div>' + str + '</div></code></pre>';
        },
      });

      // Image path conversion
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cheerio = require('cheerio') as { load: (s: string) => import('cheerio').CheerioAPI };
      const defaultRender = md.renderer.rules['image'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      md.renderer.rules['image'] = function (tokens: any[], idx: number, options: object, env: unknown, self: any): string {
        const token = tokens[idx];
        let href = token.attrs[token.attrIndex('src')][1] as string;
        if (type === 'html') {
          href = decodeURIComponent(href).replace(/("|')/g, '');
        } else {
          href = convertImgPath(href, filename);
        }
        token.attrs[token.attrIndex('src')][1] = href;
        return defaultRender ? defaultRender(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options) as string;
      };

      if (type !== 'html') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        md.renderer.rules['html_block'] = function (tokens: any[], idx: number): string {
          const html = tokens[idx].content as string;
          const $ = cheerio.load(html);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $('img').each(function (_i: number, elem: any) {
            const src = $(elem).attr('src') ?? '';
            $(elem).attr('src', convertImgPath(src, filename));
          });
          return $.html();
        };
      }

      // Plugins
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      md.use(require('markdown-it-checkbox'));

      const emojiEnabled = setBooleanValue(matterParts.data['emoji'], config.emoji());
      if (emojiEnabled) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const emojiesDefs = require(path.join(EXTENSION_ROOT, 'data', 'emoji.json')) as Record<string, string>;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        md.use((require('markdown-it-emoji') as { full: import('markdown-it').PluginSimple }).full, { defs: emojiesDefs });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        md.renderer.rules['emoji'] = function (token: any[], idx: number): string {
          const emoji = token[idx].markup as string;
          const emojipath = path.join(EXTENSION_ROOT, 'node_modules', 'emoji-images', 'pngs', emoji + '.png');
          const emojidata = (readFile(emojipath, null) as Buffer).toString('base64');
          if (emojidata) {
            return `<img class="emoji" alt="${emoji}" src="data:image/png;base64,${emojidata}" />`;
          }
          return ':' + emoji + ':';
        };
      }

      if (setBooleanValue(matterParts.data['math'], config.math())) {
        md.use(markdownItKaTeX);
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      md.use(require('markdown-it-anchor'), { slugify: slug, permalink: false });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      md.use(require('markdown-it-container'), '', {
        validate: (name: string) => name.trim().length > 0,
        render: (tokens: { info: string; nesting: number }[], idx: number) => {
          if (tokens[idx].info.trim() !== '') {
            return `<div class="${tokens[idx].info.trim()}">\n`;
          }
          return '</div>\n';
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      md.use(require('markdown-it-footnote'));

      statusbarMessage.dispose();
      return {
        html: transformCallouts(md.render(markdownContent)),
        title: (typeof matterParts.data['title'] === 'string' && matterParts.data['title'].trim() !== '')
          ? (matterParts.data['title'] as string).trim()
          : undefined,
      };

    } catch (error) {
      statusbarMessage?.dispose();
      showErrorMessage('convertMarkdownToHtml()', error);
      return undefined;
    }
  } catch (error) {
    statusbarMessage?.dispose();
    showErrorMessage('convertMarkdownToHtml()', error);
    return undefined;
  }
}
