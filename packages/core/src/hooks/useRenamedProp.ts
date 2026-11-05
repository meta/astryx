// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useRenamedProp.ts
 * @input The component name, the old and new prop names, and both values
 * @output The value to use, with development warnings for the overlap
 * @position Core deprecation utility for the overlap of a prop rename. It is
 *   not in hooks/index.ts, because that barrel is public and a new public hook
 *   needs admission (AST-002). Import it by path.
 */

// A released prop is a public promise. So a rename ships the replacement
// first and keeps the old name working for an overlap (AST-017). The new name
// wins when both are set, and development says so. Production behavior does
// not change.

import {useDevWarning} from './useDevWarning';

export interface RenamedPropOptions<T> {
  /** Component name, for the development warnings. */
  component: string;
  /** The deprecated prop's name. */
  deprecated: string;
  /** The deprecated prop's value, as the caller passed it. */
  deprecatedValue: T | undefined;
  /** The replacement prop's name. */
  replacement: string;
  /** The replacement prop's value, as the caller passed it. */
  value: T | undefined;
}

/**
 * Resolve a renamed prop: the replacement wins, the old name still works,
 * and development warns on use of the old name and again when both are set.
 *
 * `null` and `undefined` both count as "not given", matching the `??` the
 * adopting components already apply to their own defaults — so an explicit
 * `null` replacement falls through to the deprecated value if there is one,
 * and otherwise to the component's default, without a both-are-set warning
 * for a value that was never really set. An empty string is different: it is
 * a deliberate "render nothing" and wins like any other value.
 *
 * Returns `undefined` when neither is given, so the caller still applies its
 * own default.
 *
 * @example
 * ```
 * const label = useRenamedProp({
 *   component: 'Example',
 *   deprecated: 'oldLabel',
 *   deprecatedValue: oldLabel,
 *   replacement: 'label',
 *   value: labelFromProps,
 * });
 * ```
 */
export function useRenamedProp<T>({
  component,
  deprecated,
  deprecatedValue,
  replacement,
  value,
}: RenamedPropOptions<T>): T | undefined {
  // `!= null` catches undefined too: one notion of "not given", shared by
  // both names, so the warnings and the resolved value cannot disagree.
  const hasDeprecated = deprecatedValue != null;
  const hasValue = value != null;
  const hasBoth = hasDeprecated && hasValue;

  useDevWarning(
    component,
    `\`${deprecated}\` is deprecated; use \`${replacement}\` instead. ` +
      `\`${deprecated}\` still works exactly as released.`,
    hasDeprecated && !hasBoth,
  );
  useDevWarning(
    component,
    `\`${deprecated}\` and \`${replacement}\` are both set; ` +
      `\`${replacement}\` wins. \`${deprecated}\` is deprecated — drop it.`,
    hasBoth,
  );

  return hasValue ? value : deprecatedValue;
}
