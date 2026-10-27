// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexDeclarations.ts
 * @input Uses document.styleSheets (populated by StyleX runtime injection)
 * @output declaredValue — the CSS value a rendered element's StyleX classes
 *   actually declare for a property
 * @position Shared test helper; imported by component tests that need to prove
 *   a style prop reached the element
 *
 * Vitest compiles StyleX with `runtimeInjection: true` (see vitest.config.ts),
 * so the generated atomic rules are live in `document.styleSheets` during a
 * test. Asserting on the declaration a class carries — rather than on the
 * hashed class name itself — keeps these assertions stable across StyleX hash
 * changes and across the atomic-class merging that makes literal class-name
 * comparisons meaningless.
 *
 * Later rules win, matching the cascade for the equal-specificity atomic
 * classes StyleX emits. Rules that style a pseudo-element of the element are
 * not its declarations and are skipped.
 *
 * SYNC: When modified, update this header.
 */

/**
 * Read back the value the element's StyleX classes declare for `property`.
 *
 * @param el Rendered element to inspect.
 * @param property CSS property name, e.g. `'opacity'` or `'width'`.
 * @returns The declared value, or `null` when no class on the element declares
 *   the property.
 */
export function declaredValue(el: Element, property: string): string | null {
  const classes = new Set(el.className.split(' '));
  let value: string | null = null;
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      const owner = /^\.([\w-]+)/.exec(rule.selectorText)?.[1];
      if (owner == null || !classes.has(owner)) {
        continue;
      }
      // A pseudo-element's declaration (a press layer's `::before`) is that
      // box's value, not the element's.
      if (rule.selectorText.includes('::')) {
        continue;
      }
      const declared = rule.style.getPropertyValue(property);
      if (declared !== '') {
        value = declared;
      }
    }
  }
  return value;
}
