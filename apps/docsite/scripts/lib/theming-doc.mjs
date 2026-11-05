// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shape of a component's `theming` doc as the generated registries
 * emit it. The docsite's `latest` target reads the PUBLISHED packages' .doc.mjs
 * files, which can carry fields a later release dropped from `ThemingTarget`
 * (`deprecatedFor`, removed with the deprecated theming surface); emitting a
 * doc verbatim then fails the registry typecheck in production only. Project
 * every theming doc onto the fields the emitted interfaces declare, and drop
 * the targets a published doc marks as deprecated aliases: generated docs
 * present only the current theming surface, never an alias as an ordinary
 * target.
 */

/** Fields of the emitted `ThemingTarget` interface, in order. */
export const THEMING_TARGET_FIELDS = ['className', 'visualProps', 'states'];

/** Fields of the emitted `ComponentVar` interface. */
export const COMPONENT_VAR_FIELDS = [
  'name',
  'description',
  'default',
  'derived',
  'formula',
  'private',
];

/** Fields of the emitted `DerivedVar` interface. */
export const DERIVED_VAR_FIELDS = ['property', 'vars', 'expand', 'replaces'];

/** Fields of the emitted `ThemingDoc` interface. */
export const THEMING_DOC_FIELDS = ['container', 'targets', 'vars', 'derived'];

/**
 * @template {Record<string, unknown>} T
 * @param {T} value
 * @param {readonly string[]} fields
 * @returns {Partial<T>}
 */
function pick(value, fields) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const field of fields) {
    if (value[field] !== undefined) out[field] = value[field];
  }
  return /** @type {Partial<T>} */ (out);
}

/**
 * Keep only the fields the generated `ThemingDoc` interfaces declare, so a
 * published doc from an earlier release typechecks against the current
 * registry. Non-object input is returned as is.
 * @param {unknown} theming a sanitized (JSON-safe) theming doc
 * @returns {unknown}
 */
export function projectThemingDoc(theming) {
  if (
    theming == null ||
    typeof theming !== 'object' ||
    Array.isArray(theming)
  ) {
    return theming;
  }
  const doc = /** @type {Record<string, unknown>} */ (theming);
  const out = pick(doc, THEMING_DOC_FIELDS);
  if (Array.isArray(out.targets)) {
    out.targets = out.targets
      // A target that names the class superseding it is a deprecated alias
      // from an earlier release, not part of the current theming surface.
      .filter(
        target =>
          !(
            target != null &&
            typeof target === 'object' &&
            /** @type {Record<string, unknown>} */ (target).deprecatedFor !=
              null
          ),
      )
      .map(target =>
        target != null && typeof target === 'object'
          ? pick(
              /** @type {Record<string, unknown>} */ (target),
              THEMING_TARGET_FIELDS,
            )
          : target,
      );
  }
  if (Array.isArray(out.vars)) {
    out.vars = out.vars.map(entry =>
      entry != null && typeof entry === 'object'
        ? pick(
            /** @type {Record<string, unknown>} */ (entry),
            COMPONENT_VAR_FIELDS,
          )
        : entry,
    );
  }
  if (Array.isArray(out.derived)) {
    out.derived = out.derived.map(entry =>
      entry != null && typeof entry === 'object'
        ? pick(
            /** @type {Record<string, unknown>} */ (entry),
            DERIVED_VAR_FIELDS,
          )
        : entry,
    );
  }
  return out;
}
