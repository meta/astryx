// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file XLE canonical printers — AST → compact (XLE) or outline (XLO) text.
 *
 * Used by the XLE validator so either party (agent or human)
 * can request the other surface, and by round-trip conformance tests.
 * Printing is best-effort canonical: spelling variants the lexer
 * normalized are emitted in canonical form.
 *
 * @input  parse() AST (binding not required)
 * @output toCompact(doc) / toOutline(doc)
 * @position lib/xle — inverse of parse.mjs
 */

/**
 * Quote a string for XLE/XLO output. The lexer (parse.mjs readString) has no
 * escape mechanism — a quoted run ends at the next matching delimiter — so we
 * pick the delimiter the string does NOT contain. This keeps the printed
 * surface re-parseable (e.g. a Button `label="Don't panic"` must not emit
 * `'Don't panic'`, which re-parses as a broken/unclosed token). A string
 * containing BOTH quote kinds is unrepresentable without parser escape support
 * and degrades to double-quotes (documented limitation).
 * @param {string} str
 * @returns {string}
 */
function quoteStr(str) {
  return str.includes('"') && !str.includes("'") ? `'${str}'` : `"${str}"`;
}

/**
 * @param {import('./xle-ast').XLEValue} value
 * @returns {string}
 */
function valueText(value) {
  if (typeof value === 'string')
    return /[\s,'"]/.test(value) ? quoteStr(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && /** @type {any} */ (value).idref) return `#${/** @type {any} */ (value).idref}`;
  if (Array.isArray(value)) return `[${value.map(valueText).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .map(([k, v]) => (v === true ? k : `${k}:${valueText(v)}`))
      .join(',')}}`;
  }
  return String(value);
}

/**
 * @param {import('./xle-ast').Hint} hint
 * @returns {string}
 */
function hintText(hint) {
  let out = hint.name;
  for (const flag of hint.flags || []) out += ` +${flag}`;
  if (hint.arg) out += `:${hint.arg}`;
  return `{${out}}`;
}

/** @param {import('./xle-ast').XLENode} node */
function attrTokens(node) {
  const tokens = [];
  for (const attr of node.attrs) {
    if (attr.kind === 'kv') tokens.push(`${attr.key}=${valueText(attr.value)}`);
    else if (attr.kind === 'flag') tokens.push(attr.key);
    else if (attr.kind === 'neg') tokens.push(`!${attr.key}`);
  }
  return tokens;
}

/** @param {import('./xle-ast').XLENode} node */
function slotTokensCompact(node) {
  return node.slots.map(slot => {
    if (slot.value == null) return `@${slot.key}`;
    if (typeof slot.value === 'string') return `@${slot.key}=${quoteStr(slot.value)}`;
    if ('hint' in slot.value) return `@${slot.key}=${hintText(slot.value.hint)}`;
    if (/** @type {any} */ (slot.value).idref) return `@${slot.key}=#${/** @type {any} */ (slot.value).idref}`;
    if ('subexpr' in slot.value) return `@${slot.key}=(${siblingsCompact(slot.value.subexpr)})`;
    return `@${slot.key}`;
  });
}

/**
 * @param {import('./xle-ast').XLENode} node
 * @returns {string}
 */
function nodeCompact(node) {
  let out = node.name || '';
  if (node.id) out += `#${node.id}`;
  for (const mod of node.enumMods) out += `.${mod}`;
  if (node.payload != null) out += quoteStr(node.payload);
  if (node.payload2 != null) out += `:${quoteStr(node.payload2)}`;
  const attrs = [...attrTokens(node), ...slotTokensCompact(node)];
  if (attrs.length > 0) out += `[${attrs.join(' ')}]`;
  if (node.hint) out += hintText(node.hint);
  if (node.selected) out += '!';
  if (node.repeat) out += `*${node.repeat}`;
  if (node.children.length > 0) {
    const inner = siblingsCompact(node.children);
    out += node.children.length === 1 ? ` > ${inner}` : ` > ${inner}`;
  }
  return out;
}

/**
 * @param {import('./xle-ast').XLEItem} item
 * @returns {string}
 */
function termCompact(item) {
  if (item.kind === 'group') {
    let out = `(${siblingsCompact(item.children)})`;
    if (item.repeat) out += `*${item.repeat}`;
    return out;
  }
  // Multi-sibling children need grouping when this node is itself a sibling.
  return nodeCompact(item);
}

/**
 * @param {import('./xle-ast').XLEItem[]} items
 * @returns {string}
 */
function siblingsCompact(items) {
  return items
    .map((item, i) => {
      const text = termCompact(item);
      // `a > b + c` binds b and c to a; if a itself has a following
      // sibling, the next `+` would rebind into a's children — wrap any
      // non-last sibling that opens a `>` chain in a group.
      const needsGroup =
        i < items.length - 1 && item.kind === 'node' && item.children.length > 0;
      return needsGroup ? `(${text})` : text;
    })
    .join(' + ');
}

/** @param {import('./xle-ast').XLEDoc} doc */
export function toCompact(doc) {
  let out = siblingsCompact(doc.roots);
  for (const overlay of doc.overlays) {
    out += ` ;; ${termCompact(overlay)}`;
  }
  return out;
}

// ── outline ────────────────────────────────────────────────────────────────

/**
 * @param {import('./xle-ast').XLENode} node
 * @param {number} depth
 * @returns {string[]}
 */
function nodeOutlineLines(node, depth) {
  const pad = '  '.repeat(depth);
  let line = node.name || '';
  if (node.id) line += `#${node.id}`;
  for (const mod of node.enumMods) line += `.${mod}`;
  if (node.payload != null) line += ` ${quoteStr(node.payload)}`;
  if (node.payload2 != null) line += ` :${quoteStr(node.payload2)}`;
  const attrs = attrTokens(node);
  if (attrs.length > 0) line += ' ' + attrs.join(' ');
  if (node.hint) line += ' ' + hintText(node.hint);
  if (node.selected) line += ' !';
  if (node.repeat) line += ` x${node.repeat}`;

  const lines = [pad + line.trimStart()];
  for (const slot of node.slots) {
    const sv = slot.value;
    if (sv && typeof sv === 'object' && 'subexpr' in sv) {
      const first = sv.subexpr[0];
      if (sv.subexpr.length === 1 && first && isSimpleNode(first)) {
        const sub = nodeOutlineLines(first, 0)[0];
        lines.push(`${pad}  ${slot.key}: ${sub}`);
        // simple = no children, so the single line is complete
      } else {
        lines.push(`${pad}  ${slot.key}:`);
        for (const sub of sv.subexpr) lines.push(...itemOutlineLines(sub, depth + 2));
      }
    } else if (typeof sv === 'string') {
      lines.push(`${pad}  ${slot.key}: ${quoteStr(sv)}`);
    } else if (sv && typeof sv === 'object' && 'hint' in sv) {
      lines.push(`${pad}  ${slot.key}: ${hintText(sv.hint)}`);
    } else if (sv && /** @type {any} */ (sv).idref) {
      lines.push(`${pad}  ${slot.key}: #${/** @type {any} */ (sv).idref}`);
    } else {
      lines.push(`${pad}  ${slot.key}:`);
    }
  }
  for (const child of node.children) lines.push(...itemOutlineLines(child, depth + 1));
  return lines;
}

/**
 * @param {import('./xle-ast').XLEItem} item
 * @returns {item is import('./xle-ast').XLENode}
 */
function isSimpleNode(item) {
  return item.kind === 'node' && item.children.length === 0 && item.slots.length === 0;
}

/**
 * @param {import('./xle-ast').XLEItem} item
 * @param {number} depth
 * @returns {string[]}
 */
function itemOutlineLines(item, depth) {
  if (item.kind === 'group') {
    // A repeat-less group exists only to disambiguate compact-form
    // sibling chains — indentation already does that, so inline it.
    if (!item.repeat || item.repeat === 1) {
      return item.children.flatMap(child => itemOutlineLines(child, depth));
    }
    const pad = '  '.repeat(depth);
    const lines = [`${pad}repeat ${item.repeat}:`];
    for (const child of item.children) lines.push(...itemOutlineLines(child, depth + 1));
    return lines;
  }
  return nodeOutlineLines(item, depth);
}

/** @param {import('./xle-ast').XLEDoc} doc */
export function toOutline(doc) {
  const lines = [];
  for (const item of doc.roots) lines.push(...itemOutlineLines(item, 0));
  if (doc.overlays.length > 0) {
    lines.push('', 'overlays:');
    for (const item of doc.overlays) lines.push(...itemOutlineLines(item, 1));
  }
  return lines.join('\n');
}
