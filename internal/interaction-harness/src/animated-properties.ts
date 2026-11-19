// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animated-properties.ts
 * @input The Web Animations API and the page's style sheets
 * @output `defineAnimatedProperties`, a page function. It installs
 *   `window.__harnessAnimatedProperties(animation)` once: the properties the
 *   animation sets, as `getKeyframes()` names them. It also installs
 *   `window.__harnessAnimates(animation, property)`: whether the animation
 *   sets a property named as CSS names it.
 * @position Shared by ./curves.ts (a hold's judged motions) and ./busy.ts
 *   (`blockMainThread`'s `property`), so both match a property the same way.
 *   Not exported from the package: a page function, evaluated in the page.
 *
 * SYNC: When modified, update ./curves.ts (installCurveEnd) and ./busy.ts
 *   (blockMainThread).
 */

/**
 * Installs `window.__harnessAnimatedProperties(animation)` and
 * `window.__harnessAnimates(animation, property)` in the page, once. A page
 * function: it closes over nothing.
 */
export function defineAnimatedProperties(): void {
  const w = window as unknown as {
    __harnessAnimatedProperties?: (animation: Animation) => string[];
    __harnessAnimates?: (animation: Animation, property: string) => boolean;
  };
  if (w.__harnessAnimatedProperties) {
    return;
  }
  // `getKeyframes()` names a property in camel case, except a custom
  // property.
  const keyframeName = (property: string) =>
    property.startsWith('--')
      ? property
      : property.replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        );
  // Chromium's `getKeyframes()` leaves out a custom property that a CSS
  // animation animates. The `@keyframes` rule of that name lists it. The
  // rule can sit inside a grouping rule (`@layer`, `@media`).
  const keyframesRules = (rules: readonly CSSRule[]): CSSKeyframesRule[] =>
    rules.flatMap(rule =>
      rule instanceof CSSKeyframesRule
        ? [rule]
        : rule instanceof CSSGroupingRule
          ? keyframesRules([...rule.cssRules])
          : [],
    );
  const ruleProperties = (name: string) =>
    [...document.styleSheets, ...document.adoptedStyleSheets].flatMap(sheet => {
      let rules: CSSRule[] = [];
      try {
        rules = [...sheet.cssRules];
      } catch {
        // A cross-origin sheet does not expose its rules.
      }
      return keyframesRules(rules)
        .filter(rule => rule.name === name)
        .flatMap(rule =>
          [...rule.cssRules].flatMap(keyframe => [
            ...(keyframe as CSSKeyframeRule).style,
          ]),
        );
    });
  // A keyframe also names its offset, easing and composite. These are not
  // properties the animation sets.
  const timingKeys = new Set([
    'offset',
    'computedOffset',
    'easing',
    'composite',
  ]);
  const properties = (animation: Animation) => [
    ...new Set([
      ...((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
        .flatMap(keyframe => Object.keys(keyframe))
        .filter(name => !timingKeys.has(name)),
      ...(animation instanceof CSSAnimation
        ? ruleProperties(animation.animationName).map(keyframeName)
        : []),
    ]),
  ];
  w.__harnessAnimatedProperties = properties;
  w.__harnessAnimates = (animation, property) =>
    properties(animation).includes(keyframeName(property));
}
