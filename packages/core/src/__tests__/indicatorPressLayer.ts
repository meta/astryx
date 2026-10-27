// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file indicatorPressLayer.ts
 * @input The rules the StyleX dev runtime injected into the document
 * @output readIndicatorPressLayer, declaresIndicatorPressOwner,
 *   readsIndicatorPress, readsAncestorPress, layerPressRulesOutsideCoarse,
 *   ownerPressRulesOutsideCoarse, layerPressRulesBehindPointer and
 *   ownerPressRulesBehindPointer: what the layer over a checkbox box or a
 *   radio circle (its wrapper's `::after`) and the element that owns its
 *   press (indicatorPressOwnerStyles) declare
 * @position Shared test helper for CheckboxInput, CheckboxList and RadioList
 *   tests
 *
 * The owner of a press declares the press's image and release on itself:
 * none at rest, and the pressed token at full strength (with, while the
 * press fades, the release keyframes) inside its own `data-astryx-press`
 * arms, for every pointer (`spec:AST-094` FR11's fine-pointer profile,
 * FR43). The layer reads those values and runs the release on the press's
 * clock; a layer still behind the coarse-pointer key reads them there. jsdom
 * runs no cascade and no animation, so a test reads the injected rules.
 *
 * SYNC: When modified, update this header.
 */

import {durationToMs} from './pressState';

const IMAGE = '--_indicator-press-image';
const RELEASE = '--_indicator-press-release';
const PRESSED_TOKEN = '--color-overlay-pressed';

interface Rule {
  readonly selector: string;
  readonly conditions: string[];
  readonly style: CSSStyleDeclaration;
}

/** The rules for an element's own classes, each with the media conditions around it. */
function rulesOf(el: Element): Rule[] {
  const classes = Array.from(el.classList).map(name => `.${name}`);
  const out: Rule[] = [];
  const walk = (list: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, [...conditions, rule.media.mediaText]);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, [...conditions, rule.conditionText]);
      } else if (
        rule instanceof CSSStyleRule &&
        classes.some(cls => rule.selectorText.startsWith(cls))
      ) {
        out.push({selector: rule.selectorText, conditions, style: rule.style});
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, []);
  }
  return out;
}

/** A property's declared value in a rule, or '' when the rule leaves it. */
function valueOf(rule: Rule, property: string): string {
  if (property.startsWith('--')) {
    return rule.style.getPropertyValue(property).trim();
  }
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(
    rule.style.cssText,
  );
  return match == null ? '' : match[1].trim();
}

const isCoarse = (rule: Rule) =>
  rule.conditions.some(condition => condition.includes('pointer: coarse'));

/** Behind any pointer query, coarse or fine. */
const isPointerGated = (rule: Rule) =>
  rule.conditions.some(condition => /pointer:\s*(coarse|fine)/.test(condition));

/** An arm on the element's own press attribute, not on an ancestor's. */
const isOwnArm = (rule: Rule, state: 'on' | 'fading') =>
  rule.selector.includes(`:is([data-astryx-press="${state}"])`) &&
  !rule.selector.includes(' *');

const isLayer = (rule: Rule) => rule.selector.includes('::after');

export interface IndicatorPressLayer {
  /** The owner sets the pressed token as the image the layer reads, while its press is on. */
  readonly paintsOn: boolean;
  /** ...and through the release. */
  readonly paintsFading: boolean;
  /** The release runs an animation of the layer (the owner's keyframes, while its press fades). */
  readonly releases: boolean;
  /** The layer's release durations, ms: its clock, then the Reduce Motion fade. */
  readonly releaseMs: number[];
  /** The release fills both ways, so it holds its ends. */
  readonly fillsBoth: boolean;
}

/** What the layer over a mark does for a press `owner` holds. */
export function readIndicatorPressLayer(
  layer: Element,
  owner: Element,
): IndicatorPressLayer {
  const ownerRules = rulesOf(owner);
  const layerRules = rulesOf(layer).filter(isLayer);
  const readsImage = layerRules.some(rule =>
    valueOf(rule, 'background-image').includes(`var(${IMAGE}`),
  );
  const readsRelease = layerRules.some(rule =>
    valueOf(rule, 'animation-name').includes(`var(${RELEASE}`),
  );
  const sets = (
    property: string,
    state: 'on' | 'fading',
    accept: (value: string) => boolean,
  ) =>
    ownerRules.some(
      rule => isOwnArm(rule, state) && accept(valueOf(rule, property)),
    );
  return {
    paintsOn: readsImage && sets(IMAGE, 'on', v => v.includes(PRESSED_TOKEN)),
    paintsFading:
      readsImage && sets(IMAGE, 'fading', v => v.includes(PRESSED_TOKEN)),
    releases:
      readsRelease && sets(RELEASE, 'fading', v => v !== '' && v !== 'none'),
    releaseMs: layerRules.flatMap(rule => {
      const value = valueOf(rule, 'animation-duration');
      return value === '' ? [] : [durationToMs(value)];
    }),
    fillsBoth: layerRules.some(
      rule => valueOf(rule, 'animation-fill-mode') === 'both',
    ),
  };
}

/**
 * Does the element own a press for the layer over its mark: the press's
 * image and release declared on itself, none at rest, and anything else only
 * inside its own press arms?
 */
export function declaresIndicatorPressOwner(el: Element): boolean {
  const rules = rulesOf(el);
  return [IMAGE, RELEASE].every(property => {
    const declaring = rules.filter(rule => valueOf(rule, property) !== '');
    const rest = declaring.filter(
      rule =>
        rule.conditions.length === 0 &&
        !rule.selector.includes('data-astryx-press'),
    );
    const set = declaring.filter(rule => valueOf(rule, property) !== 'none');
    return (
      rest.length > 0 &&
      rest.every(rule => valueOf(rule, property) === 'none') &&
      set.length > 0 &&
      set.every(rule => isOwnArm(rule, 'on') || isOwnArm(rule, 'fading'))
    );
  });
}

/** Does the layer read an owner's press at all? */
export function readsIndicatorPress(layer: Element): boolean {
  return rulesOf(layer).some(
    rule =>
      isLayer(rule) &&
      valueOf(rule, 'background-image').includes(`var(${IMAGE}`),
  );
}

/**
 * Does the layer key on an ancestor's press attribute
 * (`:where(.x[data-astryx-press=…] *)`)? Such a layer answers any outer
 * element's press, not only its own owner's
 * (`architecture:component-style-authoring` INV4).
 */
export function readsAncestorPress(layer: Element): boolean {
  return rulesOf(layer).some(
    rule =>
      isLayer(rule) &&
      /\[data-astryx-press=[^\]]*\][^)]*\s\*\)/.test(rule.selector),
  );
}

const describe = (rule: Rule) =>
  `${rule.conditions.join(' | ')} | ${rule.selector} {${rule.style.cssText}}`;

/**
 * The layer's touch press rules (reading the owner's press, or the release's
 * name, clock, curve and fill) that are NOT behind the coarse-pointer key.
 * Touch work leaves a fine pointer's behavior as it is (`spec:AST-017`
 * FR59), so this is empty.
 */
export function layerPressRulesOutsideCoarse(el: Element): string[] {
  return rulesOf(el)
    .filter(
      rule =>
        isLayer(rule) &&
        !isCoarse(rule) &&
        (valueOf(rule, 'background-image').includes(
          'var(--_indicator-press-',
        ) ||
          rule.selector.includes('data-astryx-press') ||
          [
            'animation-name',
            'animation-duration',
            'animation-timing-function',
            'animation-fill-mode',
          ].some(property => valueOf(rule, property) !== '')),
    )
    .map(describe);
}

/**
 * The owner's press values (anything but none) that are NOT behind the
 * coarse-pointer key. Empty, for the same reason.
 */
export function ownerPressRulesOutsideCoarse(el: Element): string[] {
  return rulesOf(el)
    .filter(
      rule =>
        !isCoarse(rule) &&
        [IMAGE, RELEASE].some(property => {
          const value = valueOf(rule, property);
          return value !== '' && value !== 'none';
        }),
    )
    .map(describe);
}

/**
 * The layer's press rules (reading the owner's press, or the release's name,
 * clock, curve and fill) that sit behind a pointer query. One press model
 * serves every pointer (`spec:AST-094` FR11's fine-pointer profile, FR43),
 * so for a control on it this is empty.
 */
export function layerPressRulesBehindPointer(el: Element): string[] {
  return rulesOf(el)
    .filter(
      rule =>
        isLayer(rule) &&
        isPointerGated(rule) &&
        (valueOf(rule, 'background-image').includes(
          'var(--_indicator-press-',
        ) ||
          rule.selector.includes('data-astryx-press') ||
          [
            'animation-name',
            'animation-duration',
            'animation-timing-function',
            'animation-fill-mode',
          ].some(property => valueOf(rule, property) !== '')),
    )
    .map(describe);
}

/** The owner's press values (anything but none) behind a pointer query. */
export function ownerPressRulesBehindPointer(el: Element): string[] {
  return rulesOf(el)
    .filter(
      rule =>
        isPointerGated(rule) &&
        [IMAGE, RELEASE].some(property => {
          const value = valueOf(rule, property);
          return value !== '' && value !== 'none';
        }),
    )
    .map(describe);
}
