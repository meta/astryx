// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressState.ts
 * @input Uses document.styleSheets (populated by StyleX runtime injection) and
 *   the press machine's release clock (utils/pressGesture.ts)
 * @output Exports rulesDeclaredFor, rulesWithSelector, hasPressedArm,
 *   declaresPressedOverlay, readsPressStrength, afterPaintsPress,
 *   pressArmsShadowedByDefault, hasReleaseFade, showsLayerPress,
 *   layerOnlyWhilePressed, releasesOnLayer and keepsPressOutsideCoarse test
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
 * machine's own clock.
 *
 * SYNC: When modified, update this header.
 */

import {button} from '../motion/uikit/button';
import {list} from '../motion/uikit/list';

const PRESSED_TOKEN = '--color-overlay-pressed';
const PRESS_STRENGTH = '--astryx-press-alpha';
/** The press's paint at its strength, declared once by the shared styles. */
const PRESS_PAINT = '--_press-paint';
const FADING_ARM = '[data-astryx-press="fading"]';
const ON_ARM = '[data-astryx-press="on"]';
/** A selection hold's arm: the row it keeps selected through a push. */
const HELD_ARM = '[data-astryx-press="held"]';
/** The marker's value for a surface whose press is a cell's. */
const CELL_ARM = '[data-astryx-pressable="cell"]';
/** A mouse or Space press on a touch-first device: the fine pointer's clock. */
const INPUT_ARM = '[data-astryx-press-input]';
const isInputArm = (rule: string) => selectorOf(rule).includes(INPUT_ARM);

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
/**
 * Rules for a coarse primary pointer (inside its `@media`), or for any other
 * (outside it), Reduce Motion's arms left out of both.
 */
const UNDER = {
  coarse: {insideMedia: COARSE_MEDIA, outsideMedia: REDUCED_MEDIA},
  fine: {outsideMedia: /prefers-reduced-motion|\(pointer: coarse\)/},
} as const satisfies Record<string, RuleFilter>;

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
      /background-image:[^;}]*(--_press-paint-image|--color-overlay-pressed)/.test(
        rule,
      ),
    ) && rules.some(rule => /background-color:\s*transparent/.test(rule))
  );
}

/**
 * Does the element paint the press on its `::before` compositor layer: the
 * pressed token, on a layer that exists only while a press does (see
 * {@link layerOnlyWhilePressed}), shown at once (opacity 1, no animation) on
 * the on arm?
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
 * on, fading or held (a list row's selection hold)? At rest the element then
 * has no layer and is no stacking context, and a caller's own `pseudo` keeps
 * its styles.
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
    [ON_ARM, FADING_ARM, HELD_ARM].some(arm => selectorOf(rule).includes(arm));
  return layer.length > 0 && layer.every(onPressArm);
}

/**
 * Does the element release the press on a compositor layer: an opacity
 * keyframe animation on `pseudo`'s fading arm, for exactly `releaseMs` and
 * filled both ways, with no release animation left on the element itself
 * wherever the layer releases (the strength's own, a main-thread animation,
 * is dropped)? A layer that exists only under a coarse primary pointer
 * passes when the element's own release stops there too.
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
  const durations = durationsOf(layer.filter(rule => !isInputArm(rule)));
  // A mouse or Space press on the same layer keeps the deselect clock.
  const inputDurations = durationsOf(layer.filter(isInputArm));
  const layerReleases =
    layer.some(runsAnimation) &&
    layer.some(rule => /animation-fill-mode:\s*both/.test(rule)) &&
    durations.length === 1 &&
    durations[0] === releaseMs &&
    inputDurations.every(ms => ms === list.highlight.releaseMs);
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
  const coarseLayer = rulesWithSelector(el, FADING_ARM, UNDER.coarse).filter(
    rule => selectorOf(rule).includes(pseudo),
  );
  return (
    animates(coarseLayer).length === animates(layer).length &&
    own(rulesWithSelector(el, FADING_ARM, UNDER.coarse)).some(stopsAnimation)
  );
}

/**
 * Does the element, under any pointer but a coarse primary one, keep the
 * press it always had (the desktop rule): nothing animates `pseudo`, a
 * `::before` (the press's own layer; a card's `::after` is the card's box)
 * is not created at all, no `isolation`, and the strength's release runs on
 * the element on the deselect clock?
 */
export function keepsPressOutsideCoarse(
  el: Element,
  pseudo: '::before' | '::after',
): boolean {
  const fine = rulesDeclaredFor(el, UNDER.fine);
  const layer = fine.filter(rule => selectorOf(rule).includes(pseudo));
  const fading = rulesWithSelector(el, FADING_ARM, UNDER.fine).filter(
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
    clock[0] === list.highlight.releaseMs
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

/** `.2s`, `200ms`, `0.2s` → 200. */
export function durationToMs(value: string): number {
  const text = value.trim();
  // StyleX folds a constant cap into `calc(<time>)`.
  const folded = /^calc\((.+)\)$/.exec(text);
  if (folded != null) {
    return durationToMs(folded[1]);
  }
  // Under reduced motion the clock is capped: `min(<clock>, 200ms)`.
  const capped = /^min\((.+),\s*([\d.]+m?s)\)$/.exec(text);
  if (capped != null) {
    return Math.min(durationToMs(capped[1]), durationToMs(capped[2]));
  }
  // A theme motion role, `var(--motion-…, 200ms)`, reads as the table's
  // value it falls back to.
  const role = text.match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/);
  const match = (role == null ? text : role[1])
    .trim()
    .match(/^([\d.]+)(ms|s)$/);
  if (match == null) {
    return Number.NaN;
  }
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/**
 * Does the element run the release animation on the fading arm, on the clock
 * its press profile has under a coarse primary pointer (a control's,
 * UIButton's highlight release; a cell's deselect when the marker says
 * `cell`), and on the deselect clock it always had under any other pointer
 * (the desktop rule), with no animation on the on arm (the onset is
 * instant)? Asserted on the element the controller writes to — the one that
 * composes `pressedAlpha` or an overlay variant — not on a descendant that
 * merely reads the strength. A surface on a compositor press layer releases
 * there instead: its layer's release must run on the clock its marker names
 * (see {@link releasesOnLayer}).
 */
export function hasReleaseFade(el: Element): boolean {
  // The release without Reduce Motion; its Reduce Motion arms are checked in
  // pressPaintReducedMotion.test.ts and scripts/build-css.test.mjs.
  const own = (rules: string[]) => rules.filter(rule => !onPseudoElement(rule));
  const onArmAnimates = own(rulesWithSelector(el, ON_ARM)).some(rule =>
    rule.includes('animation'),
  );
  if (onArmAnimates) {
    return false;
  }
  const profileMs =
    el.getAttribute('data-astryx-pressable') === 'cell'
      ? list.highlight.releaseMs
      : button.highlight.releaseMs;
  const fine = own(rulesWithSelector(el, FADING_ARM, UNDER.fine));
  if (!fine.some(runsAnimation)) {
    // A surface whose layer runs every release (a list row).
    return (
      releasesOnLayer(el, '::before', profileMs) ||
      releasesOnLayer(el, '::after', profileMs)
    );
  }
  // Any other pointer than a coarse primary one: the deselect clock, one
  // number, as it always was.
  const fineClock = durationsOf(fine);
  if (fineClock.length !== 1 || fineClock[0] !== list.highlight.releaseMs) {
    return false;
  }
  const coarse = own(rulesWithSelector(el, FADING_ARM, UNDER.coarse));
  if (coarse.some(stopsAnimation)) {
    // Under a coarse primary pointer the surface's own layer releases.
    return (
      releasesOnLayer(el, '::before', profileMs) ||
      releasesOnLayer(el, '::after', profileMs)
    );
  }
  const isCell = (rule: string) => selectorOf(rule).includes(CELL_ARM);
  const control = durationsOf(
    coarse.filter(rule => !isCell(rule) && !isInputArm(rule)),
  );
  const cell = durationsOf(coarse.filter(isCell));
  // A mouse or Space press keeps the deselect clock on any surface.
  const input = durationsOf(coarse.filter(isInputArm));
  return (
    control.length === 1 &&
    control[0] === button.highlight.releaseMs &&
    cell.length === 1 &&
    cell[0] === list.highlight.releaseMs &&
    input.length === 1 &&
    input[0] === list.highlight.releaseMs
  );
}
