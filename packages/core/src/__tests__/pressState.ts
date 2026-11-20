// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressState.ts
 * @input Uses document.styleSheets (populated by StyleX runtime injection) and
 *   the press machine's release clock (utils/pressGesture.ts)
 * @output Exports rulesDeclaredFor, rulesWithSelector, hasPressedArm,
 *   declaresPressedOverlay, readsPressStrength, afterPaintsPress,
 *   pressArmsShadowedByDefault, hasReleaseFade and releasesOnLayer test
 *   helpers
 * @position Shared test helper for asserting a control paints a pressed state
 *
 * jsdom does not compute `:active` (there is no real pointer), so a component
 * test asserts the next-best thing: that the StyleX dev runtime injected a
 * rule, keyed to the element's own classes, that paints the design system's
 * pressed overlay token while the control is pressed. The selector shape is
 * deliberately not pinned — a press may be read off the element itself
 * (`.x:active`) or off an ancestor scope marker (`.x:where(.marker:active *)`).
 *
 * The touch arms are asserted the same way: the paint reads the press's
 * strength (`--astryx-press-alpha`, see utils/interactionOverlay.stylex.ts)
 * and the element the controller writes to runs the release animation on the
 * machine's own clock; a list row's compositor layer (privateAttributes/press.stylex.ts)
 * runs its own release on the row's `::before`, which these checks leave out.
 *
 * SYNC: When modified, update this header.
 */

import {durationDefaults} from '../theme/tokens.stylex';
import {PRESS_FADE_MS} from '../utils/pressGesture';

const PRESSED_TOKEN = '--color-overlay-pressed';
const PRESS_STRENGTH = '--astryx-press-alpha';
/** The press's paint at its strength, declared once by the shared styles. */
const PRESS_PAINT = '--_press-paint';
const FADING_ARM = '[data-astryx-press="fading"]';
const ON_ARM = '[data-astryx-press="on"]';

const selectorOf = (rule: string) => rule.slice(0, rule.indexOf('{'));
const onPseudoElement = (rule: string) => selectorOf(rule).includes('::');
const durationsOf = (rules: string[]) =>
  rules.flatMap(rule => {
    const match = rule.match(/animation-duration:\s*([^;}]+)/);
    return match == null ? [] : [durationToMs(match[1])];
  });
const runsAnimation = (rule: string) => /animation-name:\s*(?!none)/.test(rule);
const stopsAnimation = (rule: string) => /animation-name:\s*none\b/.test(rule);

function walk(
  list: CSSRuleList,
  visit: (rule: CSSRule, conditions: string) => void,
  conditions = '',
): void {
  for (const rule of Array.from(list)) {
    visit(rule, conditions);
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested != null) {
      const media = (rule as CSSMediaRule).media?.mediaText ?? '';
      walk(nested, visit, `${conditions} ${media}`);
    }
  }
}

interface RuleFilter {
  /** Skip rules inside an `@media` whose condition matches. */
  outsideMedia?: RegExp;
  /** Keep only rules inside an `@media` whose condition matches. */
  insideMedia?: RegExp;
}

/** A coarse primary pointer's `@media` condition. */
const COARSE_MEDIA = /\(pointer: coarse\)/;
/** A Reduce Motion `@media` condition. */
const REDUCED_MEDIA = /prefers-reduced-motion/;
/** Rules for a coarse primary pointer, Reduce Motion's arms left out. */
const UNDER_COARSE: RuleFilter = {
  insideMedia: COARSE_MEDIA,
  outsideMedia: REDUCED_MEDIA,
};
/** Rules for any other primary pointer, Reduce Motion's arms left out. */
const UNDER_FINE: RuleFilter = {
  outsideMedia: /prefers-reduced-motion|\(pointer: coarse\)/,
};

/**
 * Every injected style rule (rules nested in `@media` included) whose selector
 * names one of the element's classes, as `selector {declarations}` text.
 */
export function rulesDeclaredFor(
  el: Element,
  filter: RuleFilter = {},
): string[] {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    walk(rules, (rule, conditions) => {
      if (!(rule instanceof CSSStyleRule)) {
        return;
      }
      if (filter.outsideMedia?.test(conditions) === true) {
        return;
      }
      if (filter.insideMedia != null && !filter.insideMedia.test(conditions)) {
        return;
      }
      const selector = rule.selectorText;
      if (classes.some(cls => selector.startsWith(cls))) {
        out.push(`${selector} {${rule.style.cssText}}`);
      }
    });
  }
  return out;
}

/** The rules on `el` whose selector matches `pseudo` (e.g. `:active`). */
export function rulesWithSelector(
  el: Element,
  pseudo: string,
  filter: RuleFilter = {},
): string[] {
  return rulesDeclaredFor(el, filter).filter(rule => {
    const selector = rule.slice(0, rule.indexOf('{'));
    return selector.includes(pseudo);
  });
}

/**
 * Does one of the element's own rules paint the pressed overlay token while
 * `pseudo` matches? `pseudo` defaults to `:active`, the arm a mouse press
 * takes.
 */
export function hasPressedArm(el: Element, pseudo = ':active'): boolean {
  return rulesWithSelector(el, pseudo).some(rule =>
    rule.includes(PRESSED_TOKEN),
  );
}

/**
 * Does one of the element's own classes paint the pressed overlay token
 * unconditionally — no pseudo-class, no ancestor scope — because the component
 * applies the class while it holds the press itself (a dragged slider thumb)?
 * StyleX's specificity padding (`:not(#\#)`) is not a condition.
 */
export function declaresPressedOverlay(el: Element): boolean {
  return rulesDeclaredFor(el).some(rule => {
    const selector = rule
      .slice(0, rule.indexOf('{'))
      .replaceAll(':not(#\\#)', '');
    return !selector.includes(':') && rule.includes(PRESSED_TOKEN);
  });
}

/**
 * Does the element paint the touch press through the press's strength while
 * `arm` matches — the pressed token at `var(--astryx-press-alpha)`? That one
 * declaration is the instant onset (strength 1 on the on arm) and the fade
 * (the release animates it to 0), so it is asserted on both arms; `arm`
 * defaults to the release's.
 */
export function readsPressStrength(el: Element, arm = FADING_ARM): boolean {
  return rulesWithSelector(el, arm).some(
    rule =>
      rule.includes(`var(${PRESS_PAINT}`) ||
      (rule.includes(PRESSED_TOKEN) && rule.includes(PRESS_STRENGTH)),
  );
}

/**
 * Does the element's `::after` paint the press the controller writes as its
 * image while `arm` matches (`var(--_press-paint-image)`), with the layer's
 * own colour yielding to it (`transparent`) on the same arm? A card's overlay
 * layer paints this way; `arm` defaults to the release's.
 */
export function afterPaintsPress(el: Element, arm = FADING_ARM): boolean {
  const rules = rulesWithSelector(el, arm).filter(rule =>
    rule.slice(0, rule.indexOf('{')).includes('::after'),
  );
  return (
    rules.some(rule =>
      /background-image:\s*var\(--_press-paint-image\)/.test(rule),
    ) && rules.some(rule => /background-color:\s*transparent/.test(rule))
  );
}

/**
 * The custom properties the element sets on a `data-astryx-press` arm that it
 * also declares without that attribute (unconditionally, or on a pseudo-class
 * or media arm). A layered stylesheet emits such a property's other
 * declarations outside the priority layers its attribute arms land in, and
 * those win whatever the arm's specificity, so the press never applies. An
 * element passes when this is empty.
 */
export function pressArmsShadowedByDefault(el: Element): string[] {
  const keyedOnPress = (rule: string) =>
    rule.slice(0, rule.indexOf('{')).includes('[data-astryx-press');
  const declared = (rule: string) =>
    Array.from(rule.slice(rule.indexOf('{')).matchAll(/(--[\w-]+)\s*:/g)).map(
      match => match[1],
    );
  const rules = rulesDeclaredFor(el);
  const elsewhere = new Set(
    rules.filter(rule => !keyedOnPress(rule)).flatMap(declared),
  );
  return Array.from(
    new Set(rules.filter(keyedOnPress).flatMap(declared)),
  ).filter(name => elsewhere.has(name));
}

/**
 * Does the element declare the press's paint, `--_press-paint`, as the pressed
 * token at the press's strength? That declaration lives in the shared overlay
 * styles and nowhere else; an element that composes one of them carries it,
 * and whatever paints for it reads the variable.
 */
export function declaresPressPaint(el: Element): boolean {
  return rulesDeclaredFor(el).some(
    rule =>
      rule.includes(`${PRESS_PAINT}:`) &&
      rule.includes(PRESSED_TOKEN) &&
      rule.includes(PRESS_STRENGTH),
  );
}

/**
 * A clock in ms as a page without a theme resolves it: `.2s`, `200ms` → 200;
 * a duration token (`var(--duration-exit)`) reads its default; `min(a, b)`
 * is the smaller. The press release plays the exit token, no longer than
 * DR2's bound under Reduce Motion (`spec:AST-094` FR5).
 */
export function durationToMs(value: string): number {
  const css = value.trim();
  const smaller = /^min\((.*)\)$/u.exec(css);
  if (smaller != null) {
    return Math.min(...topLevelArguments(smaller[1]).map(durationToMs));
  }
  const token = /^var\((--[\w-]+)\)$/u.exec(css);
  if (token != null) {
    const fallback: string | undefined = (
      durationDefaults as Record<string, string>
    )[token[1]];
    return fallback == null ? Number.NaN : durationToMs(fallback);
  }
  const match = /^([\d.]+)(ms|s)$/u.exec(css);
  if (match == null) {
    return Number.NaN;
  }
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/** `a, f(b, c)` → `['a', 'f(b, c)']`: the commas outside parentheses split. */
function topLevelArguments(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    const char = list[index];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/**
 * Does the element run the release animation on the fading arm, for exactly
 * the machine's release clock ({@link PRESS_FADE_MS}), with no animation on
 * the on arm (the onset is instant)? Asserted on the element the controller
 * writes to — the one that composes `pressedAlpha` or an overlay variant — not
 * on a descendant that merely reads the strength.
 */
export function hasReleaseFade(el: Element): boolean {
  // The element's own release: a layer of its own (a row's `::before`, a
  // card's `::after`) runs its clock separately.
  const fading = rulesWithSelector(el, FADING_ARM).filter(
    rule => !rule.slice(0, rule.indexOf('{')).includes('::'),
  );
  const durations = fading.flatMap(rule => {
    const match = rule.match(/animation-duration:\s*([^;}]+)/);
    return match == null ? [] : [durationToMs(match[1])];
  });
  const named = fading.some(rule => /animation-name:\s*(?!none)/.test(rule));
  const onArmAnimates = rulesWithSelector(el, '[data-astryx-press="on"]').some(
    rule => rule.includes('animation'),
  );
  // One duration and its Reduce Motion cap: both the machine's clock.
  return (
    named &&
    durations.length >= 1 &&
    durations.length <= 2 &&
    durations.every(duration => duration === PRESS_FADE_MS) &&
    !onArmAnimates
  );
}

/**
 * Does the element release the press on a compositor layer? The layer runs
 * an opacity keyframe animation on `pseudo`'s fading arm, for exactly
 * `releaseMs` and filled both ways. Wherever the layer releases, the element
 * runs no release of its own. A layer that exists only under a coarse
 * primary pointer passes when the element's own release stops there too.
 */
export function releasesOnLayer(
  el: Element,
  pseudo: '::before' | '::after',
  releaseMs: number,
): boolean {
  const fading = rulesWithSelector(el, FADING_ARM, {
    outsideMedia: REDUCED_MEDIA,
  });
  const layer = fading.filter(rule => selectorOf(rule).includes(pseudo));
  const durations = durationsOf(layer);
  const layerReleases =
    layer.some(runsAnimation) &&
    layer.some(rule => /animation-fill-mode:\s*both/.test(rule)) &&
    durations.length === 1 &&
    durations[0] === releaseMs;
  if (!layerReleases) {
    return false;
  }
  const own = (rules: string[]) => rules.filter(rule => !onPseudoElement(rule));
  if (!own(fading).some(runsAnimation)) {
    return true;
  }
  // The element keeps its own release for a fine pointer: the layer's
  // release must run only under a coarse one, where the element's stops.
  const animates = (rules: string[]) =>
    rules.filter(rule => rule.slice(rule.indexOf('{')).includes('animation-'));
  const coarseFading = rulesWithSelector(el, FADING_ARM, UNDER_COARSE);
  const coarseLayer = coarseFading.filter(rule =>
    selectorOf(rule).includes(pseudo),
  );
  return (
    animates(coarseLayer).length === animates(layer).length &&
    own(coarseFading).some(stopsAnimation)
  );
}

/**
 * Does the element paint the press on its `::before` compositor layer? The
 * layer shows the pressed token, exists only while a press does (see
 * {@link layerOnlyWhilePressed}), and on the on arm shows at once: opacity 1,
 * no animation.
 */
export function showsLayerPress(el: Element): boolean {
  const layer = rulesDeclaredFor(el).filter(rule =>
    selectorOf(rule).includes('::before'),
  );
  const on = layer.filter(rule => selectorOf(rule).includes(ON_ARM));
  return (
    layer.some(rule =>
      /background-color:[^;}]*--color-overlay-pressed/.test(rule),
    ) &&
    layerOnlyWhilePressed(el, '::before') &&
    on.some(rule => /opacity:\s*1\b/.test(rule)) &&
    !on.some(runsAnimation)
  );
}

/**
 * Under a coarse primary pointer, does every declaration of the element's
 * press layer on `pseudo`, and its `isolation`, apply only while a press is
 * on or fading? At rest the element then has no layer and is no stacking
 * context, and a caller's own `pseudo` keeps its styles.
 */
export function layerOnlyWhilePressed(
  el: Element,
  pseudo: '::before' | '::after',
): boolean {
  const declarations = (rule: string) => rule.slice(rule.indexOf('{'));
  const layer = rulesDeclaredFor(el, {insideMedia: COARSE_MEDIA}).filter(
    rule =>
      selectorOf(rule).includes(pseudo) ||
      /(^|[{;\s])isolation:/.test(declarations(rule)),
  );
  const onPressArm = (rule: string) =>
    [ON_ARM, FADING_ARM].some(arm => selectorOf(rule).includes(arm));
  return layer.length > 0 && layer.every(onPressArm);
}

/**
 * Under any pointer but a coarse primary one, does the element keep the
 * press it always had? Nothing animates `pseudo`, a `::before` is not
 * created at all (a card's `::after` is the card's own box), there is no
 * `isolation`, and the strength's release runs on the element on the press
 * clock.
 */
export function keepsPressOutsideCoarse(
  el: Element,
  pseudo: '::before' | '::after',
): boolean {
  const fine = rulesDeclaredFor(el, UNDER_FINE);
  const layer = fine.filter(rule => selectorOf(rule).includes(pseudo));
  const fading = rulesWithSelector(el, FADING_ARM, UNDER_FINE).filter(
    rule => !onPseudoElement(rule),
  );
  const clock = durationsOf(fading);
  return (
    (pseudo === '::after' ||
      !layer.some(rule =>
        /(^|[{;\s])content:/.test(rule.slice(rule.indexOf('{'))),
      )) &&
    !layer.some(rule => /animation-(name|duration):/.test(rule)) &&
    !fine.some(rule => /isolation:\s*isolate/.test(rule)) &&
    fading.some(runsAnimation) &&
    clock.length === 1 &&
    clock[0] === PRESS_FADE_MS
  );
}
