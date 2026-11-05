// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental render --reverse` without an embedded source:
 * rebuild a page module from Astryx markup. Each element whose class list
 * names an Astryx component (`astryx-<name>`) becomes that component, with
 * the props its `data-*` attributes record and its text. This keeps text and
 * layout; styling, state and behavior are not in the markup, so the result is
 * a starting point, not the original.
 *
 * @position foundation/render — used by the render subject
 */

import {astryxClass, decode, find, FORM_TAGS, hasTag, isEl, parseHtml, textOf, VOID} from './html-reader.mjs';
import {componentMap, pascal} from './component-map.mjs';

/** @typedef {import('./html-reader.mjs').ElementNode} ElementNode */
/** @typedef {import('./html-reader.mjs').Node} Node */
/** @typedef {import('./component-map.mjs').ComponentEntry} ComponentEntry */

/** @param {string} s */
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * Pick the component for one element.
 * @param {ComponentEntry[]} list
 * @param {string} target
 * @param {ElementNode} el
 */
function pick(list, target, el) {
  const exact = list.find(e => e.name === pascal(target));
  const dir = el.attrs['data-direction'];
  if (dir) {
    const prefix = dir === 'horizontal' ? 'H' : dir === 'vertical' ? 'V' : '';
    const hit = prefix ? list.find(e => e.name === `${prefix}${pascal(target)}`) : undefined;
    if (hit) return hit;
  }
  return exact ?? list.find(e => e.name.endsWith(pascal(target))) ?? list[0];
}

/** Theme targets whose content the markup cannot give back (an icon's
 *  drawing is markup, not the component it came from). */
const OMIT = new Set(['icon']);

/** Attributes a component writes about itself that are not props. */
const NOT_PROPS = new Set(['astryx-pressable', 'state']);

/**
 * A stand-in value for a required prop the markup does not record, or null
 * when its type allows none (a list, an object, a named type).
 * @param {string} prop
 * @param {string} type
 * @param {ElementNode} el
 * @param {string} text
 * @returns {string | null}
 */
function standIn(prop, type, el, text) {
  const ty = type.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (/=>/.test(ty)) return `${prop}={() => {}}`;
  if (/\[\]|Array<|Record<|\{/.test(ty)) return null;
  if (/^number\b/.test(ty)) {
    const v = Number(el.attrs['aria-valuenow'] ?? el.attrs[`data-${prop}`] ?? 0);
    return `${prop}={${Number.isFinite(v) ? v : 0}}`;
  }
  if (/^boolean\b/.test(ty)) return `${prop}={false}`;
  if (/^(React\.)?(ReactNode|ReactElement)/.test(ty)) return `${prop}={null}`;
  if (/^string\b/.test(ty)) {
    const v = el.attrs['aria-label'] ?? el.attrs.title ?? (/(label|title|name|text)$/i.test(prop) ? text : '');
    return `${prop}=${jsxAttr(v)}`;
  }
  const literal = /^['"]([^'"]*)['"]/.exec(ty);
  if (literal) return `${prop}=${jsxAttr(literal[1])}`;
  return null;
}

/** @param {string} s */
const jsxText = s => s.replace(/[{}<>]/g, c => `{'${c}'}`);

/**
 * A JSX attribute value: a plain quoted string when it can be one, else an
 * expression (`{"say \\"hi\\""}`), since JSX strings take no escapes.
 * @param {string} s
 */
const jsxAttr = s => (/["\\\n\r{}]/.test(s) ? `{${JSON.stringify(s)}}` : `"${s}"`);

/**
 * Text safe inside a `//` comment: every control character and line or
 * paragraph separator becomes a space, so nothing after it can become code.
 * @param {string} s
 */
const oneLine = s =>
  [...s]
    .map(c => {
      const n = /** @type {number} */ (c.codePointAt(0));
      return n < 32 || (n >= 127 && n <= 159) || n === 0x2028 || n === 0x2029 ? ' ' : c;
    })
    .join('');

/**
 * Rebuild a page module from Astryx markup.
 * @param {string} html
 * @param {string} fromDir where to find the installed packages
 * @returns {{source: string, components: string[], elements: number, unknown: string[], omitted: string[]}}
 */
export function rebuildPage(html, fromDir) {
  const doc = parseHtml(html);
  const body = find(doc, 'body') ?? doc;
  const maps = ['@astryxdesign/core', '@astryxdesign/lab', '@astryxdesign/charts'].map(p => componentMap(p, fromDir));
  /** @param {string} target */
  const lookup = target => {
    for (const m of maps) {
      const list = m.get(target);
      if (list?.length) return list;
    }
    return undefined;
  };
  /** @type {Map<string, Set<string>>} */
  const imports = new Map();
  /** @type {Set<string>} */
  const unknown = new Set();
  /** @type {Set<string>} */
  const omitted = new Set();
  /** @type {Set<string>} */
  const degraded = new Set();
  let elements = 0;

  /** @param {Node} n @returns {boolean} */
  const hasAstryx = n =>
    isEl(n) && (Boolean(astryxClass(n)) || n.children.some(hasAstryx));

  /**
   * An element's content as plain text elements, components left out.
   * @param {Node} n
   * @param {string} indent
   * @returns {string[]}
   */
  const plain = (n, indent) => {
    if (!isEl(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      return t ? [`${indent}<span>${jsxText(t)}</span>`] : [];
    }
    if (n.tag === 'script' || n.tag === 'style' || n.tag === 'template') return [];
    const block = n.children.some(c => isEl(c) && !/^(span|strong|em|code|a|small|b|i)$/.test(c.tag));
    if (!block) {
      const t = textOf(n).replace(/\s+/g, ' ').trim();
      return t ? [`${indent}<span>${jsxText(t)}</span>`] : [];
    }
    return n.children.flatMap(c => plain(c, indent));
  };

  /**
   * @param {Node} n
   * @param {string} indent
   * @returns {string[]}
   */
  const emit = (n, indent) => {
    if (!isEl(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      return t ? [`${indent}${jsxText(t)}`] : [];
    }
    if (n.tag === 'script' || n.tag === 'style' || n.tag === 'template') return [];
    const target = astryxClass(n);
    if (target && OMIT.has(target)) {
      omitted.add(target);
      return [];
    }
    const list = target ? lookup(target) : undefined;
    if (target && !list) unknown.add(target);
    if (!list || !target) {
      if (n.children.some(hasAstryx)) return n.children.flatMap(c => emit(c, indent));
      const t = textOf(n).replace(/\s+/g, ' ').trim();
      if (!t) {
        if (n.tag === 'img' && n.attrs.src) {
          return [`${indent}<img src=${jsxAttr(n.attrs.src)} alt=${jsxAttr(n.attrs.alt ?? '')} />`];
        }
        return [];
      }
      const tag = /^(h[1-6]|p|span|strong|em|code|pre|li|a|label|small)$/.test(n.tag) ? n.tag : 'span';
      const href = tag === 'a' && n.attrs.href ? ` href=${jsxAttr(n.attrs.href)}` : '';
      return [`${indent}<${tag}${href}>${jsxText(t)}</${tag}>`];
    }
    const entry = pick(list, target, n);
    // The props the markup records, as JSX.
    /** @type {Map<string, string>} */
    const given = new Map();
    for (const [k, v] of Object.entries(n.attrs)) {
      if (!k.startsWith('data-')) continue;
      const prop = camel(k.slice(5));
      if (NOT_PROPS.has(k.slice(5)) || !entry.props.has(prop)) continue;
      if (v === '' || v === 'true') given.set(prop, prop);
      else if (v === 'false') given.set(prop, `${prop}={false}`);
      else if (/^-?\d+(\.\d+)?$/.test(v)) given.set(prop, `${prop}={${v}}`);
      else given.set(prop, `${prop}=${jsxAttr(v)}`);
    }
    for (const a of ['href', 'role']) {
      if (n.attrs[a] && entry.props.has(a)) given.set(a, `${a}=${jsxAttr(n.attrs[a])}`);
    }
    const t = textOf(n).replace(/\s+/g, ' ').trim();
    // A component that draws a form control takes its text as a label, never
    // as children (they would land on the control itself).
    const formControl = hasTag(n, FORM_TAGS);
    // Astryx parts inside a form control are its own drawing, not content:
    // it is rebuilt as a leaf.
    const nested = n.children.some(hasAstryx) && !formControl;
    const textProp =
      !nested && t && entry.label && (formControl || !entry.props.has('children')) ? 'label' : null;
    // Required props the markup does not record get a stand-in when their
    // type allows one; a component needing data it cannot hold (items,
    // options) is not rebuilt, and its content is kept as plain text.
    let lacking = false;
    for (const [r, type] of entry.required) {
      if (r === 'children' || r === textProp || given.has(r)) continue;
      const fill = standIn(r, type, n, t);
      if (fill == null) {
        lacking = true;
        break;
      }
      given.set(r, fill);
    }
    if (lacking) {
      degraded.add(entry.name);
      return plain(n, indent);
    }
    elements++;
    const mod = imports.get(entry.module) ?? new Set();
    mod.add(entry.name);
    imports.set(entry.module, mod);
    const props = [...given.values()];
    const open = `${indent}<${entry.name}${props.length ? ` ${props.join(' ')}` : ''}`;
    if (nested) {
      const inner = n.children.flatMap(c => emit(c, `${indent}  `));
      return inner.length ? [`${open}>`, ...inner, `${indent}</${entry.name}>`] : [`${open} />`];
    }
    if (!t || VOID.has(n.tag) || (formControl && !textProp)) return [`${open} />`];
    if (textProp) {
      return [`${open.replace(`<${entry.name}`, `<${entry.name} label=${jsxAttr(t)}`)} />`];
    }
    return [`${open}>${jsxText(t)}</${entry.name}>`];
  };

  const lines = body.children.flatMap(c => emit(c, '    '));
  const importLines = [...imports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mod, names]) => `import {${[...names].sort().join(', ')}} from '${mod}';`);
  const title = decode(textOf(find(doc, 'title') ?? {text: ''})).trim();
  const source = [
    `// Rebuilt by astryx experimental render --reverse from rendered markup${title ? `: ${oneLine(title)}` : ''}.`,
    '// Text and layout come from the markup; styling, state and behavior do not,',
    '// so review it before use.',
    '',
    ...importLines,
    '',
    'export default function Page() {',
    '  return (',
    '    <>',
    ...lines.map(l => `  ${l}`),
    '    </>',
    '  );',
    '}',
    '',
  ].join('\n');
  return {
    source,
    components: [...imports.values()].flatMap(s => [...s]).sort(),
    elements,
    unknown: [...unknown].sort(),
    omitted: [...omitted, ...degraded].sort(),
  };
}
