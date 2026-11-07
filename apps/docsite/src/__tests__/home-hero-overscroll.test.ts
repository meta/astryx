// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-hero-overscroll.test.ts
 * @input globals.css, the home hero sources and core's AppShell/LayoutContent,
 *   read as text
 * @output Invariants that keep native overscroll alive on every docsite route
 * @position Regression guard for #5392 / #5470 (the hero's pin containment)
 *
 * `overscroll-behavior-y: none` on the root element is how you turn off
 * pull-to-refresh (mobile) and the trackpad rubber-band (macOS). The docsite
 * carried it app-wide (#3032), then desktop-only (#5415), to hide the home
 * hero's `position: fixed` layers from the strip an overscroll opens past the
 * end of the page. The layers are bounded now, so the rule is gone (#5470).
 *
 * The docsite suite is node-only with StyleX untransformed, so these are
 * source invariants (the idiom of component-preview-theme.test.ts): read the
 * files as text and assert on the declarations that would let the bleed —
 * and therefore the rule — come back.
 *
 * Run: pnpm -F @astryxdesign/docsite test src/__tests__/home-hero-overscroll.test.ts
 */

import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', 'app');
const SITE = path.join(APP, '(site)');
const HERO = path.join(SITE, '_landing', 'hero');
const CORE = path.join(HERE, '..', '..', '..', '..', 'packages', 'core', 'src');

function read(file: string): string {
  const source = fs.readFileSync(file, 'utf8');
  // Anti-vacuity: a moved or emptied file must fail loudly, not pass silently.
  expect(source.length, `${file} is empty`).toBeGreaterThan(200);
  return source;
}

/** Drop comments so prose about `fixed` or `none` can't match. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([,;{}])\s*\/\/.*$/gm, '$1');
}

/** The brace-balanced `{...}` starting at `open` (which must be a `{`). */
function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}' && --depth === 0) {
      return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces at ${open}`);
}

/** The `{...}` body of one top-level `stylex.create` entry, e.g. `backdropGlow`. */
function styleBlock(source: string, name: string): string {
  const match = new RegExp(`^  ${name}: \\{`, 'm').exec(source);
  expect(match, `no \`${name}\` style entry in the source`).not.toBeNull();
  return balanced(source, match!.index + match![0].length - 1);
}

/**
 * The raw text of one property's value inside a style block: the scalar up to
 * its trailing comma, or the whole brace-balanced conditional object. Asserting
 * on this text is independent of key syntax (`default`, a quoted media query,
 * or a computed `[BREAKPOINT]` key) and of line layout.
 */
function valueText(block: string, property: string): string {
  const match = new RegExp(`\\n\\s*${property}: `).exec(block);
  expect(match, `no \`${property}\` declaration in the block`).not.toBeNull();
  const start = match!.index + match![0].length;
  if (block[start] === '{') {
    return balanced(block, start);
  }
  const end = block.indexOf('\n', start);
  return block.slice(start, end).replace(/,\s*$/, '').trim();
}

/**
 * Every value a property takes — the scalar, or each arm of its conditional
 * object — unquoted. Parsing is strict: an arm this helper cannot read fails
 * the test rather than vanishing from the result.
 */
function allValues(block: string, property: string): string[] {
  const text = valueText(block, property);
  const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!text.startsWith('{')) {
    return [unquote(text)];
  }
  const inner = text.slice(1, -1);
  // One arm per line as prettier writes them, or top-level commas when the
  // whole object fits on one line.
  const arms = (
    inner.includes('\n')
      ? inner.split('\n')
      : inner.split(/,\s*(?=default\b|['"[])/)
  )
    .map(l => l.trim().replace(/,$/, ''))
    .filter(l => l.length > 0);
  expect(arms.length, `no arms in \`${property}\``).toBeGreaterThan(0);
  return arms.map(arm => {
    const parsed = /^(?:default|'[^']*'|"[^"]*"|\[[^\]]+\])\s*:\s*(.+)$/.exec(
      arm,
    );
    expect(parsed, `unreadable arm in \`${property}\`: ${arm}`).not.toBeNull();
    return unquote(parsed![1]);
  });
}

/**
 * The open `{` preludes (at-rules and selectors, outermost first) enclosing
 * `index`. Enough of a CSS parser for a source invariant: the input is
 * comment-stripped and holds no braces inside strings.
 */
function enclosingPreludes(css: string, index: number): string[] {
  const stack: string[] = [];
  let prelude = '';
  for (let i = 0; i < index; i++) {
    const char = css[i];
    if (char === '{') {
      stack.push(prelude.trim());
      prelude = '';
    } else if (char === '}') {
      stack.pop();
      prelude = '';
    } else if (char === ';') {
      prelude = '';
    } else {
      prelude += char;
    }
  }
  return stack;
}

/**
 * Split `text` at the runs of `separator` characters that sit outside
 * parentheses, brackets and quoted strings, keeping each run between the
 * parts it separates: `[part, run, part, ...]`. So `:is(a, b)`,
 * `[class~='x']` and `[title='a b']` each stay inside one part.
 */
function scanTopLevel(text: string, separator: RegExp): string[] {
  const tokens = [''];
  let depth = 0;
  let quote = '';
  for (const char of text) {
    const topLevel = depth === 0 && quote === '';
    if (quote !== '') {
      quote = char === quote ? '' : quote;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    }
    // Runs sit at odd indexes: start a new token when the kind flips.
    const inRun = tokens.length % 2 === 0;
    if ((topLevel && separator.test(char)) !== inRun) {
      tokens.push('');
    }
    tokens[tokens.length - 1] += char;
  }
  return tokens;
}

/** The non-empty parts of `text` between top-level `separator` characters. */
function splitTopLevel(text: string, separator: RegExp): string[] {
  return scanTopLevel(text, separator).filter(
    (part, index) => index % 2 === 0 && part !== '',
  );
}

/**
 * A compound selector's simple selectors: `html[class~='x']:is(a, b)` is
 * `html`, `[class~='x']` and `:is(a, b)`.
 */
function simpleSelectors(compound: string): string[] {
  const [type, ...rest] = scanTopLevel(compound, /[.#[:]/);
  const simples = type === '' ? [] : [type];
  for (let i = 0; i < rest.length; i += 2) {
    simples.push(rest[i] + (rest[i + 1] ?? ''));
  }
  return simples;
}

/** `:is(...)` or `:where(...)`, capturing the selector list inside. */
const WRAPPER = /^:(?:is|where)\((.*)\)$/i;

/** A complex selector's compounds and combinators, alternating, subject first. */
function chain(selector: string): string[] {
  return scanTopLevel(selector.trim(), /[\s>+~]/).reverse();
}

type TopElement = 'html' | 'head' | 'body';

/**
 * The top of every page: html holds head, then body. Each element lists the
 * simple selectors that name it and where a combinator can walk from it. The
 * tree is that small, so an ancestor is the parent and an earlier sibling is
 * the previous one: ` ` walks like `>`, and `~` like `+`.
 */
const PAGE_TOP: Record<
  TopElement,
  {names: RegExp; parent?: TopElement; previous?: TopElement}
> = {
  html: {names: /^(?:html|:root|\*)$/i},
  head: {names: /^(?:head|\*)$/i, parent: 'html'},
  body: {names: /^(?:body|\*)$/i, parent: 'html', previous: 'head'},
};

/**
 * Whether a complex selector, as `chain` splits it, can match `element`: each
 * compound names the element it lands on (alone, composed as in `html.dark`,
 * or inside `:is()` / `:where()`), walking to the parent at ` ` or `>` and
 * to the previous sibling at `+` or `~`.
 */
function reaches(
  [compound, combinator, ...rest]: string[],
  element: TopElement,
): boolean {
  const named = simpleSelectors(compound).some(simple => {
    const wrapped = WRAPPER.exec(simple);
    return wrapped
      ? splitTopLevel(wrapped[1], /,/).some(arg => reaches(chain(arg), element))
      : PAGE_TOP[element].names.test(simple);
  });
  if (!named || combinator === undefined) {
    return named;
  }
  const next = /[+~]/.test(combinator)
    ? PAGE_TOP[element].previous
    : PAGE_TOP[element].parent;
  return next !== undefined && reaches(rest, next);
}

/**
 * Whether a selector list targets the page itself. `overscroll-behavior`
 * reaches the viewport (pull-to-refresh, the trackpad rubber-band) only from
 * the root element: `html` / `:root`, or `body`, whose value browsers
 * propagate when the root's is `auto`. So a selector is page-wide when any
 * simple selector of its subject names one of them (`html[class~='dark']`,
 * `:is(html, body):hover`), or is a `*` that can land on body: on its own,
 * under the root (`html *`, `:root > *`, `* > *`) or after head (`* + *`,
 * `head ~ *`, `:root > * + *`). `.dialog *` and `.stack > * + *` only reach
 * nested elements, and html has no siblings. `:is()` and `:where()` are
 * looked through; `:not()` and `:has()` only filter, so they are not.
 */
function isPageWide(selectorList: string): boolean {
  return splitTopLevel(selectorList, /,/).some(selector => {
    const compounds = chain(selector);
    return simpleSelectors(compounds[0]).some(simple => {
      const wrapped = WRAPPER.exec(simple);
      if (wrapped) {
        return isPageWide(wrapped[1]);
      }
      if (simple === '*') {
        return reaches(compounds, 'body');
      }
      return /^(?:html|body|:root)$/i.test(simple);
    });
  });
}

/**
 * Every non-`auto` `overscroll-behavior` declaration in `css` whose selector
 * is page-wide, labelled with its enclosing at-rules and selector so a
 * re-scoped rule is still reported. Only declarations count (the property
 * inside an `@supports` prelude is not one). `contain` on a nested scroller
 * only stops that box's scroll from chaining outward, so it is legitimate and
 * not reported.
 */
function pageWideOverscrollSuppressions(css: string): string[] {
  const offenders: string[] = [];
  for (const match of css.matchAll(
    /(?<=[{;]\s*)(overscroll-behavior(?:-x|-y|-block|-inline)?)\s*:\s*([^;{}]+)/gi,
  )) {
    const property = match[1].toLowerCase();
    const value = match[2].trim();
    if (value === 'auto') {
      continue;
    }
    const preludes = enclosingPreludes(css, match.index);
    const atRules = preludes.filter(p => p.startsWith('@'));
    const selectors = preludes.filter(p => !p.startsWith('@'));
    const selector = selectors[selectors.length - 1] ?? '';
    if (!isPageWide(selector)) {
      continue;
    }
    offenders.push(
      `${[...atRules, selector].join(' > ')} { ${property}: ${value} }`,
    );
  }
  return offenders;
}

describe('docsite globals.css never suppresses overscroll (#5392, #5470)', () => {
  it('never sets overscroll-behavior on html, :root, body or * away from auto, at any width', () => {
    const css = stripComments(read(path.join(APP, 'globals.css')));
    expect(pageWideOverscrollSuppressions(css)).toEqual([]);
  });
});

/**
 * The guard's own contract, on fixtures: it must keep catching the root-level
 * rule this change deletes, inside any at-rule, and it must not reject
 * scroll-chaining control on a nested scroller.
 */
describe('the globals.css overscroll guard', () => {
  it('reports a suppression on html inside a media query, naming the at-rule', () => {
    const css = `
@media (min-width: 1024px) {
  html {
    overscroll-behavior-y: none;
  }
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      '@media (min-width: 1024px) > html { overscroll-behavior-y: none }',
    ]);
  });

  it('reports contain on :root and a longhand on body', () => {
    const css = `
:root {
  overscroll-behavior: contain;
}
body {
  overscroll-behavior-x: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      ':root { overscroll-behavior: contain }',
      'body { overscroll-behavior-x: none }',
    ]);
  });

  it('looks through :is() and :where() to the page-wide selector inside', () => {
    const css = `
:is(html, body) {
  overscroll-behavior: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      ':is(html, body) { overscroll-behavior: none }',
    ]);
  });

  it('matches selectors case-insensitively, as CSS does', () => {
    const css = `
HTML {
  OVERSCROLL-BEHAVIOR-Y: NONE;
}
:ROOT {
  overscroll-behavior: contain;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      'HTML { overscroll-behavior-y: NONE }',
      ':ROOT { overscroll-behavior: contain }',
    ]);
  });

  it('is not fooled by the property inside an @supports prelude', () => {
    const css = `
@supports (overscroll-behavior: none) {
  html {
    overscroll-behavior: none;
  }
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      '@supports (overscroll-behavior: none) > html { overscroll-behavior: none }',
    ]);
  });

  it('allows contain on nested scrollers, under html and inside :where() too', () => {
    const css = `
.dialog-body {
  overflow: auto;
  overscroll-behavior: contain;
}
html .sheet {
  overscroll-behavior: contain;
}
:where(.sheet) {
  overscroll-behavior-y: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([]);
  });

  it('allows contain under a trailing * on a nested scope', () => {
    const css = `
.dialog * {
  overscroll-behavior: contain;
}
body .dialog * {
  overscroll-behavior: contain;
}
.sheet > * {
  overscroll-behavior: contain;
}
.dialog * * {
  overscroll-behavior: contain;
}
.stack > * + * {
  overscroll-behavior: contain;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([]);
  });

  it('allows a * after html, which has no siblings', () => {
    const css = `
html ~ * {
  overscroll-behavior: none;
}
html + * {
  overscroll-behavior: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([]);
  });

  it('reports a * that reaches body: on its own, under the root or after head', () => {
    const css = `
* {
  overscroll-behavior: none;
}
*:hover {
  overscroll-behavior: none;
}
html * {
  overscroll-behavior: none;
}
:root > * {
  overscroll-behavior: none;
}
* > * {
  overscroll-behavior: none;
}
* + * {
  overscroll-behavior: none;
}
* ~ * {
  overscroll-behavior: none;
}
head + * {
  overscroll-behavior: none;
}
:root > * + * {
  overscroll-behavior: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      '* { overscroll-behavior: none }',
      '*:hover { overscroll-behavior: none }',
      'html * { overscroll-behavior: none }',
      ':root > * { overscroll-behavior: none }',
      '* > * { overscroll-behavior: none }',
      '* + * { overscroll-behavior: none }',
      '* ~ * { overscroll-behavior: none }',
      'head + * { overscroll-behavior: none }',
      ':root > * + * { overscroll-behavior: none }',
    ]);
  });

  it('reports root selectors composed with class, attribute or pseudo-class parts', () => {
    const css = `
:is(html, body).mode {
  overscroll-behavior-y: none;
}
:is(html, body):hover {
  overscroll-behavior-y: none;
}
:where(html)[data-hero-dark] {
  overscroll-behavior-y: none;
}
[data-x]:where(html) {
  overscroll-behavior-y: none;
}
html[class~='dark'] {
  overscroll-behavior-y: none;
}
body[data-mode='a b'] {
  overscroll-behavior-y: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([
      ':is(html, body).mode { overscroll-behavior-y: none }',
      ':is(html, body):hover { overscroll-behavior-y: none }',
      ':where(html)[data-hero-dark] { overscroll-behavior-y: none }',
      '[data-x]:where(html) { overscroll-behavior-y: none }',
      "html[class~='dark'] { overscroll-behavior-y: none }",
      "body[data-mode='a b'] { overscroll-behavior-y: none }",
    ]);
  });

  it('does not look through :not() or :has(), which only filter', () => {
    const css = `
.sheet:not(html) {
  overscroll-behavior-y: none;
}
.sheet:has(body) {
  overscroll-behavior-y: none;
}
`;
    expect(pageWideOverscrollSuppressions(css)).toEqual([]);
  });
});

/**
 * A `fixed` layer is glued to the viewport and is not part of the document,
 * so when the document rubber-bands past its own edge the layer sits in the
 * exposed gap. A `sticky` layer lifts with the document and cannot paint past
 * its containing block — that is structural, which is what let the root rule
 * be deleted rather than narrowed. None of the hero's pinned layers may go
 * back to `fixed` in any media arm.
 *
 * `navBackdrop` is deliberately not listed: it is a header-height strip at
 * the very top of the viewport and never reaches the bottom gap.
 */
describe('home hero pinned layers are never position: fixed (#5470)', () => {
  const layers: ReadonlyArray<[string, string, string]> = [
    ['hero text block', path.join(SITE, 'page.tsx'), 'heroContent'],
    ['aurora glow', path.join(HERO, 'HeroThemeReel.tsx'), 'backdropGlow'],
    ['floating cards stage', path.join(HERO, 'HeroFloatingCards.tsx'), 'stage'],
  ];

  for (const [label, file, style] of layers) {
    it(`${label} (${style})`, () => {
      const block = styleBlock(stripComments(read(file)), style);
      // Raw text first: catches `fixed` under any key syntax or line layout.
      expect(valueText(block, 'position')).not.toMatch(/['"]fixed['"]/);
      // Then the parsed arms, which must all be readable.
      const positions = allValues(block, 'position');
      expect(positions.length).toBeGreaterThan(0);
      expect(positions).not.toContain('fixed');
    });
  }
});

/**
 * Sticky is bounded by its containing block, so each pinned layer rides in a
 * full-height rail that spans the hero band AND the showcase (a rail inside
 * the 760px band alone releases the hero after 48px of scroll). The rails are
 * absolute against heroScope, and every hero layer ties at z-index 0/auto, so
 * tree order is paint order: the rails must come before the showcase overlay
 * or the showcase stops covering them.
 */
describe('home hero rails are bounded by heroScope and precede the showcase (#5470)', () => {
  const page = () => stripComments(read(path.join(SITE, 'page.tsx')));
  const reel = () => stripComments(read(path.join(HERO, 'HeroThemeReel.tsx')));

  it('heroScope is the positioned ancestor and the rails fill it', () => {
    expect(allValues(styleBlock(page(), 'heroScope'), 'position')).toEqual([
      'relative',
    ]);
    const rail = styleBlock(reel(), 'rail');
    expect(allValues(rail, 'position')).toEqual(['absolute']);
    expect(allValues(rail, 'inset')).toEqual(['0']);
    const contentRail = styleBlock(page(), 'heroContentRail');
    expect(allValues(contentRail, 'position')).toContain('absolute');
    expect(allValues(contentRail, 'inset')).toContain('0');
  });

  it('sizes the pinned boxes against the rail, never the viewport', () => {
    // 100vw includes a classic scrollbar, so it can exceed the rail's width;
    // an over-wide block zeroes its auto margins and shoves the box left.
    expect(
      valueText(styleBlock(reel(), 'backdropGlow'), 'width'),
    ).not.toContain('100vw');
    const cards = stripComments(read(path.join(HERO, 'HeroFloatingCards.tsx')));
    expect(valueText(styleBlock(cards, 'stage'), 'width')).not.toContain(
      '100vw',
    );
  });

  it('renders the backdrop, cards and hero-text rails inside heroScope, before showcaseOverlay', () => {
    const source = page();
    const jsx = source.slice(
      source.indexOf('export default function HomePage'),
    );
    expect(jsx.length).toBeGreaterThan(200);
    const at = (needle: string) => {
      const index = jsx.indexOf(needle);
      expect(index, `\`${needle}\` not rendered by HomePage`).toBeGreaterThan(
        -1,
      );
      return index;
    };
    const scope = at('styles.heroScope');
    const showcase = at('styles.showcaseOverlay');
    const backdrop = at('<HeroReelBackdrop');
    const cards = at('<HeroReelCards');
    const text = at('<HeroContent');
    // Inside heroScope: after its opening tag, before the showcase it also holds.
    expect(scope).toBeLessThan(backdrop);
    expect(backdrop).toBeLessThan(cards);
    expect(cards).toBeLessThan(text);
    expect(text).toBeLessThan(showcase);
    // The showcase is heroScope's last child: no hero piece may render after it.
    expect(jsx.slice(showcase)).not.toMatch(/<Hero/);
  });
});

/**
 * `sticky` also breaks — silently, with no error — if any ancestor becomes a
 * scroll container. AppShell's main area (`#astryx-app-shell-main`, rendered
 * by LayoutContent) is `overflow: clip` in auto-height layouts: clip creates
 * no scroll container, so the hero keeps pinning. LayoutContent switches to
 * `overflow: auto` only through `isScrollable`, which AppShell wires to fill
 * mode, and the landing layout asks for `height="auto"`. Any of those three
 * links flipping would un-pin the entire landing page.
 */
describe('AppShell content area stays a non-scroll container for sticky', () => {
  it('LayoutContent.styles.content uses overflow: clip and no per-axis longhand', () => {
    const source = stripComments(
      read(path.join(CORE, 'Layout', 'LayoutContent.tsx')),
    );
    const content = styleBlock(source, 'content');
    expect(allValues(content, 'overflow')).toEqual(['clip']);
    expect(content).not.toMatch(/\n\s*overflow(?:X|Y|Block|Inline)\s*:/);
    // The scroll container is opt-in, via a separate style.
    expect(allValues(styleBlock(source, 'scrollable'), 'overflow')).toEqual([
      'auto',
    ]);
  });

  it('AppShell only makes the main area scrollable in fill mode', () => {
    const source = stripComments(
      read(path.join(CORE, 'AppShell', 'AppShell.tsx')),
    );
    expect(source).toMatch(/const isFill = height === 'fill'/);
    const main = source.indexOf('id={MAIN_CONTENT_ID}');
    expect(main, 'main LayoutContent not found').toBeGreaterThan(-1);
    const openingTag = source.slice(source.lastIndexOf('<LayoutContent', main));
    expect(openingTag.slice(0, openingTag.indexOf('>'))).toMatch(
      /isScrollable=\{isFill\}/,
    );
  });

  it('the landing layout renders AppShell in auto height', () => {
    const source = stripComments(read(path.join(SITE, 'layout.tsx')));
    expect(source).toMatch(/<AppShell[^>]*\sheight="auto"/);
  });
});
