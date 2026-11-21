// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file syntaxThemeChoices.ts
 * @input The value of a syntax-theme prop and whether the prop is required
 * @output The preset choices the playground offers, the selected choice, the
 *   value a choice sends, and the name of the preset a value is
 * @position Logic of the playground's syntax-theme control
 *   (PlaygroundPropsTable)
 */

import {allSyntaxPresets} from '@astryxdesign/core/theme/syntax';

/** The choice that leaves an optional syntax-theme prop unset. */
export const NO_SYNTAX_THEME = 'None';

const presets = allSyntaxPresets.map(theme => ({
  value: theme.name,
  label: theme.name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
  theme,
}));

/**
 * The presets, with a first choice that leaves the prop unset when the prop
 * is optional. An unset prop keeps the theme-level syntax colors.
 */
export function syntaxThemeChoices(
  isRequired: boolean,
): {value: string; label: string}[] {
  const choices = presets.map(({value, label}) => ({value, label}));
  return isRequired
    ? choices
    : [{value: NO_SYNTAX_THEME, label: NO_SYNTAX_THEME}, ...choices];
}

/** The choice that shows `value`. */
export function selectedSyntaxTheme(
  value: unknown,
  isRequired: boolean,
): string {
  const match = presets.find(
    option =>
      option.theme === value ||
      (value != null &&
        typeof value === 'object' &&
        'name' in value &&
        option.theme.name === value.name),
  );
  if (match) {
    return match.value;
  }
  return isRequired ? presets[0].value : NO_SYNTAX_THEME;
}

/**
 * The name of the preset `value` is, such as "one-dark-pro"; null when
 * `value` is not a preset.
 */
export function syntaxPresetName(value: unknown): string | null {
  return presets.find(option => option.theme === value)?.value ?? null;
}

/** The value a choice sends: a preset, or nothing for the unset choice. */
export function syntaxThemeFor(choice: string): unknown {
  return presets.find(option => option.value === choice)?.theme;
}
