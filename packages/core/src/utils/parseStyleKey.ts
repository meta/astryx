// Copyright (c) Meta Platforms, Inc. and affiliates.

import {themeDataAttributeName} from './themeProps';

/** Escape a value for a double-quoted CSS attribute selector string. */
function escapeAttributeValue(value: string): string {
  let escaped = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      char === '"' ||
      char === '\\' ||
      codePoint < 0x20 ||
      codePoint === 0x7f
    ) {
      escaped += `\\${(codePoint === 0 ? 0xfffd : codePoint).toString(16)} `;
    } else {
      escaped += char;
    }
  }
  return escaped;
}

/**
 * Parse a component style key into a CSS data-attribute selector suffix.
 *
 * Used by the shared theme compiler so semantic authoring keys match the
 * attributes emitted by `themeProps()`:
 *
 * - `prop:value` selects `[data-prop="value"]`.
 * - A bare state selects `[data-state="state"]`.
 * - `+` combines selectors on the same stable `astryx-*` target.
 *
 * Keeping the axis name in the selector prevents collisions between equal
 * values on different props, such as Grid's `align="center"` and
 * `justify="center"`.
 *
 * <!-- SYNC: packages/core/src/utils/themeProps.ts -->
 *
 * @example
 * ```ts
 * parseStyleKey('base')                        // ''
 * parseStyleKey('checked')                     // '[data-checked="checked"]'
 * parseStyleKey('checked+disabled')            // '[data-checked="checked"][data-disabled="disabled"]'
 * parseStyleKey('variant:secondary')           // '[data-variant="secondary"]'
 * parseStyleKey('level:1')                     // '[data-level="1"]'
 * parseStyleKey('variant:destructive+size:sm') // '[data-variant="destructive"][data-size="sm"]'
 * ```
 */
export function parseStyleKey(key: string): string {
  if (key === 'base') {
    return '';
  }

  return key
    .split('+')
    .map(part => {
      const separator = part.indexOf(':');
      const prop = separator === -1 ? part : part.slice(0, separator);
      const value = separator === -1 ? part : part.slice(separator + 1);
      return `[${themeDataAttributeName(prop)}="${escapeAttributeValue(value)}"]`;
    })
    .join('');
}
