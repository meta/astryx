// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme maps a generated icon module writes: one for the set's
 * default look, and one for each other look an icon draws.
 *
 * A theme map is keyed by the built-in icon definitions the set maps. The
 * default one, `themeIcons`, draws each icon's own export. A look's map,
 * `themeIcons<Variant>` (`themeIconsFilled`), draws each icon's export for
 * that variant, or the icon's own export when it has none, so a theme that
 * takes it draws every built-in icon in that look where the set has it.
 *
 * @input A set's data file
 * @output The theme maps' names and which one draws a look
 * @position packages/cli/foundation/discovery — read by the icon-set writer,
 *   `integration check`, and `astryx experimental icon use`
 */

/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetData} IconSetData */

/** The theme map the generated module writes for the default look. */
export const THEME_MAP_NAME = 'themeIcons';

/**
 * The name of the theme map that draws one look: `themeIcons`, then the
 * variant's name in PascalCase (`filled` is `themeIconsFilled`), the way
 * a variant's icon export takes it (`TrashFilledIcon`).
 * @param {string} variant one of the set's declared variants
 */
export function variantThemeMapName(variant) {
  return `${THEME_MAP_NAME}${variant
    .split('-')
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join('')}`;
}

/**
 * The variants at least one icon of the set draws with its own export.
 * @param {IconSetData} data
 * @returns {Set<string>}
 */
function drawnVariants(data) {
  return new Set(
    data.icons.flatMap(icon => (icon.variants ?? []).map(each => each.variant)),
  );
}

/**
 * The theme maps the generated module writes beside `themeIcons`: one for
 * each variant the set declares, other than its default, that an icon
 * draws. Empty for a set without a generated module, or whose `themeMap` is
 * not `themeIcons`: the CLI writes only that map.
 * @param {IconSetData} data
 * @returns {Array<{variant: string, name: string}>}
 */
export function variantThemeMaps(data) {
  if (!data.generated || data.themeMap !== THEME_MAP_NAME) return [];
  const drawn = drawnVariants(data);
  return (data.variants ?? [])
    .filter(variant => variant !== data.default?.variant && drawn.has(variant))
    .map(variant => ({variant, name: variantThemeMapName(variant)}));
}

/**
 * The theme map that draws a set's built-in icons in one look: the set's
 * `themeMap` for its default look, and for a look no icon draws (every entry
 * is then the icon's own export); the look's own map when the generated
 * module writes one. Null when the set names no theme map, or when an icon
 * draws the look and the set's theme map is one the CLI does not write.
 * @param {IconSetData} data
 * @param {string | null | undefined} variant
 * @returns {string | null}
 */
export function lookThemeMap(data, variant) {
  if (!data.themeMap) return null;
  if (variant == null || variant === data.default?.variant) {
    return data.themeMap;
  }
  const own = variantThemeMaps(data).find(each => each.variant === variant);
  if (own) return own.name;
  return drawnVariants(data).has(variant) ? null : data.themeMap;
}

/**
 * The export one icon draws a look with: its export for that variant, or its
 * own export when it has none.
 * @param {import('../../authoring/doctypes/icon-set/type').IconSetIcon} icon
 * @param {string} variant
 */
export function lookExport(icon, variant) {
  return (
    (icon.variants ?? []).find(each => each.variant === variant)?.export ??
    icon.export
  );
}
