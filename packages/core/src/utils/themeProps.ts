// Copyright (c) Meta Platforms, Inc. and affiliates.

import {stableClassName} from '../naming';

export type ClassValue = string | number | undefined | null;
export type ClassProps = Record<string, ClassValue>;
export type ThemeDataAttributes = Record<`data-${string}`, string | undefined>;
export type ThemeProps = {className: string} & ThemeDataAttributes;

export function themeDataAttributeName(prop: string): `data-${string}` {
  return `data-${prop.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/**
 * Build the stable Astryx target class name for a component.
 *
 * Visual props and runtime states are reflected only as explicit `data-*`
 * attributes. The `astryx-` prefix comes from the centralized naming module
 * (`packages/core/src/naming.ts`) so the namespace lives in one place.
 *
 * <!-- SYNC: packages/core/src/naming.ts (namespace prefix source of truth) -->
 * <!-- SYNC: packages/core/src/utils/parseStyleKey.ts -->
 *
 * @param component - Component name in lowercase (e.g. 'button', 'card')
 * @returns Stable target class
 */
function buildClassName(component: string): string {
  return stableClassName(component);
}

/**
 * Reflect Astryx visual props as `data-*` attributes.
 *
 * Keys are kebab-cased (`listStyle` → `data-list-style`) and values are the
 * literal prop values, including numeric values (`level: 1` → `data-level="1"`).
 * Nullish values are omitted.
 */
export function themeDataAttributes(props?: ClassProps): ThemeDataAttributes {
  const attrs: ThemeDataAttributes = {};

  if (props) {
    for (const [prop, value] of Object.entries(props)) {
      if (value == null) {
        continue;
      }
      attrs[themeDataAttributeName(prop)] = String(value);
    }
  }

  return attrs;
}

/**
 * Build the props object components should spread onto the same element that
 * receives the stable Astryx class name.
 *
 * This emits one stable Astryx target plus canonical data-attribute reflection
 * for visual props and runtime states. For example:
 *
 * ```ts
 * themeProps('button', { variant: 'primary', size: 'sm' })
 * // → { className: 'astryx-button', data-variant: 'primary', data-size: 'sm' }
 * ```
 */
export function themeProps(component: string, props?: ClassProps): ThemeProps {
  return {
    className: buildClassName(component),
    ...themeDataAttributes(props),
  };
}
