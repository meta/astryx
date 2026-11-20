// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A small, forgiving HTML reader for `astryx experimental export
 * --reverse`, plus the helpers that ask it which Astryx component an element
 * came from. Its scanner tokenizes as a browser does, as far as markup an
 * export writes needs; it also finds the parts of a rendered file that a
 * reverse compares, and the elements the first paint marks.
 *
 * @position foundation/render — used by rebuild.mjs, markup-edits.mjs,
 * source-block.mjs, render-page.mjs and the render subject
 */

/** @typedef {{tag: string, attrs: Record<string, string>, children: Node[]}} ElementNode */
/** @typedef {ElementNode | {text: string}} Node */

export const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
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
 * Elements whose content is raw text up to their own end tag, as a browser's
 * tokenizer reads them: a tag or a comment opener in it is text.
 */
export const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'iframe', 'xmp', 'noembed', 'noframes']);

/**
 * One piece of an HTML document, by its place in the text. `raw` is the
 * content of a raw-text element.
 * @typedef {{kind: 'text' | 'raw' | 'comment' | 'cdata' | 'doctype', start: number, end: number}
 *   | {kind: 'end', tag: string, start: number, end: number}
 *   | {kind: 'start', tag: string, attrs: Array<[string, string, number, number]>, selfClosing: boolean, start: number, end: number}} HtmlToken
 */

const SPACE = /[\t\n\f\r ]/;
const LETTER = /[a-zA-Z]/;
const DOCTYPE = /<!doctype/iy;

/**
 * The tag whose name starts at `i`, read as a browser reads it: an attribute
 * value is quoted or runs to a space or `>`, and a `/` just before `>` makes
 * the tag self-closing.
 * @param {string} html
 * @param {number} i the first letter of the name
 * @returns {{tag: string, attrs: Array<[string, string, number, number]>, selfClosing: boolean, end: number} | 'open'}
 *   each attribute: its name, its value, and where its text starts and ends;
 *   'open' when no `>` ends the tag, so the rest of the document is text
 */
export function readTag(html, i) {
  const n = html.length;
  const nameStart = i;
  // A browser reads a tag name up to white space, `/` or `>`.
  while (i < n && !SPACE.test(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
  if (i >= n) return 'open';
  const tag = html.slice(nameStart, i).toLowerCase();
  /** @type {Array<[string, string, number, number]>} */
  const attrs = [];
  let selfClosing = false;
  while (i < n && html[i] !== '>') {
    if (SPACE.test(html[i])) {
      i++;
      continue;
    }
    if (html[i] === '/') {
      selfClosing = html[i + 1] === '>';
      i++;
      continue;
    }
    const nameAt = i++;
    while (i < n && !SPACE.test(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
    const name = html.slice(nameAt, i).toLowerCase();
    let j = i;
    while (j < n && SPACE.test(html[j])) j++;
    let value = '';
    if (html[j] === '=') {
      j++;
      while (j < n && SPACE.test(html[j])) j++;
      const quote = html[j];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, j + 1);
        if (close < 0) return 'open';
        value = html.slice(j + 1, close);
        i = close + 1;
      } else {
        const from = j;
        while (j < n && !SPACE.test(html[j]) && html[j] !== '>') j++;
        value = html.slice(from, j);
        i = j;
      }
    }
    attrs.push([name, value, nameAt, i]);
  }
  return i >= n ? 'open' : {tag, attrs, selfClosing, end: i + 1};
}

/**
 * Where the end tag of a raw-text element `tag` starts at or after `from`:
 * `</tag` followed by whitespace, `/` or `>`, in any case; else the end. A
 * longer name (`</textareas>`) ends nothing.
 * @param {string} html
 * @param {string} tag
 * @param {number} from
 * @returns {number}
 */
function endTagAt(html, tag, from) {
  const end = new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'gi');
  end.lastIndex = from;
  return end.exec(html)?.index ?? html.length;
}

/**
 * Where a script's text ends, as the HTML tokenizer's script data states
 * read it: after `<!--` the text is escaped, and an escaped `<script` opens a
 * double-escaped run that only its own `</script` closes, so the `</script>`
 * inside it ends nothing; `-->` returns to plain script data.
 * @param {string} html
 * @param {number} from
 * @returns {number}
 */
function scriptEnd(html, from) {
  const piece = /<!--|-->|<\/?script(?=[\t\n\f\r />])/gi;
  piece.lastIndex = from;
  /** @type {'data' | 'escaped' | 'double'} */
  let state = 'data';
  for (let m = piece.exec(html); m; m = piece.exec(html)) {
    const found = m[0].toLowerCase();
    if (found === '<!--') {
      if (state === 'data') state = 'escaped';
      // `<!-->` and `<!--->` close at once.
      if (state === 'escaped' && /^-?>/.test(html.slice(m.index + 4, m.index + 6))) state = 'data';
    } else if (found === '-->') {
      if (state !== 'data') state = 'data';
    } else if (found === '</script') {
      if (state === 'double') state = 'escaped';
      else return m.index;
    } else if (state === 'escaped') {
      state = 'double';
    }
  }
  return html.length;
}

/** Each open element the scanner tracks inside svg or MathML content. */
/** @typedef {{ns: 'html' | 'svg' | 'math', tag: string, htmlPoint: boolean, textPoint: boolean}} OpenElement */

/** MathML text integration points (HTML §13.2.6): mi, mo, mn, ms, mtext. */
const MATH_TEXT_POINTS = new Set(['mi', 'mo', 'mn', 'ms', 'mtext']);

/** SVG HTML integration points (HTML §13.2.6): foreignObject, desc, title. */
const SVG_HTML_POINTS = new Set(['foreignobject', 'desc', 'title']);

/** The start tags that end svg or MathML content (HTML §13.2.6.5). */
const BREAKOUT = new Set([
  'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta',
  'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup',
  'table', 'tt', 'u', 'ul', 'var',
]);

/** HTML's "special" elements (HTML §13.2.4.2): an end tag stops at one. */
const SPECIAL = new Set([
  'address', 'applet', 'area', 'article', 'aside', 'base', 'basefont', 'bgsound', 'blockquote', 'body',
  'br', 'button', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dir', 'div', 'dl', 'dt',
  'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'iframe', 'img', 'input', 'keygen', 'li',
  'link', 'listing', 'main', 'marquee', 'menu', 'meta', 'nav', 'noembed', 'noframes', 'noscript',
  'object', 'ol', 'p', 'param', 'plaintext', 'pre', 'script', 'search', 'section', 'select', 'source',
  'style', 'summary', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'title',
  'tr', 'track', 'ul', 'wbr', 'xmp',
]);

/**
 * Whether a start tag in svg or MathML content ends it (HTML §13.2.6.5): a
 * breakout tag, or a `<font>` with a color, face or size.
 * @param {string} tag
 * @param {Array<[string, string, number, number]>} attrs
 */
const breaksOut = (tag, attrs) =>
  BREAKOUT.has(tag) || (tag === 'font' && attrs.some(([name]) => name === 'color' || name === 'face' || name === 'size'));

/**
 * The element a start tag opens in svg or MathML content, with the HTML
 * integration points (svg foreignObject, desc and title; a MathML
 * annotation-xml whose encoding is text/html or application/xhtml+xml) and
 * the MathML text integration points marked (HTML §13.2.6).
 * @param {'svg' | 'math'} ns
 * @param {string} tag
 * @param {Array<[string, string, number, number]>} attrs
 * @returns {OpenElement}
 */
function foreignElement(ns, tag, attrs) {
  const encoding = (attrs.find(([name]) => name === 'encoding')?.[1] ?? '').toLowerCase();
  const htmlPoint =
    ns === 'svg'
      ? SVG_HTML_POINTS.has(tag)
      : tag === 'annotation-xml' && (encoding === 'text/html' || encoding === 'application/xhtml+xml');
  return {ns, tag, htmlPoint, textPoint: ns === 'math' && MATH_TEXT_POINTS.has(tag)};
}

/**
 * Whether the tree construction dispatcher (HTML §13.2.6) hands a start tag
 * to the HTML insertion mode rather than to the rules for foreign content.
 * @param {OpenElement | undefined} node the current node
 * @param {string} tag
 */
const startIsHtml = (node, tag) =>
  !node ||
  node.ns === 'html' ||
  (node.textPoint && tag !== 'mglyph' && tag !== 'malignmark') ||
  (node.ns === 'math' && node.tag === 'annotation-xml' && tag === 'svg') ||
  node.htmlPoint;

/**
 * Close what an end tag closes in svg or MathML content, as the tree builder
 * does. In foreign content (HTML §13.2.6.5, "any other end tag"): walk the
 * stack from the current node, pop up to a node whose lowercased name is the
 * tag's, and at the first HTML element hand the token to the HTML insertion
 * mode. There ("any other end tag" in body, §13.2.6.4.7): pop up to a node
 * of that name, and stop at a special element, which the tag cannot close.
 * @param {OpenElement[]} open
 * @param {string} tag
 */
function closeEnd(open, tag) {
  let k = open.length - 1;
  if (k >= 0 && open[k].ns !== 'html') {
    for (; k >= 0 && open[k].ns !== 'html'; k--) {
      if (open[k].tag === tag) {
        open.length = k;
        return;
      }
    }
  }
  for (; k >= 0; k--) {
    if (open[k].tag === tag) {
      open.length = k;
      return;
    }
    const node = open[k];
    if (node.ns === 'html' ? SPECIAL.has(node.tag) : node.htmlPoint || node.textPoint) return;
  }
}

/**
 * Split an HTML document into its pieces, in order, as a browser does for
 * the markup a render writes. A comment ends at the first `-->` after its
 * `<!--` (so `<!-->` and `<!--->` are whole comments), or at the end. A bogus
 * comment (`<?…`, a `<!` that starts no comment or doctype, or `</` before a
 * character that is not a letter) is a comment to the next `>`. Inside svg
 * or MathML content, `<![CDATA[` is a `cdata` piece to `]]>`, `/>` closes a
 * tag and no element holds raw text; an integration point (`<foreignObject>`,
 * `<desc>`, svg `<title>`, an HTML `<annotation-xml>`, `<mi>`, `<mo>`, `<mn>`,
 * `<ms>`, `<mtext>`) and a breakout tag (`<p>`, `<div>`…) return to HTML,
 * and end tags close what the tree builder closes. The content
 * of a raw-text element up to its end tag is one `raw` piece, so a tag or a
 * comment in a stylesheet is text; `<plaintext>` makes the rest of the
 * document one `raw` piece. A `<` that starts no tag is
 * text, and a tag that no `>` ends makes the rest text. Each character is
 * read a fixed number of times, so the time grows with the document's length.
 * @param {string} html
 * @returns {Generator<HtmlToken>}
 */
export function* scanHtml(html) {
  const n = html.length;
  let at = 0;
  let text = 0;
  // The open elements of svg or MathML content, as the tree builder keeps
  // them (HTML §13.2.6): HTML elements are kept only inside it. A start tag
  // the dispatcher gives to foreign content is foreign, `/>` closes it, and
  // no element holds raw text; `<![CDATA[` is CDATA while the current node is
  // foreign (§13.2.5.42).
  /** @type {OpenElement[]} */
  const open = [];
  const current = () => open[open.length - 1];
  const breakOut = () => {
    for (let node = current(); node && node.ns !== 'html' && !node.htmlPoint && !node.textPoint; node = current()) open.pop();
  };
  while (at < n) {
    const lt = html.indexOf('<', at);
    if (lt < 0) break;
    const next = html[lt + 1] ?? '';
    /** @type {HtmlToken | null} */
    let token = null;
    /** Whether the HTML insertion mode reads this start tag. */
    let asHtml = true;
    DOCTYPE.lastIndex = lt;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 2);
      token = {kind: 'comment', start: lt, end: close < 0 ? n : close + 3};
    } else if (current() && current().ns !== 'html' && html.startsWith('<![CDATA[', lt)) {
      const close = html.indexOf(']]>', lt + 9);
      token = {kind: 'cdata', start: lt, end: close < 0 ? n : close + 3};
    } else if (DOCTYPE.test(html)) {
      const close = html.indexOf('>', lt);
      if (close < 0) break;
      token = {kind: 'doctype', start: lt, end: close + 1};
    } else if (next === '?' || next === '!' || (next === '/' && !LETTER.test(html[lt + 2] ?? '') && lt + 2 < n)) {
      const close = html.indexOf('>', lt + 2);
      token = {kind: 'comment', start: lt, end: close < 0 ? n : close + 1};
    } else if (LETTER.test(next) || (next === '/' && LETTER.test(html[lt + 2] ?? ''))) {
      const closing = next === '/';
      const read = readTag(html, lt + (closing ? 2 : 1));
      if (read === 'open') break;
      if (closing) {
        if (current() && current().ns !== 'html' && (read.tag === 'p' || read.tag === 'br')) breakOut();
        else closeEnd(open, read.tag);
        token = {kind: 'end', tag: read.tag, start: lt, end: read.end};
      } else {
        asHtml = startIsHtml(current(), read.tag);
        if (!asHtml && breaksOut(read.tag, read.attrs)) {
          breakOut();
          asHtml = true;
        }
        token = {
          kind: 'start',
          tag: read.tag,
          attrs: read.attrs,
          // A browser honours `/>` only on an svg or MathML element.
          selfClosing: read.selfClosing && (!asHtml || read.tag === 'svg' || read.tag === 'math'),
          start: lt,
          end: read.end,
        };
      }
    }
    if (!token) {
      at = lt + 1;
      continue;
    }
    if (lt > text) yield {kind: 'text', start: text, end: lt};
    yield token;
    at = text = token.end;
    if (token.kind !== 'start') continue;
    if (!asHtml || token.tag === 'svg' || token.tag === 'math') {
      const node = current();
      const ns = asHtml ? /** @type {'svg' | 'math'} */ (token.tag) : node?.ns === 'math' ? 'math' : 'svg';
      if (!token.selfClosing) open.push(foreignElement(ns, token.tag, token.attrs));
      continue;
    }
    if (open.length > 0 && !VOID.has(token.tag)) open.push({ns: 'html', tag: token.tag, htmlPoint: false, textPoint: false});
    if (token.tag === 'plaintext') {
      if (at < n) yield {kind: 'raw', start: at, end: n};
      return;
    }
    if (RAW_TEXT.has(token.tag)) {
      const stop = token.tag === 'script' ? scriptEnd(html, at) : endTagAt(html, token.tag, at);
      yield {kind: 'raw', start: at, end: stop};
      at = text = stop;
    }
  }
  if (n > text) yield {kind: 'text', start: text, end: n};
}

/**
 * A small, forgiving HTML parser: it builds the elements the scanner reads,
 * with each CDATA section in svg or MathML as text.
 * @param {string} html
 * @returns {ElementNode}
 */
export function parseHtml(html) {
  /** @type {ElementNode} */
  const root = {tag: '#root', attrs: {}, children: []};
  /** @type {ElementNode[]} */
  const stack = [root];
  for (const token of scanHtml(html)) {
    const top = stack[stack.length - 1];
    if (token.kind === 'text') {
      top.children.push({text: decode(html.slice(token.start, token.end))});
    } else if (token.kind === 'raw') {
      top.children.push({text: html.slice(token.start, token.end)});
    } else if (token.kind === 'cdata') {
      // Inside svg or MathML a CDATA section is text, as a browser shows it.
      const closed = html.startsWith(']]>', token.end - 3) && token.end - 3 >= token.start + 9;
      top.children.push({text: html.slice(token.start + 9, closed ? token.end - 3 : token.end)});
    } else if (token.kind === 'end') {
      const at = stack.map(n => n.tag).lastIndexOf(token.tag);
      if (at > 0) stack.length = at;
    } else if (token.kind === 'start') {
      /** @type {Record<string, string>} */
      const attrs = {};
      for (const [name, value] of token.attrs) attrs[name] = decode(value);
      /** @type {ElementNode} */
      const node = {tag: token.tag, attrs, children: []};
      top.children.push(node);
      if (!token.selfClosing && (RAW_TEXT.has(token.tag) || !VOID.has(token.tag))) stack.push(node);
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

