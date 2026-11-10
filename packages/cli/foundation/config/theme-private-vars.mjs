// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pure validation for private custom properties written directly in theme
 * input. Compiler-generated `--_*` declarations are not input and never enter
 * this check.
 */

/**
 * The authored adaptation rule values: a defined theme's normalized rules keep
 * them, while its resolved `__adaptationRules` hold compiler output.
 * @param {Record<string, any>} themeDef
 */
function adaptationRuleValues(themeDef) {
  const rules = themeDef.adaptations?.rules ?? themeDef.__adaptations?.rules;
  if (!Array.isArray(rules)) {
    return Array.isArray(themeDef.__adaptationRules)
      ? themeDef.__adaptationRules
      : [];
  }
  return rules
    .map(/** @param {any} rule */ rule => rule?.value)
    .filter(Boolean);
}

/**
 * The tokens a surface's author wrote. A defined theme's `tokens` are
 * resolved, with the private vars the compiler derives (the motion knobs'
 * `--_astryx-*`, `spec:AST-108` FR4), so its authored ones are
 * `__inputTokens`; a built module is compiler output, checked when built.
 * @param {Record<string, any>} value
 */
function authoredTokens(value) {
  if ('__built' in value) return undefined;
  return '__inputTokens' in value ? value.__inputTokens : value.tokens;
}

/**
 * Every named theme-input surface that can contain token or component writes.
 * @param {Record<string, any>} themeDef
 */
function inputSurfaces(themeDef) {
  const surfaces = [
    {name: 'theme', value: themeDef},
    {name: 'onDark', value: themeDef.onDark ?? themeDef.__onDark},
    {name: 'onLight', value: themeDef.onLight ?? themeDef.__onLight},
    ...adaptationRuleValues(themeDef).map((value, index) => ({
      name: `adaptation rule ${index + 1}`,
      value,
    })),
  ];
  return surfaces.filter(
    surface =>
      surface.value !== null &&
      typeof surface.value === 'object' &&
      !Array.isArray(surface.value),
  );
}

/**
 * Validate that authored theme input does not directly set private (`--_*`)
 * custom properties. Derived private variables emitted by the compiler are not
 * part of the input object and are valid.
 *
 * @param {Record<string, any>} themeDef
 * @returns {string[]}
 */
export function validatePrivateVars(themeDef) {
  /** @type {string[]} */
  const errors = [];

  for (const surface of inputSurfaces(themeDef)) {
    for (const field of ['tokens', 'localTokens']) {
      const values =
        field === 'tokens'
          ? authoredTokens(surface.value)
          : surface.value[field];
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        continue;
      }
      for (const name of Object.keys(values)) {
        if (!name.startsWith('--_')) continue;
        errors.push(
          `${surface.name} ${field} sets private var "${name}". ` +
            'Private vars (--_*) are internal; use a public token or standard CSS property instead.',
        );
      }
    }

    const components = surface.value.components;
    if (
      !components ||
      typeof components !== 'object' ||
      Array.isArray(components)
    ) {
      continue;
    }
    for (const [component, rules] of Object.entries(components)) {
      if (!rules || typeof rules !== 'object' || Array.isArray(rules)) continue;
      for (const [key, styles] of Object.entries(rules)) {
        /**
         * @param {unknown} value
         * @param {string[]} [path]
         */
        const visit = (value, path = []) => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            return;
          for (const [prop, nested] of Object.entries(value)) {
            if (prop.startsWith('--_')) {
              errors.push(
                `Component "${component}" (${[surface.name, key, ...path].join(
                  ' ',
                )}) sets private var "${prop}". ` +
                  'Private vars (--_*) are internal; use standard CSS properties ' +
                  '(e.g. borderRadius, padding) instead. The pipeline expands them automatically.',
              );
            }
            visit(nested, [...path, prop]);
          }
        };
        visit(styles);
      }
    }
  }

  return [...new Set(errors)];
}
