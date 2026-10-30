'use strict';

// Minimal PDF outline reader for tests. It walks the bookmark tree through the
// /Type /Outlines root, so assertions can check real nesting and destinations
// instead of grepping for the string "/Outlines".
//
// Scope: uncompressed object definitions, which is what Chromium's PDF writer
// emits for document outlines. This is test tooling, not a general PDF parser.

const fs = require('fs');

function readObjects(buffer) {
  const text = buffer.toString('latin1');
  const objects = new Map();
  const objectPattern = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
  let match;
  while ((match = objectPattern.exec(text)) !== null) {
    objects.set(Number(match[1]), match[2]);
  }
  return objects;
}

// PDF literal string: balanced parentheses with backslash escapes, or a hex
// string for UTF-16 values.
function readString(body, key) {
  const literal = new RegExp(`/${key}\\s*\\(`).exec(body);
  if (literal) {
    let depth = 1;
    let value = '';
    for (let index = literal.index + literal[0].length; index < body.length; index++) {
      const char = body[index];
      if (char === '\\') { value += body[++index]; continue; }
      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth === 0) break;
      }
      value += char;
    }
    return value;
  }
  const hex = new RegExp(`/${key}\\s*<([0-9A-Fa-f\\s]+)>`).exec(body);
  if (hex) {
    const bytes = Buffer.from(hex[1].replace(/\s+/g, ''), 'hex');
    return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
      ? bytes.subarray(2).toString('utf16le').replace(/\u0000/g, '')
      : bytes.toString('latin1');
  }
  return undefined;
}

function readRef(body, key) {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(body);
  return match ? Number(match[1]) : undefined;
}

function readNumber(body, key) {
  const match = new RegExp(`/${key}\\s+(-?\\d+)`).exec(body);
  return match ? Number(match[1]) : undefined;
}

// Destination: either an explicit array on the item or a named destination
// resolved through the /Dests name tree is not needed for Chromium output.
function readDestination(body) {
  const explicit = /\/Dest\s*\[\s*(\d+)\s+0\s+R\s*\/(\w+)/.exec(body);
  if (explicit) return { pageRef: Number(explicit[1]), fit: explicit[2] };
  const action = /\/A\s*<<[^>]*\/D\s*\[\s*(\d+)\s+0\s+R\s*\/(\w+)/.exec(body);
  if (action) return { pageRef: Number(action[1]), fit: action[2] };
  return undefined;
}

function readItem(objects, id, depth = 0) {
  if (depth > 20) throw new Error('outline nesting too deep or cyclic');
  const body = objects.get(id);
  if (!body) return undefined;
  const item = { title: readString(body, 'Title') };
  const destination = readDestination(body);
  if (destination) item.destination = destination;
  const firstChild = readRef(body, 'First');
  if (firstChild !== undefined) item.children = readSiblings(objects, firstChild, depth + 1);
  return item;
}

function readSiblings(objects, firstId, depth) {
  const items = [];
  let current = firstId;
  const seen = new Set();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const item = readItem(objects, current, depth + 1);
    if (!item) break;
    items.push(item);
    current = readRef(objects.get(current) || '', 'Next');
  }
  return items;
}

/** Returns the outline tree, or null when the PDF has no outline. */
function readPdfOutline(filePath) {
  const objects = readObjects(fs.readFileSync(filePath));
  let rootId;
  for (const [id, body] of objects) {
    if (/\/Type\s*\/Outlines/.test(body)) { rootId = id; break; }
  }
  if (rootId === undefined) return null;
  const first = readRef(objects.get(rootId), 'First');
  if (first === undefined) return null;
  return { count: readNumber(objects.get(rootId), 'Count'), items: readSiblings(objects, first, 0) };
}

/** Collect outline titles depth-first, with their nesting depth. */
function flattenOutline(outline) {
  const flat = [];
  const walk = (items, depth) => {
    for (const item of items) {
      flat.push({ title: item.title, depth, hasDestination: Boolean(item.destination) });
      if (item.children) walk(item.children, depth + 1);
    }
  };
  if (outline) walk(outline.items, 0);
  return flat;
}

module.exports = { readPdfOutline, flattenOutline };
