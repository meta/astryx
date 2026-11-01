// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A small, forgiving HTML reader for `astryx experimental render
 * --reverse`: enough for rendered markup, plus the helpers that ask it which
 * Astryx component an element came from.
 *
 * @position foundation/render — used by rebuild.mjs and the render subject
 */

/** @typedef {{tag: string, attrs: Record<string, string>, children: Node[]}} ElementNode */
/** @typedef {ElementNode | {text: string}} Node */

export const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'track', 'wbr',
]);

/** @param {string} s */
export const decode = s =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');

/**
 * A small, forgiving HTML parser: enough for rendered markup.
 * @param {string} html
 * @returns {ElementNode}
 */
export function parseHtml(html) {
  /** @type {ElementNode} */
  const root = {tag: '#root', attrs: {}, children: []};
  /** @type {ElementNode[]} */
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)/gi;
  /** @type {RegExpExecArray | null} */
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const at = stack.map(n => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      /** @type {Record<string, string>} */
      const attrs = {};
      for (const a of (m[3] ?? '').matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      }
      /** @type {ElementNode} */
      const node = {tag, attrs, children: []};
      top.children.push(node);
      if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title') {
        const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
        const stop = end < 0 ? html.length : end;
        node.children.push({text: html.slice(re.lastIndex, stop)});
        re.lastIndex = stop;
        stack.push(node);
      } else if (!VOID.has(tag) && !m[4]) {
        stack.push(node);
      }
    } else if (m[5]) {
      top.children.push({text: decode(m[5])});
    }
  }
  return root;
}

/** @param {Node} n @returns {n is ElementNode} */
export const isEl = n => 'tag' in n;

/** Elements whose children React refuses or treats as a value. */
export const FORM_TAGS = new Set(['input', 'textarea', 'select']);

/**
 * Whether an element draws one of `tags` itself, not inside another Astryx
 * component it contains.
 * @param {ElementNode} n @param {Set<string>} tags @returns {boolean}
 */
export const hasTag = (n, tags) =>
  tags.has(n.tag) ||
  n.children.some(c => isEl(c) && !astryxClass(c) && hasTag(c, tags));

/** @param {ElementNode} n @param {string} tag @returns {ElementNode | undefined} */
export function find(n, tag) {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (c.tag === tag) return c;
    const f = find(c, tag);
    if (f) return f;
  }
  return undefined;
}

/** @param {Node} n @returns {string} */
export const textOf = n =>
  isEl(n)
    ? n.tag === 'script' || n.tag === 'style'
      ? ''
      : n.children.map(textOf).join('')
    : n.text;

/** @param {ElementNode} n */
export const astryxClass = n =>
  (n.attrs.class ?? '')
    .split(/\s+/)
    .find(c => /^astryx-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c))
    ?.slice('astryx-'.length);

/**
 * Whether markup was rendered from Astryx components.
 * @param {string} html
 */
export const isAstryxMarkup = html => /\sclass="(?:[^"]*\s)?astryx-[a-z0-9]/.test(html);

