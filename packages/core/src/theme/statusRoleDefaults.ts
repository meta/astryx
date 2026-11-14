// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusRoleDefaults.ts
 * @input Theme tokens, theme-local tokens, resolved adaptation rules
 * @output The root status roles a theme leaves unset, in one canonical order,
 *   and the token cascade and adaptation match-set helpers the generator reuses
 * @position Shared by token resolution (tokens.ts) and the theme-rule
 *   generator (generateThemeRules.ts)
 *
 * Token resolution imports this module, not the generator, so a first load
 * that resolves tokens does not include the generator.
 */

import type {ResolvedThemeAdaptationRule} from './themeAdaptations';
import {deriveStatusRoleTokens} from './statusRoleDerivation';
import {
  analyzeDeclarationValue,
  canonicalizeDeclarationName,
} from './declarationBoundary';

/**
 * Public tokens whose canonical default references another public token: the
 * status roles and `--duration-exit`. StyleX owns the document defaults. A
 * theme that authors a source repeats its omitted token at the theme root so
 * nested Theme regions bind the alias locally without changing authored-token
 * metadata.
 *
 * Conditional scopes repeat an omitted alias only when the source changes on
 * that scope. Explicit adaptation role writes are replayed after generated
 * aliases (and on media descendants) so authored role precedence survives
 * overlapping conditions without disabling the alias in non-matching states.
 */
export const SCOPED_REFERENCE_DEFAULTS: ReadonlyArray<
  readonly [role: string, source: string]
> = [
  ['--color-text-info', '--color-text-blue'],
  ['--color-text-success', '--color-text-green'],
  ['--color-text-warning', '--color-text-yellow'],
  ['--color-text-error', '--color-text-red'],
  ['--color-on-info-muted', '--color-text-blue'],
  ['--color-on-success-muted', '--color-text-green'],
  ['--color-on-warning-muted', '--color-text-yellow'],
  ['--color-on-error-muted', '--color-text-red'],
  // Icon and border roles follow the text role, set or derived.
  ['--color-icon-info', '--color-text-info'],
  ['--color-icon-success', '--color-text-success'],
  ['--color-icon-warning', '--color-text-warning'],
  ['--color-icon-error', '--color-text-error'],
  ['--color-border-info', '--color-text-info'],
  ['--color-border-success', '--color-text-success'],
  ['--color-border-warning', '--color-text-warning'],
  ['--color-border-error', '--color-text-error'],
  ['--duration-exit', '--duration-fast'],
];

const STATUS_ROLE_ORDER = new Map(
  SCOPED_REFERENCE_DEFAULTS.map(([role], index) => [role, index]),
);

type TokenValues = Record<string, unknown>;

export function stringifyTokenValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  // Preserve the exact JavaScript interpolation behavior legacy themes received
  // before declaration analysis accepted non-string token values.
  return String(value);
}

interface TokenCascadeState {
  values: TokenValues;
  important: Set<string>;
}

export function assignTokenCascade(
  state: TokenCascadeState,
  ...tokenSets: ReadonlyArray<TokenValues | undefined>
): void {
  for (const tokens of tokenSets) {
    for (const [rawToken, rawValue] of Object.entries(tokens ?? {})) {
      const token = canonicalizeDeclarationName(rawToken);
      const value = stringifyTokenValue(rawValue);
      const analysis = analyzeDeclarationValue(value);
      // Match joinDeclarations: declarations that cannot be emitted never
      // participate in the browser cascade this safety model validates.
      if (token === null || analysis.reason !== null) {
        continue;
      }
      if (state.important.has(token) && !analysis.important) {
        continue;
      }
      state.values[token] = value;
      if (analysis.important) {
        state.important.add(token);
      } else {
        state.important.delete(token);
      }
    }
  }
}

export function createTokenCascade(
  ...tokenSets: ReadonlyArray<TokenValues | undefined>
): TokenCascadeState {
  const state: TokenCascadeState = {values: {}, important: new Set()};
  assignTokenCascade(state, ...tokenSets);
  return state;
}

/** Check whether one candidate value closes a cycle through its own role. */
export function tokenValuesWouldHaveCycleWithValue(
  tokens: TokenValues,
  relevantToken: string,
  candidateValue: string,
): boolean {
  const stack = [...analyzeDeclarationValue(candidateValue).references];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const token = stack.pop();
    if (token === undefined) {
      continue;
    }
    if (token === relevantToken) {
      return true;
    }
    if (
      visited.has(token) ||
      !Object.prototype.hasOwnProperty.call(tokens, token)
    ) {
      continue;
    }
    visited.add(token);
    for (const reference of analyzeDeclarationValue(
      stringifyTokenValue(tokens[token]),
    ).references) {
      if (
        reference === relevantToken ||
        Object.prototype.hasOwnProperty.call(tokens, reference)
      ) {
        stack.push(reference);
      }
    }
  }
  return false;
}

const WIDTH_CELL_RANK = {
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
} as const;

function adaptationConditionMatchesCell(
  condition: ResolvedThemeAdaptationRule['when'],
  widthRank: number,
  pointer: 'coarse' | 'fine' | 'none',
  contrast: 'more' | 'less' | 'no-preference' | 'custom',
  motion: 'reduce' | 'no-preference',
): boolean {
  const from = condition.width?.from;
  if (from !== undefined && widthRank < WIDTH_CELL_RANK[from]) {
    return false;
  }
  const below = condition.width?.below;
  if (below !== undefined && widthRank >= WIDTH_CELL_RANK[below]) {
    return false;
  }
  return (
    (condition.pointer === undefined || condition.pointer === pointer) &&
    (condition.contrast === undefined || condition.contrast === contrast) &&
    (condition.motion === undefined || condition.motion === motion)
  );
}

const REACHABLE_MATCH_SET_CACHE = new WeakMap<
  ReadonlyArray<ResolvedThemeAdaptationRule>,
  number[][]
>();

/** Every reachable ordered adaptation-rule match set, including the root. */
export function reachableAdaptationMatchSets(
  rules: ReadonlyArray<ResolvedThemeAdaptationRule>,
): number[][] {
  const cached = REACHABLE_MATCH_SET_CACHE.get(rules);
  if (cached !== undefined) {
    return cached;
  }
  const matchSets = new Map<string, number[]>();
  for (let widthRank = 0; widthRank <= 5; widthRank++) {
    for (const pointer of ['coarse', 'fine', 'none'] as const) {
      for (const contrast of [
        'more',
        'less',
        'no-preference',
        'custom',
      ] as const) {
        for (const motion of ['reduce', 'no-preference'] as const) {
          const indexes = rules.flatMap((rule, index) =>
            adaptationConditionMatchesCell(
              rule.when,
              widthRank,
              pointer,
              contrast,
              motion,
            )
              ? [index]
              : [],
          );
          matchSets.set(indexes.join(','), indexes);
        }
      }
    }
  }
  const reachable = [...matchSets.values()];
  REACHABLE_MATCH_SET_CACHE.set(rules, reachable);
  return reachable;
}

export function effectiveAdaptationTokenValues(
  rootTokens: Record<string, string>,
  rootLocalTokens: Record<string, string> | undefined,
  rootAliases: ReadonlyArray<readonly [string, string]>,
  rules: ReadonlyArray<ResolvedThemeAdaptationRule>,
  matchingRuleIndexes: ReadonlyArray<number>,
  conditionalAliases: ReadonlyArray<
    ReadonlyArray<readonly [string, string]>
  > = [],
): TokenValues {
  const effective = createTokenCascade(
    rootTokens,
    Object.fromEntries(rootAliases),
    rootLocalTokens,
  );
  for (const index of matchingRuleIndexes) {
    const rule = rules[index];
    assignTokenCascade(
      effective,
      rule.tokens,
      Object.fromEntries(conditionalAliases[index] ?? []),
      rule.localTokens,
    );
  }
  // Emission replays authored roles after every ordinary adaptation block so
  // an explicit role beats aliases from any later overlapping rule.
  for (const index of matchingRuleIndexes) {
    assignTokenCascade(
      effective,
      Object.fromEntries(authoredStatusRoleEntries(rules[index].tokens)),
    );
  }
  return effective.values;
}

/** Root status roles a theme leaves unset: derived values and source aliases. */
export function generatedScopedStatusRoleDefaults(
  tokens: Record<string, string>,
  localTokens: Record<string, string> = {},
  rules: ReadonlyArray<ResolvedThemeAdaptationRule> = [],
): [string, string][] {
  // Roles a theme leaves unset while setting their status source are
  // computed against the theme's own surfaces first; the aliases below then
  // treat them as present, so icon and border roles follow a derived text role.
  const entries: [string, string][] = deriveStatusRoleTokens(
    tokens,
    localTokens,
  );
  const authoredRoot = createTokenCascade(
    tokens,
    Object.fromEntries(entries),
    localTokens,
  ).values;
  const states = reachableAdaptationMatchSets(rules).map(indexes => ({
    indexes,
    values: effectiveAdaptationTokenValues(
      tokens,
      localTokens,
      entries,
      rules,
      indexes,
    ),
  }));

  for (const [role, source] of SCOPED_REFERENCE_DEFAULTS) {
    const alias = `var(${source})`;
    if (
      authoredRoot[role] !== undefined ||
      (authoredRoot[source] === undefined &&
        !entries.some(([emitted]) => emitted === source))
    ) {
      continue;
    }
    const isSafe = states.every(
      ({values}) =>
        values[role] !== undefined ||
        !tokenValuesWouldHaveCycleWithValue(values, role, alias),
    );
    if (isSafe) {
      entries.push([role, alias]);
      for (const {values} of states) {
        if (values[role] === undefined) {
          values[role] = alias;
        }
      }
    }
  }
  // One canonical order whether a role is derived or aliased, so themes that
  // differ only in which roles needed computing still emit comparable rules.
  return entries.sort(
    ([a], [b]) =>
      (STATUS_ROLE_ORDER.get(a) ?? 0) - (STATUS_ROLE_ORDER.get(b) ?? 0),
  );
}

export function authoredStatusRoleEntries(
  tokens: Record<string, string>,
): [string, string][] {
  const canonicalTokens = createTokenCascade(tokens).values;
  return SCOPED_REFERENCE_DEFAULTS.flatMap(([role]) => {
    const value = canonicalTokens[role];
    return value === undefined ? [] : [[role, stringifyTokenValue(value)]];
  });
}
