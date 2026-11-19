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
 * The private variables in a tokens map that hold exactly what Core derives
 * from the map's own public tokens (a duration's pre-tempo copy) or the
 * value it reads with none set (a tempo of 1): a map spread from a defined
 * theme's `tokens` carries them, and they change nothing, so they are no
 * write of the author's.
 * @param {Record<string, unknown>} tokens
 * @param {((input: any) => any) | undefined} defineTheme Core's defineTheme
 * @returns {Set<string>}
 */
export function derivedPrivateCopies(tokens, defineTheme) {
  const names = Object.keys(tokens).filter(name => name.startsWith('--_'));
  if (names.length === 0 || typeof defineTheme !== 'function') return new Set();
  /** @type {Record<string, unknown>} */
  let derived;
  try {
    derived =
      defineTheme({
        name: 'derived-private-copies',
        tokens: Object.fromEntries(
          Object.entries(tokens).filter(([name]) => !name.startsWith('--_')),
        ),
      })?.tokens ?? {};
  } catch {
    return new Set();
  }
  /** @type {Record<string, unknown>} */
  let unset = {};
  try {
    unset = defineTheme({name: 'derived-private-copies'})?.tokens ?? {};
  } catch {
    // No theme without tokens: only derived copies count.
  }
  return new Set(
    names.filter(name =>
      [derived[name], unset[name]].includes(String(tokens[name])),
    ),
  );
}

/**
 * Why a tokens map that carries Core's own copies (so it was spread from a
 * defined theme's `tokens`) also sets another private variable: it comes
 * with the spread, not from the author.
 * @param {string} name
 * @param {Set<string>} copies the map's Core copies, as `derivedPrivateCopies` finds them
 */
export function spreadPrivateVarMessage(name, copies) {
  return `${name} is a private variable (--_*) that a defined theme's tokens carry, as they carry Core's own copies such as ${[...copies][0]}: the map is spread from one, so spread only the tokens you change, or extend that theme with extends`;
}

/**
 * Validate that authored theme input does not directly set private (`--_*`)
 * custom properties. Derived private variables emitted by the compiler are not
 * part of the input object and are valid, and so is a private variable that
 * holds exactly the copy Core derives (`derivedPrivateCopies`).
 *
 * @param {Record<string, any>} themeDef
 * @param {{defineTheme?: (input: any) => any}} [options] Core's defineTheme,
 *   to tell Core's own copies
 * @returns {string[]}
 */
export function validatePrivateVars(themeDef, {defineTheme} = {}) {
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
      const copies =
        field === 'tokens'
          ? derivedPrivateCopies(values, defineTheme)
          : new Set();
      for (const name of Object.keys(values)) {
        if (!name.startsWith('--_') || copies.has(name)) continue;
        errors.push(
          copies.size > 0
            ? `${surface.name} ${field}: ${spreadPrivateVarMessage(name, copies)}.`
            : `${surface.name} ${field} sets private var "${name}". ` +
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
