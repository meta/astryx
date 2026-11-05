// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set contribution descriptor and data-file types (AST-084).
 *
 * An icon set is one integration item: a lower-kebab directory under the
 * manifest's `experimental.iconSets` root holding a strongly typed `<name>.doc.mjs`
 * descriptor and one `<name>.icons.json` data file. The descriptor holds what
 * a person writes about the set; the data file says what every icon means.
 * Every icon surface (`astryx experimental icon`, template icon mapping, the theme
 * map check, Doctor) reads the data file and nothing else.
 *
 * @input metadata authored beside one icon set
 * @output the public IconSetDoc and IconSetData contracts
 * @position packages/cli/authoring/doctypes/icon-set — icon-set vocabulary
 */

/**
 * The descriptor for one icon set an integration contributes.
 *
 * @example
 * ```
 * /** @type {import('@astryxdesign/cli/authoring').IconSetDoc} *\/
 * export default {
 *   type: 'icon-set',
 *   name: 'outline',
 *   displayName: 'Acme Outline',
 *   description: 'Outline icons with rounded strokes.',
 *   maintained: true,
 *   license: 'MIT',
 * };
 * ```
 *
 * @experimental Icon sets may change or be removed in a patch release
 * (spec:AST-017 FR27).
 */
export interface IconSetDoc {
  /** Doc-kind discriminant. */
  type: 'icon-set';
  /** Stable CLI identity. Must be lower-kebab and match the parent directory. */
  name: string;
  /** Human-readable name shown by icon-set listings. */
  displayName: string;
  /** One-line summary shown by icon-set listings. */
  description: string;
  /** Whether the owning package actively maintains this set. */
  maintained: boolean;
  /** SPDX license expression for the artwork. */
  license: string;
}

/**
 * The variant an icon's own `export` draws, when the set declares variants.
 * A variant is a named look the set supplies (for example outline or solid);
 * size comes from CSS.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetDefault {
  /** One of the set's declared `variants`. */
  variant?: string;
}

/**
 * Another variant of one icon, drawn by its own export.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetVariant {
  /** One of the set's declared `variants`. */
  variant: string;
  /** The named export that draws this variant. */
  export: string;
  /** The import specifier, when it differs from the icon's module. */
  module?: string;
}

/**
 * How sure a reviewed cross-set match is.
 * @experimental May change or be removed in a patch release.
 */
export type IconSetMatchConfidence = 'exact' | 'strong' | 'likely';

/**
 * A reviewed equivalent of an icon in another icon set or icon library.
 * Template icon mapping applies `exact` and `strong` matches and only
 * suggests `likely` ones.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetMatch {
  /** The other set's name, such as `lines`; never this set's own name. */
  set: string;
  /** The export that draws the equivalent icon in that set. */
  export: string;
  /** Which of that set's variants, such as `solid`, when it has several. */
  variant?: string;
  /** How sure the match is. */
  confidence: IconSetMatchConfidence;
}

/**
 * One icon of a set.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetIcon {
  /** Lower-kebab identity, unique in the set. */
  id: string;
  /** The named export that draws the icon's default variant. */
  export: string;
  /** The import specifier, when it differs from the set's module. */
  module?: string;
  /** Lower-case terms a person might search for; at least one. */
  words: string[];
  /** Other variants, each naming a declared variant and its own export. */
  variants?: IconSetVariant[];
  /** Reviewed equivalents of this icon in other sets. */
  matches?: IconSetMatch[];
}

/**
 * The upstream library and version the data file was generated from.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetSource {
  package: string;
  version: string;
}

/**
 * The function that turns a library export into an icon component.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetAdapter {
  /** A path from the package root, such as `./src/adapt.js`. */
  module: string;
  /** Its named export. */
  export: string;
}

/**
 * The `<name>.icons.json` data file of one icon set.
 * @experimental May change or be removed in a patch release.
 */
export interface IconSetData {
  /** Data-file format version. */
  schemaVersion: 1;
  /** The import specifier every `export` is read from. */
  module: string;
  /** The upstream library, absent for a set with no upstream. */
  source?: IconSetSource;
  /**
   * Library exports that are not icons, left out every time
   * `astryx experimental icon new-set --from` wraps or refreshes the set.
   */
  exclude?: string[];
  /**
   * The variants the set supplies, lower-kebab names such as `outline` and
   * `solid`; absent when it has one look. A variant is a named look the set
   * supplies; size comes from CSS.
   */
  variants?: string[];
  /** The variant an icon's own `export` draws. */
  default?: IconSetDefault;
  /** The export that maps each built-in definition in `map` to its artwork. */
  themeMap?: string;
  /**
   * Which of this set's icons draws each icon definition, by definition name:
   * Astryx's (`astryx docs cli/experimental/icon-definitions`) or one the set declares in its
   * `definitions` folder. One icon may draw several definitions; each
   * definition maps to one icon.
   */
  map?: Record<string, string>;
  /**
   * The module `astryx experimental icon add` writes, from the package root, such as
   * `./src/icons.generated.js`: one export per registered icon, a re-export
   * of a library component or an adapted export. The set's `module` exports
   * it, so every icon entry reads from the set's own module.
   */
  generated?: string;
  /**
   * A function in the set's package, `(source) => Component`, that turns a
   * library export that is not a component (an icon data object, an SVG
   * string or URL, a glyph name) into one. `module` is a path from the
   * package root.
   */
  adapter?: IconSetAdapter;
  /** Every icon in the set. */
  icons: IconSetIcon[];
}
