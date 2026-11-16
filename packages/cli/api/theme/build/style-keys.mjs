// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The keys in a theme's part blocks that Core cannot build as written:
 * a pseudo key that is no single selector, and a custom property whose name
 * Core renames.
 *
 * @input  a theme as the build holds it (raw defineTheme input or a resolved
 *         theme)
 * @output why a pseudo key or a part custom property cannot be built as
 *         written, and every such key in a theme, with its key path
 * @position Sits beside build.mjs and null-values.mjs (api/theme/build/).
 *           Core writes a pseudo key as selector text after the part's
 *           selector, and a part's property names in kebab case. A broken
 *           key makes the browser drop other rules or style other
 *           elements. The build warns each at its line, so a theme that
 *           built before still builds the same; the editor's judge refuses
 *           the same keys with the same reasons.
 */

import {
  cssTree,
  keptCssTreeAnswer,
  mdnCssSelectors,
} from '../../../foundation/runtime/css-tree.mjs';
import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';

/**
 * A block of keys: a plain object. An array, a Date or a boxed primitive is
 * a value, which the value judge names.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isBlock = value =>
  value !== null &&
  typeof value === 'object' &&
  Object.prototype.toString.call(value) === '[object Object]';

/** The closer each opener in a selector waits for. */
const CLOSERS = /** @type {Record<string, string>} */ ({
  '(': ')',
  '[': ']',
  '{': '}',
});

/**
 * Why a pseudo key in a part's style block (`':hover'`,
 * `':nth-child(2n)'`) cannot be built, or null. The build writes the key as
 * it is after the part's selector, so the key must read as one selector
 * there. A parenthesis, bracket, quote or comment left open makes the
 * browser read on through the rules after it, and it drops them all. A
 * selector list puts the part's selector before its first member only, so
 * each later member styles every element it matches in the app.
 * @param {string} key
 * @returns {string | null}
 */
export function pseudoKeyProblem(key) {
  const t = cssTree();
  const T = t.tokenTypes;
  /** @type {string[]} */
  const open = [];
  /** @type {string | null} */
  let unclosed = null;
  /** @type {number[]} */
  const commas = [];
  t.tokenize(
    key,
    (
      /** @type {number} */ type,
      /** @type {number} */ start,
      /** @type {number} */ end,
    ) => {
      const text = key.slice(start, end);
      if (type === T.Function || type === T.LeftParenthesis) open.push('(');
      else if (type === T.LeftSquareBracket) open.push('[');
      else if (type === T.LeftCurlyBracket) open.push('{');
      else if (
        (type === T.RightParenthesis ||
          type === T.RightSquareBracket ||
          type === T.RightCurlyBracket) &&
        open.length > 0 &&
        CLOSERS[/** @type {string} */ (open.at(-1))] === text
      )
        open.pop();
      else if (type === T.Comma && open.length === 0) commas.push(start);
      else if (
        (type === T.String && (text.length < 2 || text.at(-1) !== text[0])) ||
        type === T.BadString
      )
        unclosed ??= 'a quote';
      else if (type === T.Comment && !/^\/\*[^]*\*\/$/.test(text))
        unclosed ??= 'a comment';
    },
  );
  const drops = `the build writes a selector the browser reads on through the rules after it, and it drops them all`;
  if (unclosed) return `${key} leaves ${unclosed} open, so ${drops}`;
  if (open.length > 0) {
    const closed =
      key +
      open
        .map(o => CLOSERS[o])
        .reverse()
        .join('');
    const what = open.at(-1) === '(' ? 'a parenthesis' : 'a bracket';
    return `${key} leaves ${what} open, so ${drops}${pseudoKeyProblem(closed) ? '' : `; did you mean '${closed}'?`}`;
  }
  /** @type {any} */
  let ast;
  try {
    ast = t.parse(`.p${key}`, {context: 'selectorList', positions: true});
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return `${key} is no selector a browser reads (${reason.replace(/\.$/, '')}), so the build writes a rule the browser drops`;
  }
  if (commas.length === 0) return compoundProblem(key, ast);
  const members = [-1, ...commas]
    .map((at, i) => key.slice(at + 1, commas[i] ?? key.length).trim())
    .filter(Boolean);
  if (members.length < 2)
    return `${key} holds an empty selector, so the browser drops the rule${members[0] ? `: write '${members[0]}'` : ''}`;
  return `${key} is a selector list, and the build puts the part's selector before its first member only, so ${members.slice(1).join(', ')} would style every element ${members.length > 2 ? 'they match' : 'it matches'} in the app: give each its own key, ${members.map(m => `'${m}': {…}`).join(', ')}`;
}

/**
 * The text of a selector node in a pseudo key, read off the key (parsed
 * after a two-letter class).
 * @param {string} key @param {any} node
 */
const textOf = (key, node) =>
  key.slice(node.loc.start.offset - 2, node.loc.end.offset - 2);

/**
 * What may follow a pseudo-element in its compound selector, as CSS
 * Pseudo-Elements 4 defines it, for the pseudo-elements that take anything:
 * an element-backed one stands for a real element, so any pseudo-class and a
 * further pseudo-element may follow it; ::selection takes :window-inactive
 * (browsers take it after no other highlight); ::search-text takes
 * :current; a scroll marker takes :target-current. Any other pseudo-element ends its
 * selector (a vendor one, or one that takes arguments such as `::part()`, is
 * left to the browser).
 * @type {Record<string, {classes: true | string[], elements: boolean}>}
 */
const AFTER_PSEUDO_ELEMENT = {
  'file-selector-button': {classes: true, elements: true},
  'details-content': {classes: true, elements: true},
  selection: {classes: ['window-inactive'], elements: false},
  'search-text': {classes: ['current'], elements: false},
  'scroll-marker': {classes: ['target-current'], elements: false},
  'scroll-marker-group': {classes: true, elements: false},
};

/**
 * What may follow a functional pseudo-element, by name: a custom highlight
 * (`::highlight(x)`) takes no pseudo-class. Any other functional one
 * (`::part()`, `::slotted()`) is left to the browser.
 * @type {Record<string, {classes: true | string[], elements: boolean}>}
 */
const AFTER_FUNCTIONAL_PSEUDO_ELEMENT = {
  highlight: {classes: [], elements: false},
};

/** @type {Set<string> | null} */
let knownElements = null;
/**
 * The pseudo-element names browsers know, lower case: MDN's selector data,
 * and the ones this file's tables name (browsers ship some before the data
 * lists them).
 */
const knownPseudoElements = () =>
  (knownElements ??= new Set([
    ...Object.keys(mdnCssSelectors())
      .filter(k => k.startsWith('::'))
      .map(k => k.slice(2).replace(/\(\)$/, '')),
    ...Object.keys(AFTER_PSEUDO_ELEMENT),
    ...Object.keys(AFTER_FUNCTIONAL_PSEUDO_ELEMENT),
  ]));

/** @type {Set<string> | null} */
let knownClasses = null;
/** The pseudo-class names MDN's selector data lists, lower case. */
const knownPseudoClasses = () =>
  (knownClasses ??= new Set(
    Object.keys(mdnCssSelectors())
      .filter(k => k.startsWith(':') && !k.startsWith('::'))
      .map(k => k.slice(1).replace(/\(\)$/, '')),
  ));

/**
 * The known pseudo-class one or two edits from a name it is not, or null.
 * @param {string} name
 */
const nearPseudoClass = name =>
  knownPseudoClasses().has(name.toLowerCase())
    ? null
    : ([...knownPseudoClasses()].find(
        known =>
          levenshteinDistance(known, name.toLowerCase(), 2, {swaps: true}) <=
          (name.length > 5 ? 2 : 1),
      ) ?? null);

/**
 * The known pseudo-element one or two edits from a name, or null.
 * @param {string} name
 */
const nearPseudoElement = name =>
  [...knownPseudoElements()].find(
    known =>
      levenshteinDistance(known, name.toLowerCase(), 2, {swaps: true}) <=
      (name.length > 5 ? 2 : 1),
  ) ?? null;

/**
 * Notes on a pseudo key the build writes but cannot judge: a pseudo-element
 * missing from the CLI's selector data and near no known one. Browser
 * support moves faster than the data, so it is noted, never refused.
 * @param {string} key
 * @returns {string[]}
 */
export function pseudoKeyNotes(key) {
  /** @type {any} */
  let ast;
  try {
    ast = cssTree().parse(`.p${key}`, {context: 'selectorList'});
  } catch {
    return [];
  }
  /** @type {string[]} */
  const notes = [];
  cssTree().walk(ast, (/** @type {any} */ node) => {
    if (
      node.type === 'PseudoElementSelector' &&
      !node.name.startsWith('-') &&
      !node.name.includes('\\') &&
      !knownPseudoElements().has(node.name.toLowerCase()) &&
      !nearPseudoElement(node.name)
    )
      notes.push(
        `${key} names ::${node.name}, which is not in the CLI's selector data: it may be newer than this CLI, or a typo; the build writes it as it is`,
      );
  });
  return notes;
}

/** The pseudo-classes whose argument is a selector list. */
const SELECTOR_LIST_PSEUDO_CLASSES = ['is', 'where', 'not', 'has'];

/**
 * What may follow a pseudo-element node.
 * @param {any} element
 * @returns {{classes: true | string[], elements: boolean}}
 */
const afterPseudoElement = element =>
  element.name.startsWith('-') ||
  !knownPseudoElements().has(element.name.toLowerCase())
    ? {classes: true, elements: true}
    : element.children
      ? (AFTER_FUNCTIONAL_PSEUDO_ELEMENT[element.name.toLowerCase()] ?? {
          classes: true,
          elements: true,
        })
      : (AFTER_PSEUDO_ELEMENT[element.name.toLowerCase()] ?? {
          classes: [],
          elements: false,
        });

/**
 * The pseudo-classes Core reads by name, as written: it adds its disabled
 * guard to `:hover`, and replaces `:active` with its press model.
 */
const CORE_READ_PSEUDO_CLASSES = ['hover', 'active'];

/**
 * Why a pseudo key that parses as one selector still builds a rule the
 * browser drops or Core misreads, or null: a pseudo name with an escape (a
 * name no browser knows), something after a pseudo-element that it does not
 * take, or a pseudo-class Core reads by name written in capitals (a browser
 * reads it either way, but Core does not).
 * @param {string} key
 * @param {any} ast the key parsed after `.p`, with positions
 * @returns {string | null}
 */
function compoundProblem(key, ast) {
  const t = cssTree();
  /** @type {string | null} */
  let why = null;
  /** @type {any[]} */
  const capitals = [];
  t.walk(ast, (/** @type {any} */ node) => {
    if (
      node.type !== 'PseudoClassSelector' &&
      node.type !== 'PseudoElementSelector'
    )
      return;
    const colons = node.type === 'PseudoElementSelector' ? '::' : ':';
    // A pseudo-element missing from the selector data is a typo when it is
    // near a known one; one near none may be newer than the data, so it is
    // only noted (`pseudoKeyNotes`).
    if (
      node.type === 'PseudoElementSelector' &&
      !node.name.startsWith('-') &&
      !node.name.includes('\\') &&
      !knownPseudoElements().has(node.name.toLowerCase()) &&
      nearPseudoElement(node.name)
    )
      why ??= `${key} names ::${node.name}, a pseudo-element no browser knows, so the browser drops the rule; did you mean ::${nearPseudoElement(node.name)}?`;
    else if (
      node.type === 'PseudoClassSelector' &&
      !node.name.startsWith('-') &&
      !node.name.includes('\\') &&
      nearPseudoClass(node.name)
    )
      why ??= `${key} names :${node.name}, a pseudo-class no browser knows, so the browser drops the rule; did you mean :${nearPseudoClass(node.name)}?`;
    else if (node.name.includes('\\'))
      why ??= `${key} escapes a character in ${colons}${node.name}, so the browser reads a pseudo name "${node.name.replace(/\\(.)/g, '$1')}" it does not know and drops the rule`;
    else if (
      node.type === 'PseudoClassSelector' &&
      node.name !== node.name.toLowerCase() &&
      CORE_READ_PSEUDO_CLASSES.includes(node.name.toLowerCase())
    )
      capitals.push(node);
  });
  if (why) return why;
  // A pseudo-element in a selector-list argument (`:is(::before)`) matches
  // no element: :is() and :where() then match nothing, and the browser drops
  // a rule with one in :not() or :has().
  t.walk(ast, (/** @type {any} */ node) => {
    if (
      why ||
      node.type !== 'PseudoClassSelector' ||
      !SELECTOR_LIST_PSEUDO_CLASSES.includes(node.name.toLowerCase()) ||
      !node.children
    )
      return;
    t.walk(node, (/** @type {any} */ inner) => {
      if (!why && inner.type === 'PseudoElementSelector')
        why = `${key} puts ${textOf(key, inner)} inside :${node.name}(), and a pseudo-element matches no element there, so the rule never applies${['is', 'where'].includes(node.name.toLowerCase()) ? '' : ' (the browser drops it)'}: write the pseudo-element on its own, after the part`;
    });
  });
  if (why) return why;
  t.walk(ast, {
    visit: 'Selector',
    enter(/** @type {any} */ selector) {
      /** @type {any} */
      let element = null;
      /** @type {any[]} */
      const classes = [];
      selector.children.forEach((/** @type {any} */ node) => {
        if (why) return;
        if (node.type === 'Combinator') {
          element = null;
          return;
        }
        const takes = element ? afterPseudoElement(element) : null;
        if (node.type === 'PseudoElementSelector') {
          if (takes && !takes.elements)
            why = `${key} holds two pseudo-elements (${textOf(key, element)}, ${textOf(key, node)}), and ${textOf(key, element)} takes none after it, so the browser drops the rule: give each its own key`;
          element = node;
        } else if (node.type === 'PseudoClassSelector') {
          if (
            takes &&
            takes.classes !== true &&
            !takes.classes.includes(node.name.toLowerCase())
          ) {
            const last = selector.children.last;
            const single =
              selector.children
                .toArray()
                .every((/** @type {any} */ x) => x.type !== 'Combinator') &&
              last === node;
            classes.push(node);
            const moved = single
              ? `${key.slice(0, element.loc.start.offset - 2)}${classes.map(c => textOf(key, c)).join('')}${textOf(key, element)}`
              : null;
            why = `${key} puts ${textOf(key, node)} after ${textOf(key, element)}, which takes ${takes.classes.length ? `only ${takes.classes.map(c => `:${c}`).join(', ')}` : 'no pseudo-class'} after it, so the browser drops the rule${moved && !pseudoKeyProblem(moved) ? `; to style it while the part is ${textOf(key, node)}, write '${moved}'` : ''}`;
          }
        }
      });
    },
  });
  if (why) return why;
  if (capitals.length === 0) return null;
  let fixed = key;
  for (const node of [...capitals].reverse()) {
    const at =
      node.loc.start.offset -
      2 +
      (node.type === 'PseudoElementSelector' ? 2 : 1);
    fixed =
      fixed.slice(0, at) +
      fixed.slice(at, at + node.name.length).toLowerCase() +
      fixed.slice(at + node.name.length);
  }
  return `${key} writes ${capitals.map(n => `:${n.name}`).join(', ')} in capitals, which a browser reads either way, but Core reads :hover and :active by their lower-case names (a disabled part's hover guard, the press model): write '${fixed}'`;
}

/**
 * Why a property name in a part's block builds a declaration no browser
 * reads, or null: a vendor prefix written without its leading dash
 * (`msOverflowStyle`, `webkit-transform`), which the build writes as it is
 * in kebab case.
 * @param {string} name a key that is no custom property and no block
 * @returns {string | null}
 */
export function partPropertyNameProblem(name) {
  const built = name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  if (/^(webkit|moz|ms|o)-/.test(built))
    return `${name} builds ${built}, with no leading dash, a property no browser reads: a vendor prefix starts with a dash, so write '-${built}'`;
  // A name that builds dash-first is a vendor property only with a vendor
  // prefix and a name after it (`-webkit-transform`, `WebkitTransform`);
  // any other (`Color`, `BACKGROUND`, `-webkit-`) is no property.
  if (built.startsWith('-') && !/^-(webkit|moz|ms|o|khtml)-[a-z]/.test(built)) {
    const meant = /[a-z]/.test(name)
      ? name.charAt(0).toLowerCase() + name.slice(1)
      : name.toLowerCase();
    return `${name} builds ${built}, a property no browser reads: a property name starts with a lower-case letter${/^[A-Za-z]/.test(name) ? `, such as ${meant}` : ''}`;
  }
  return null;
}

/** The color-mode blocks a style key's block nests. */
const MODE_KEYS = ['@light', '@dark'];

/**
 * @typedef {'style' | 'mode' | 'pseudo'} PartBlock the block a key is in: a
 *   style key's own (`base`), a color-mode block in it (`@dark`), or a
 *   pseudo key's (`':hover'`)
 */

/**
 * The kind of block a key that holds one opens, inside a block of `kind`.
 * @param {string} key @param {PartBlock} kind
 * @returns {PartBlock}
 */
export const innerBlock = (key, kind) =>
  kind === 'style' && MODE_KEYS.includes(key) ? 'mode' : 'pseudo';

/**
 * Why a key in a part's style block cannot be built as written, or null:
 * an empty key, a custom property, a pseudo key holding a block, a block
 * under a key that nests none, or a property name. A style key's block
 * nests pseudo keys and @light / @dark, a color-mode block nests pseudo
 * keys, and a pseudo key's block holds properties only; the build writes
 * any other block as a declaration, which the browser drops.
 * @param {string} key
 * @param {unknown} value
 * @param {PartBlock} kind the block the key is in
 * @returns {string | null}
 */
export function partKeyProblem(key, value, kind) {
  return keyProblem(key, value, kind, pseudoKeyProblem);
}

/**
 * {@link partKeyProblem}, with a pseudo key's problem from `pseudoProblem`.
 * @param {string} key
 * @param {unknown} value
 * @param {PartBlock} kind
 * @param {(key: string) => string | null} pseudoProblem
 * @returns {string | null}
 */
function keyProblem(key, value, kind, pseudoProblem) {
  if (value === undefined) return null;
  if (key.trim() === '')
    return `an empty key holds ${isBlock(value) ? 'a block' : 'a value'}, which the build writes as a declaration with no property, and the browser drops it: name the property or the pseudo key`;
  if (key.startsWith('--')) return partCustomPropertyProblem(key);
  if (isBlock(value)) {
    if (key.startsWith(':') && kind !== 'pseudo') return pseudoProblem(key);
    if (kind === 'style' && MODE_KEYS.includes(key)) return null;
    return `${key} holds a block, but ${kind === 'pseudo' ? 'a pseudo key holds properties only' : `only a pseudo key (':hover', '::before')${kind === 'style' ? ' or @light / @dark' : ''} holds one here`}, so the build writes it as a declaration the browser drops`;
  }
  if (key.startsWith(':') || key.startsWith('@')) return null;
  return partPropertyNameProblem(key);
}

/**
 * Why a custom property a part's block sets cannot be built as written, or
 * null. The build writes a part's property names in kebab case, and custom
 * properties are case-sensitive, so a name with capitals would be set under
 * another name than var() reads.
 * @param {string} name a key that starts with --
 * @returns {string | null}
 */
export function partCustomPropertyProblem(name) {
  if (name === '--')
    return `-- is no custom property name (CSS keeps it for itself), so the browser drops the declaration: give the property a name after the dashes, such as --my-value`;
  if (!/[A-Z]/.test(name)) return null;
  const built = name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  const lower = /[a-z][A-Z]/.test(name) ? built : name.toLowerCase();
  return `${name} has capitals, and the build writes a part's property names in kebab case, so it would set ${built} while var(${name}) reads ${name} (custom properties are case-sensitive): name it in lower case, such as ${lower}, wherever the theme sets or reads it`;
}

/**
 * @typedef {{path: string[], why: string}} StyleKeyProblem
 */

/**
 * What {@link pseudoKeyProblem} and {@link pseudoKeyNotes} give each key in
 * `keys`. They read nothing but the key, css-tree and the MDN data it ships,
 * so their answers are kept between runs (keptCssTreeAnswer).
 * @param {string[]} keys sorted, each once
 * @returns {Map<string, {problem: string | null, notes: string[]}>}
 */
function pseudoKeyChecks(keys) {
  if (keys.length === 0) return new Map();
  /** @type {Array<[string, string | null, string[]]>} */
  const answers = keptCssTreeAnswer('theme-pseudo-key-checks', keys, keys =>
    keys.map(key => {
      const problem = pseudoKeyProblem(key);
      return [key, problem, problem === null ? pseudoKeyNotes(key) : []];
    }),
  );
  return new Map(
    answers.map(([key, problem, notes]) => [key, {problem, notes}]),
  );
}

/**
 * Every key in a part's style blocks that Core cannot build as written, on
 * the page, its surfaces (onDark, onLight) and the adaptation rules' values.
 * @param {Record<string, any>} theme
 * @returns {StyleKeyProblem[]}
 */
export function styleKeyProblems(theme) {
  /** @type {Array<{surface: any, at: string[]}>} */
  const surfaces = [
    {surface: theme, at: []},
    {surface: theme.onDark ?? theme.__onDark, at: ['onDark']},
    {surface: theme.onLight ?? theme.__onLight, at: ['onLight']},
  ];
  const rules = theme.adaptations?.rules ?? theme.__adaptations?.rules;
  if (Array.isArray(rules))
    rules.forEach((rule, i) =>
      surfaces.push({
        surface: rule?.value,
        at: ['adaptations', 'rules', String(i), 'value'],
      }),
    );
  /**
   * Each part's style block, with where it is.
   * @param {(rules: any, at: string[]) => void} visit
   */
  const eachStyle = visit => {
    for (const {surface, at} of surfaces) {
      if (!isBlock(surface) || !isBlock(surface.components)) continue;
      for (const [name, styles] of Object.entries(surface.components))
        if (isBlock(styles))
          for (const [key, rules] of Object.entries(styles))
            visit(rules, [...at, 'components', name, key]);
    }
  };

  // Every pseudo key the checks below can ask about: each one at any depth
  // of a block, whatever the keys around it give.
  /** @type {Set<string>} */
  const pseudoKeys = new Set();
  /** @param {any} node @param {PartBlock} kind @param {number} depth */
  const collect = (node, kind, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith(':') && isBlock(v) && kind !== 'pseudo')
        pseudoKeys.add(k);
      collect(v, innerBlock(k, kind), depth + 1);
    }
  };
  eachStyle(rules => collect(rules, 'style', 0));
  const checks = pseudoKeyChecks([...pseudoKeys].sort());
  const checked = (/** @type {string} */ key) =>
    /** @type {{problem: string | null, notes: string[]}} */ (checks.get(key));

  /** @type {StyleKeyProblem[]} */
  const out = [];
  /** @param {any} node @param {string[]} at @param {PartBlock} kind @param {number} depth */
  const block = (node, at, kind, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      const why = keyProblem(k, v, kind, key => checked(key).problem);
      if (why) {
        out.push({path: [...at, k], why});
        continue;
      }
      if (k.startsWith(':') && isBlock(v))
        for (const note of checked(k).notes)
          out.push({path: [...at, k], why: note});
      block(v, [...at, k], innerBlock(k, kind), depth + 1);
    }
  };
  eachStyle((rules, at) => block(rules, at, 'style', 0));
  return out;
}
