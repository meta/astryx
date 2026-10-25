// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeAdaptations.ts
 * @input Ordered environment-conditioned theme value rules from defineTheme
 * @output Validated breakpoint metadata, the compact definition, and resolved
 *   CSS-first rule layers
 * @position Theme system core; consumed by defineTheme, AppShell, and the CSS compiler
 *
 * Adaptations are deliberately closed and ordered. Width points are fixed names,
 * sparse rules and reserved token routing are rejected during normalization,
 * condition fields are ANDed, and rule order is the precedence model: every
 * matching rule writes after the root theme and later matching writes win.
 * Invariant type-scale component defaults already declared at root are omitted;
 * authored rule leaves and generated token writes retain their cascade order.
 * Token cycles are judged after each reachable ordered cascade is complete.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/defineTheme.ts (`DefineThemeInput.adaptations`)
 * - /packages/core/src/theme/generateThemeRules.ts (`generateAdaptationCSS`)
 * - /packages/core/src/AppShell/AppShell.tsx (named breakpoint consumption)
 * - /packages/cli/assets/theme.template.ts
 * - /packages/cli/assets/docs/theme.doc.mjs
 * - /packages/cli/api/theme/build/build.mjs
 */

import type {ComponentStyleMap, TokenName, TokenValue} from './defineTheme';
import type {TypographyConfig, TypographyRole} from './types';
import type {MotionScaleConfig} from './expandMotionScale';
import type {RadiusScaleConfig} from './expandRadiusScale';
import type {ColorScaleConfig} from './expandColorScale';
import {resolveThemeValues, type ThemeValuesInput} from './resolveThemeValues';
import {assertNoTokenCycles, resolveAdaptationLocalTokens} from './localTokens';

// =============================================================================
// Public authoring vocabulary
// =============================================================================

/** Fixed names for viewport-width tier start points. */
export const WIDTH_BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'] as const;

/** One fixed viewport-width breakpoint name. */
export type WidthBreakpointName = (typeof WIDTH_BREAKPOINT_NAMES)[number];

/** A complete, validated map of viewport-width tier start points in CSS px. */
export type WidthBreakpoints = Record<WidthBreakpointName, number>;

/** The default Astryx viewport-width tier start points in CSS px. */
export const DEFAULT_WIDTH_BREAKPOINTS: Readonly<WidthBreakpoints> =
  Object.freeze({
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  });

/**
 * When a screen is compact, for a component that chooses a presentation by
 * screen size (`spec:AST-012` FR9): width below the theme's effective `md`
 * point, or height below 500. The numbers are the same on every platform (CSS
 * pixels on the web, points on iOS, density-independent pixels on Android).
 */
export interface CompactDefinition {
  /** Compact below this viewport width: the effective `md` point. */
  readonly widthBelow: number;
  /** Compact below this viewport height. */
  readonly heightBelow: number;
  /** The definition as a media query list, without the `@media` keyword. */
  readonly query: string;
  /** Compact and a coarse primary pointer, without the `@media` keyword. */
  readonly coarsePointerQuery: string;
}

/** The viewport height below which a screen is compact (`spec:AST-012` FR9). */
const COMPACT_HEIGHT_BELOW = 500;

/**
 * The compact definition for a theme's width points (`spec:AST-012` FR9).
 * Pass a theme's effective width breakpoints; omit them for the defaults.
 */
export function compactDefinition(
  points: Readonly<Pick<WidthBreakpoints, 'md'>> = DEFAULT_WIDTH_BREAKPOINTS,
): CompactDefinition {
  const width = `(width < ${points.md}px)`;
  const height = `(height < ${COMPACT_HEIGHT_BELOW}px)`;
  return Object.freeze({
    widthBelow: points.md,
    heightBelow: COMPACT_HEIGHT_BELOW,
    query: `${width}, ${height}`,
    coarsePointerQuery: `${width} and (pointer: coarse), ${height} and (pointer: coarse)`,
  });
}

/** The compact definition at the default width points. */
export const DEFAULT_COMPACT_DEFINITION: CompactDefinition =
  compactDefinition();

/** Inclusive lower and exclusive upper edges for one width condition. */
export interface ThemeAdaptationWidthCondition {
  /** Match at and above this named point. */
  from?: WidthBreakpointName;
  /** Match strictly below this named point. */
  below?: WidthBreakpointName;
}

/** Closed environmental condition vocabulary. Fields are ANDed. */
export interface ThemeAdaptationCondition {
  /** Viewport-width range, using named start points. */
  width?: ThemeAdaptationWidthCondition;
  /** Primary pointing-device precision. */
  pointer?: 'coarse' | 'fine';
  /** User contrast preference. */
  contrast?: 'more' | 'less' | 'no-preference';
  /** User reduced-motion preference. */
  motion?: 'reduce' | 'no-preference';
}

/** Typography overrides inside an adaptation rule. */
export interface ThemeAdaptationTypographyConfig extends Omit<
  TypographyConfig,
  'scale'
> {
  /** Partial type scale, completed from the effective root axis. */
  scale?: Partial<NonNullable<TypographyConfig['scale']>>;
}

/** Theme values an adaptation rule may write. */
export interface ThemeAdaptationValue {
  /** Typography axis overrides, completed from root metadata. */
  typography?: ThemeAdaptationTypographyConfig;
  /** Color axis overrides, completed from root metadata. */
  color?: Partial<ColorScaleConfig>;
  /** Radius axis overrides, completed from root metadata. */
  radius?: Partial<RadiusScaleConfig>;
  /** Motion axis overrides, completed from root metadata. */
  motion?: Partial<MotionScaleConfig>;
  /** Portable semantic-token writes. */
  tokens?: Partial<Record<TokenName, TokenValue>>;
  /** Replacements for exact theme-local names enrolled by the root lineage. */
  localTokens?: Record<string, TokenValue>;
  /** Component target/style-key writes. */
  components?: ComponentStyleMap;
}

/** One ordered condition-to-value adaptation rule. */
export interface ThemeAdaptationRule {
  /** Environmental fields that must all match. */
  when: ThemeAdaptationCondition;
  /** Theme values written while the condition matches. */
  value: ThemeAdaptationValue;
}

/** Adaptation authoring input accepted by defineTheme. */
export interface ThemeAdaptations {
  /** Overrides for the five fixed width points. Configuration alone emits no CSS. */
  widthBreakpoints?: Partial<WidthBreakpoints>;
  /** Ordered condition-to-value rules. */
  rules?: ThemeAdaptationRule[];
}

// =============================================================================
// Normalized and resolved metadata
// =============================================================================

/** Validated authoring data retained for source-equivalent theme extension. */
export interface NormalizedThemeAdaptations {
  /** Effective complete width map, including defaults and inherited overrides. */
  widthBreakpoints: WidthBreakpoints;
  /** Inherited rules followed by child-authored rules, preserving order. */
  rules: ThemeAdaptationRule[];
}

/** Generative-axis metadata needed to complete partial adaptation values. */
export interface ThemeGenerativeAxes {
  typography?: TypographyConfig;
  color?: ColorScaleConfig;
  radius?: RadiusScaleConfig;
  motion?: MotionScaleConfig;
}

/** One rule lowered to concrete CSS writes. */
export interface ResolvedThemeAdaptationRule {
  /** Validated condition, retained for diagnostics. */
  when: ThemeAdaptationCondition;
  /** CSS media-query prelude without the `@media` keyword. */
  query: string;
  /** Concrete portable token writes produced by this rule. */
  tokens: Record<string, string>;
  /** Concrete theme-local token writes produced by this rule. */
  localTokens?: Record<string, string>;
  /** Concrete component writes produced by this rule. */
  components?: ComponentStyleMap;
}

// =============================================================================
// Structural validation
// =============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${path}.${key} is not supported.`);
    }
  }
}

function cloneData<T>(value: T): T {
  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    for (const item of value) {
      cloned.push(cloneData(item));
    }
    return cloned as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneData(nested)]),
    ) as T;
  }
  return value;
}

const BREAKPOINT_NAMES = new Set<string>(WIDTH_BREAKPOINT_NAMES);
const ADAPTATION_KEYS = new Set(['widthBreakpoints', 'rules']);
const RULE_KEYS = new Set(['when', 'value']);
const CONDITION_AXES = [
  'width',
  'pointer',
  'contrast',
  'motion',
] as const satisfies ReadonlyArray<keyof ThemeAdaptationCondition>;
type UnhandledConditionAxis = Exclude<
  keyof ThemeAdaptationCondition,
  (typeof CONDITION_AXES)[number]
>;
const CONDITION_KEYS: UnhandledConditionAxis extends never
  ? ReadonlySet<keyof ThemeAdaptationCondition>
  : never = new Set(CONDITION_AXES);
const WIDTH_CONDITION_KEYS = new Set(['from', 'below']);
const VALUE_KEYS = new Set([
  'typography',
  'color',
  'radius',
  'motion',
  'tokens',
  'localTokens',
  'components',
]);

function normalizeBreakpointOverrides(
  value: unknown,
  path: string,
): Partial<WidthBreakpoints> {
  assertRecord(value, path);
  assertAllowedKeys(value, BREAKPOINT_NAMES, path);
  const result: Partial<WidthBreakpoints> = {};
  for (const name of WIDTH_BREAKPOINT_NAMES) {
    const point = value[name];
    if (point === undefined) {
      continue;
    }
    if (typeof point !== 'number' || !Number.isFinite(point) || point <= 0) {
      throw new Error(
        `${path}.${name} must be a finite positive number of CSS pixels.`,
      );
    }
    result[name] = point;
  }
  return result;
}

function assertCompleteBreakpoints(
  value: unknown,
  path: string,
): WidthBreakpoints {
  const overrides = normalizeBreakpointOverrides(value, path);
  for (const name of WIDTH_BREAKPOINT_NAMES) {
    if (overrides[name] === undefined) {
      throw new Error(
        `${path}.${name} is missing from the effective breakpoint map.`,
      );
    }
  }
  return overrides as WidthBreakpoints;
}

function assertIncreasingBreakpoints(
  points: WidthBreakpoints,
  path: string,
): void {
  let previous: WidthBreakpointName | undefined;
  for (const name of WIDTH_BREAKPOINT_NAMES) {
    if (previous !== undefined && points[name] <= points[previous]) {
      throw new Error(
        `${path} must be strictly increasing: ${name} (${points[name]}) is not above ${previous} (${points[previous]}).`,
      );
    }
    previous = name;
  }
}

function normalizeCondition(
  value: unknown,
  path: string,
): ThemeAdaptationCondition {
  assertRecord(value, path);
  assertAllowedKeys(value, CONDITION_KEYS, path);
  const defined = Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined),
  );
  if (Object.keys(defined).length === 0) {
    throw new Error(`${path} must contain at least one condition.`);
  }

  const condition = cloneData(defined) as ThemeAdaptationCondition;
  if (condition.width !== undefined) {
    assertRecord(condition.width, `${path}.width`);
    assertAllowedKeys(condition.width, WIDTH_CONDITION_KEYS, `${path}.width`);
    if (
      condition.width.from === undefined &&
      condition.width.below === undefined
    ) {
      throw new Error(
        `${path}.width must contain \`from\`, \`below\`, or both.`,
      );
    }
    for (const edge of ['from', 'below'] as const) {
      const name = condition.width[edge];
      if (
        name !== undefined &&
        (typeof name !== 'string' || !BREAKPOINT_NAMES.has(name))
      ) {
        throw new Error(
          `${path}.width.${edge} must be one of ${WIDTH_BREAKPOINT_NAMES.join(', ')}.`,
        );
      }
    }
  }

  if (
    condition.pointer !== undefined &&
    condition.pointer !== 'coarse' &&
    condition.pointer !== 'fine'
  ) {
    throw new Error(`${path}.pointer must be 'coarse' or 'fine'.`);
  }
  if (
    condition.contrast !== undefined &&
    condition.contrast !== 'more' &&
    condition.contrast !== 'less' &&
    condition.contrast !== 'no-preference'
  ) {
    throw new Error(
      `${path}.contrast must be 'more', 'less', or 'no-preference'.`,
    );
  }
  if (
    condition.motion !== undefined &&
    condition.motion !== 'reduce' &&
    condition.motion !== 'no-preference'
  ) {
    throw new Error(`${path}.motion must be 'reduce' or 'no-preference'.`);
  }

  return condition;
}

function normalizeValue(value: unknown, path: string): ThemeAdaptationValue {
  assertRecord(value, path);
  assertAllowedKeys(value, VALUE_KEYS, path);
  for (const key of VALUE_KEYS) {
    const nested = value[key];
    if (nested !== undefined && !isRecord(nested)) {
      throw new Error(`${path}.${key} must be an object.`);
    }
  }
  return cloneData(value);
}

function normalizeRule(value: unknown, path: string): ThemeAdaptationRule {
  assertRecord(value, path);
  assertAllowedKeys(value, RULE_KEYS, path);
  if (!Object.prototype.hasOwnProperty.call(value, 'when')) {
    throw new Error(`${path}.when is required.`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
    throw new Error(`${path}.value is required.`);
  }
  return {
    when: normalizeCondition(value.when, `${path}.when`),
    value: normalizeValue(value.value, `${path}.value`),
  };
}

function normalizeRules(value: unknown, path: string): ThemeAdaptationRule[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of {when, value} objects.`);
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${path}[${index}] must be present.`);
    }
  }
  return value.map((rule, index) => normalizeRule(rule, `${path}[${index}]`));
}

/**
 * Merge and validate inherited plus locally-authored adaptation metadata.
 * Inherited rules retain order; child rules append.
 */
export function normalizeThemeAdaptations(
  themeName: string,
  inherited: NormalizedThemeAdaptations | undefined,
  input: ThemeAdaptations | undefined,
): NormalizedThemeAdaptations {
  const rootPath = `defineTheme("${themeName}").adaptations`;

  let inheritedPoints: WidthBreakpoints = {...DEFAULT_WIDTH_BREAKPOINTS};
  let inheritedRules: ThemeAdaptationRule[] = [];
  if (inherited !== undefined) {
    assertRecord(
      inherited,
      `defineTheme("${themeName}").extends.__adaptations`,
    );
    assertAllowedKeys(
      inherited,
      new Set(['widthBreakpoints', 'rules']),
      `defineTheme("${themeName}").extends.__adaptations`,
    );
    inheritedPoints = assertCompleteBreakpoints(
      inherited.widthBreakpoints,
      `defineTheme("${themeName}").extends.__adaptations.widthBreakpoints`,
    );
    inheritedRules = normalizeRules(
      inherited.rules,
      `defineTheme("${themeName}").extends.__adaptations.rules`,
    );
  }

  let ownPoints: Partial<WidthBreakpoints> = {};
  let ownRules: ThemeAdaptationRule[] = [];
  if (input !== undefined) {
    assertRecord(input, rootPath);
    assertAllowedKeys(input, ADAPTATION_KEYS, rootPath);
    if (input.widthBreakpoints !== undefined) {
      ownPoints = normalizeBreakpointOverrides(
        input.widthBreakpoints,
        `${rootPath}.widthBreakpoints`,
      );
    }
    if (input.rules !== undefined) {
      ownRules = normalizeRules(input.rules, `${rootPath}.rules`);
    }
  }

  const widthBreakpoints: WidthBreakpoints = {
    ...inheritedPoints,
    ...ownPoints,
  };
  assertIncreasingBreakpoints(widthBreakpoints, `${rootPath}.widthBreakpoints`);

  return {
    widthBreakpoints,
    rules: [...inheritedRules, ...ownRules],
  };
}

// =============================================================================
// Axis completion and rule resolution
// =============================================================================

function mergeRole(
  root: TypographyRole | undefined,
  rule: TypographyRole | undefined,
): TypographyRole | undefined {
  if (!root) {
    return rule;
  }
  if (!rule) {
    return root;
  }
  return {
    ...root,
    ...rule,
    weights:
      root.weights || rule.weights
        ? {...root.weights, ...rule.weights}
        : undefined,
  };
}

function assertFiniteNumber(
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function completeTypography(
  root: TypographyConfig | undefined,
  rule: ThemeAdaptationTypographyConfig,
  path: string,
): TypographyConfig {
  const writesScale =
    rule.scale !== undefined ||
    [rule.body, rule.heading, rule.code].some(
      role => role?.weight !== undefined || role?.weights !== undefined,
    );
  let scale = writesScale ? root?.scale : undefined;
  if (rule.scale !== undefined) {
    const base = rule.scale.base ?? root?.scale?.base;
    const ratio = rule.scale.ratio ?? root?.scale?.ratio;
    if (base === undefined || ratio === undefined) {
      throw new Error(
        `${path}.scale must supply both \`base\` and \`ratio\` unless the missing field exists on the effective root typography axis.`,
      );
    }
    assertFiniteNumber(base, `${path}.scale.base`);
    assertFiniteNumber(ratio, `${path}.scale.ratio`);
    scale = {base, ratio};
  } else if (writesScale && scale === undefined) {
    throw new Error(
      `${path} sets typography weights without an effective root scale. Supply \`scale.base\` and \`scale.ratio\` in the same rule.`,
    );
  }

  return {
    ...(scale ? {scale} : {}),
    body: mergeRole(root?.body, rule.body),
    heading: mergeRole(root?.heading, rule.heading),
    code: mergeRole(root?.code, rule.code),
  };
}

function completeRadius(
  root: RadiusScaleConfig | undefined,
  rule: Partial<RadiusScaleConfig>,
  path: string,
): RadiusScaleConfig {
  const base = rule.base ?? root?.base;
  const multiplier = rule.multiplier ?? root?.multiplier;
  if (base === undefined || multiplier === undefined) {
    throw new Error(
      `${path} must supply both \`base\` and \`multiplier\` unless the missing field exists on the effective root radius axis.`,
    );
  }
  assertFiniteNumber(base, `${path}.base`);
  assertFiniteNumber(multiplier, `${path}.multiplier`);
  return {base, multiplier};
}

function completeMotion(
  root: MotionScaleConfig | undefined,
  rule: Partial<MotionScaleConfig>,
  path: string,
): MotionScaleConfig {
  const fast = rule.fast ?? root?.fast;
  const medium = rule.medium ?? root?.medium;
  const ratio = rule.ratio ?? root?.ratio;
  if (fast === undefined || medium === undefined || ratio === undefined) {
    throw new Error(
      `${path} must supply \`fast\`, \`medium\`, and \`ratio\` unless each missing field exists on the effective root motion axis.`,
    );
  }
  assertFiniteNumber(fast, `${path}.fast`);
  assertFiniteNumber(medium, `${path}.medium`);
  assertFiniteNumber(ratio, `${path}.ratio`);
  const slow = rule.slow ?? root?.slow;
  if (slow !== undefined) {
    assertFiniteNumber(slow, `${path}.slow`);
  }
  const easing = rule.easing ?? root?.easing;
  return {
    fast,
    medium,
    ratio,
    ...(slow !== undefined ? {slow} : {}),
    ...(easing !== undefined ? {easing} : {}),
  };
}

function valueToThemeInput(
  themeName: string,
  ruleIndex: number,
  value: ThemeAdaptationValue,
  axes: ThemeGenerativeAxes,
): ThemeValuesInput {
  const path = `defineTheme("${themeName}").adaptations.rules[${ruleIndex}].value`;
  return {
    typography: value.typography
      ? completeTypography(
          axes.typography,
          value.typography,
          `${path}.typography`,
        )
      : undefined,
    color: value.color ? {...axes.color, ...value.color} : undefined,
    radius: value.radius
      ? completeRadius(axes.radius, value.radius, `${path}.radius`)
      : undefined,
    motion: value.motion
      ? completeMotion(axes.motion, value.motion, `${path}.motion`)
      : undefined,
    tokens: value.tokens,
    components: value.components,
  };
}

function assertConcreteLeaf(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (/\b(?:NaN|undefined)\b/.test(value)) {
      throw new Error(`${path} resolved to the invalid CSS value "${value}".`);
    }
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertConcreteLeaf(nested, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} must resolve to a concrete CSS string.`);
}

function mediaQueryForCondition(
  themeName: string,
  ruleIndex: number,
  condition: ThemeAdaptationCondition,
  points: WidthBreakpoints,
): string {
  const path = `defineTheme("${themeName}").adaptations.rules[${ruleIndex}].when`;
  const parts: string[] = [];

  if (condition.width) {
    const from = condition.width.from;
    const below = condition.width.below;
    if (
      from !== undefined &&
      below !== undefined &&
      points[from] >= points[below]
    ) {
      throw new Error(
        `${path}.width must resolve to \`from < below\`; ${from} is ${points[from]}px and ${below} is ${points[below]}px.`,
      );
    }
    if (from !== undefined) {
      parts.push(`(width >= ${points[from]}px)`);
    }
    if (below !== undefined) {
      parts.push(`(width < ${points[below]}px)`);
    }
  }
  if (condition.pointer !== undefined) {
    parts.push(`(pointer: ${condition.pointer})`);
  }
  if (condition.contrast !== undefined) {
    parts.push(`(prefers-contrast: ${condition.contrast})`);
  }
  if (condition.motion !== undefined) {
    parts.push(`(prefers-reduced-motion: ${condition.motion})`);
  }

  if (parts.length === 0) {
    throw new Error(`${path} must contain at least one concrete condition.`);
  }
  return parts.join(' and ');
}

type PointerEnvironment =
  NonNullable<ThemeAdaptationCondition['pointer']> | 'none';
type ContrastEnvironment =
  NonNullable<ThemeAdaptationCondition['contrast']> | 'custom';
type MotionEnvironment = NonNullable<ThemeAdaptationCondition['motion']>;

interface AdaptationEnvironment {
  width: number;
  pointer: PointerEnvironment;
  contrast: ContrastEnvironment;
  motion: MotionEnvironment;
}

const ENVIRONMENT_VALUES = {
  pointer: ['coarse', 'fine', 'none'],
  contrast: ['more', 'less', 'no-preference', 'custom'],
  motion: ['reduce', 'no-preference'],
} as const satisfies {
  pointer: ReadonlyArray<PointerEnvironment>;
  contrast: ReadonlyArray<ContrastEnvironment>;
  motion: ReadonlyArray<MotionEnvironment>;
};
type EnvironmentTypes = {
  pointer: PointerEnvironment;
  contrast: ContrastEnvironment;
  motion: MotionEnvironment;
};
const COMPLETE_ENVIRONMENT_VALUES: {
  [Axis in keyof EnvironmentTypes]: Exclude<
    EnvironmentTypes[Axis],
    (typeof ENVIRONMENT_VALUES)[Axis][number]
  > extends never
    ? (typeof ENVIRONMENT_VALUES)[Axis]
    : never;
} = ENVIRONMENT_VALUES;

/** Whether one normalized rule matches one representative environment cell. */
function conditionMatchesEnvironment(
  condition: ThemeAdaptationCondition,
  points: WidthBreakpoints,
  environment: AdaptationEnvironment,
): boolean {
  const from = condition.width?.from;
  if (from !== undefined && environment.width < points[from]) {
    return false;
  }
  const below = condition.width?.below;
  if (below !== undefined && environment.width >= points[below]) {
    return false;
  }
  if (
    condition.pointer !== undefined &&
    condition.pointer !== environment.pointer
  ) {
    return false;
  }
  if (
    condition.contrast !== undefined &&
    condition.contrast !== environment.contrast
  ) {
    return false;
  }
  if (
    condition.motion !== undefined &&
    condition.motion !== environment.motion
  ) {
    return false;
  }
  return true;
}

/**
 * Reject token cycles reachable in any matching adaptation-rule cascade.
 *
 * Conditions use a finite, closed vocabulary. Sampling zero and each named
 * width boundary covers every distinct width truth region; the discrete axes
 * enumerate every browser state relevant to the supported queries. For each
 * reachable match set, portable and local writes are applied in authored order
 * before checking the effective graph, so a later matching rule may
 * intentionally repair an earlier cycle just as it does in CSS.
 */
function assertNoReachableTokenCycles(
  themeName: string,
  points: WidthBreakpoints,
  rootTokens: Record<string, string>,
  rootLocalTokens: Record<string, string> | undefined,
  rules: ResolvedThemeAdaptationRule[],
): void {
  const tokenRuleIndexes = rules.flatMap((rule, index) =>
    Object.keys(rule.tokens).length > 0 ||
    (rule.localTokens && Object.keys(rule.localTokens).length > 0)
      ? [index]
      : [],
  );
  if (tokenRuleIndexes.length === 0) {
    return;
  }

  const widthEnvironments = [
    0,
    ...WIDTH_BREAKPOINT_NAMES.map(name => points[name]),
  ];
  const checkedMatchSets = new Set<string>();

  for (const width of widthEnvironments) {
    for (const pointer of COMPLETE_ENVIRONMENT_VALUES.pointer) {
      for (const contrast of COMPLETE_ENVIRONMENT_VALUES.contrast) {
        for (const motion of COMPLETE_ENVIRONMENT_VALUES.motion) {
          const environment = {width, pointer, contrast, motion};
          const matchingRuleIndexes = tokenRuleIndexes.filter(index =>
            conditionMatchesEnvironment(rules[index].when, points, environment),
          );
          if (matchingRuleIndexes.length === 0) {
            continue;
          }

          const signature = matchingRuleIndexes.join(',');
          if (checkedMatchSets.has(signature)) {
            continue;
          }
          checkedMatchSets.add(signature);

          const effective = {...rootTokens, ...rootLocalTokens};
          const relevantNames = new Set<string>();
          for (const index of matchingRuleIndexes) {
            const rule = rules[index];
            Object.assign(effective, rule.tokens, rule.localTokens);
            for (const name of Object.keys(rule.tokens)) {
              relevantNames.add(name);
            }
            for (const name of Object.keys(rule.localTokens ?? {})) {
              relevantNames.add(name);
            }
          }

          const indexes = matchingRuleIndexes.join(', ');
          const queries = matchingRuleIndexes
            .map(index => rules[index].query)
            .join('; ');
          assertNoTokenCycles(
            effective,
            `defineTheme("${themeName}").adaptations ${
              matchingRuleIndexes.length === 1 ? 'rule' : 'overlapping rules'
            } [${indexes}] (${queries})`,
            relevantNames,
          );
        }
      }
    }
  }
}

/**
 * Resolve the effective root generative metadata through a theme extension.
 * An explicitly supplied root axis replaces the inherited axis; omission inherits.
 */
export function resolveThemeGenerativeAxes(
  inherited: ThemeGenerativeAxes | undefined,
  own: ThemeGenerativeAxes,
): ThemeGenerativeAxes {
  const inheritedTypography = inherited?.typography;
  const ownTypography = own.typography;
  const resolveFamily = (
    inheritedRole: TypographyRole | undefined,
    ownRole: TypographyRole | undefined,
    followsOwnBody = false,
  ): TypographyRole | undefined => {
    const merged = mergeRole(inheritedRole, ownRole);
    if (!merged) {
      return undefined;
    }
    if (ownRole?.family) {
      return {
        ...merged,
        family: ownRole.family,
        fallbacks: ownRole.fallbacks,
      };
    }
    if (followsOwnBody) {
      return {...merged, family: undefined, fallbacks: undefined};
    }
    // A fallback without a family is inert in buildFontFamilyTokens(), so it
    // cannot replace the fallback attached to an inherited effective family.
    return {
      ...merged,
      family: inheritedRole?.family,
      fallbacks: inheritedRole?.fallbacks,
    };
  };

  let body = resolveFamily(inheritedTypography?.body, ownTypography?.body);
  let heading = resolveFamily(
    inheritedTypography?.heading,
    ownTypography?.heading,
    Boolean(ownTypography?.body?.family && !ownTypography?.heading?.family),
  );
  let code = resolveFamily(inheritedTypography?.code, ownTypography?.code);

  // Weights reach tokens only when a scale is expanded. The most recent
  // config that declares a scale owns every weight; omitted weights become the
  // expander defaults rather than resurrecting values from an earlier scale.
  const weightOwner = ownTypography?.scale
    ? ownTypography
    : inheritedTypography?.scale
      ? inheritedTypography
      : undefined;
  const applyWeights = (
    role: TypographyRole | undefined,
    owner: TypographyRole | undefined,
  ): TypographyRole | undefined =>
    role
      ? {...role, weight: owner?.weight, weights: owner?.weights}
      : undefined;
  body = applyWeights(body, weightOwner?.body);
  heading = applyWeights(heading, weightOwner?.heading);
  code = applyWeights(code, weightOwner?.code);

  const typography =
    inheritedTypography || ownTypography
      ? {
          ...inheritedTypography,
          ...ownTypography,
          scale: ownTypography?.scale ?? inheritedTypography?.scale,
          body,
          heading,
          code,
        }
      : undefined;
  // A color config regenerates its neutral ramp even when `accent` is omitted,
  // so an authored child config replaces rather than field-merges the base axis.
  const color = own.color ?? inherited?.color;
  const radius = own.radius
    ? {...inherited?.radius, ...own.radius}
    : inherited?.radius;
  const motion = own.motion
    ? {...inherited?.motion, ...own.motion}
    : inherited?.motion;

  return {
    ...(typography ? {typography} : {}),
    ...(color ? {color} : {}),
    ...(radius ? {radius} : {}),
    ...(motion ? {motion} : {}),
  };
}

/**
 * Type-scale component generation is invariant var() wiring, not scale values.
 * Keep root declarations (including authored pins) in the root cascade instead
 * of resetting them in a rule that only changes tokens. Fill missing root paths
 * for rule-only scales, and retain every authored rule leaf, even when it equals
 * the root: that write may intentionally undo an earlier matching rule.
 *
 * SYNC: expandTypeScale.ts (generateTypeScaleComponents)
 */
function omitRootTypeScaleDefaults(
  resolved: ComponentStyleMap | undefined,
  root: ComponentStyleMap | undefined,
  authored: ComponentStyleMap | undefined,
): ComponentStyleMap | undefined {
  if (!resolved || !root) {
    return resolved;
  }

  const components: ComponentStyleMap = {};
  for (const [component, rules] of Object.entries(resolved)) {
    for (const [key, styles] of Object.entries(rules)) {
      const writes = Object.fromEntries(
        Object.entries(styles).filter(
          ([property]) =>
            root[component]?.[key]?.[property] === undefined ||
            Object.hasOwn(authored?.[component]?.[key] ?? {}, property),
        ),
      );
      if (Object.keys(writes).length > 0) {
        (components[component] ??= {})[key] = writes;
      }
    }
  }
  return Object.keys(components).length > 0 ? components : undefined;
}

/** Lower ordered normalized rules to concrete CSS writes. */
export function resolveThemeAdaptationRules(
  themeName: string,
  adaptations: NormalizedThemeAdaptations,
  axes: ThemeGenerativeAxes,
  rootTokens: Record<string, string>,
  rootLocalTokens: Record<string, string> | undefined,
  rootComponents?: ComponentStyleMap,
): ResolvedThemeAdaptationRule[] | undefined {
  if (adaptations.rules.length === 0) {
    return undefined;
  }

  const resolvedRules = adaptations.rules.map((rule, index) => {
    const input = valueToThemeInput(themeName, index, rule.value, axes);
    const resolved = resolveThemeValues(
      input,
      undefined,
      // Authored adaptation values are a new surface with no legacy
      // acceptance to preserve, so a malformed token is rejected here rather
      // than emitted. The root path stays lenient for compatibility.
      // SYNC: packages/core/src/theme/resolveThemeValues.ts (resolveTokenValue)
      {strictTokens: true},
    );
    for (const [name, value] of Object.entries(resolved.tokens)) {
      assertConcreteLeaf(
        value,
        `defineTheme("${themeName}").adaptations.rules[${index}].value.tokens["${name}"]`,
      );
    }
    if (resolved.components) {
      assertConcreteLeaf(
        resolved.components,
        `defineTheme("${themeName}").adaptations.rules[${index}].value.components`,
      );
    }

    for (const name of Object.keys(rule.value.tokens ?? {})) {
      if (
        rootLocalTokens &&
        Object.prototype.hasOwnProperty.call(rootLocalTokens, name)
      ) {
        throw new Error(
          `defineTheme("${themeName}").adaptations.rules[${index}].value.tokens["${name}"] matches an enrolled theme-local declaration; write it through value.localTokens instead.`,
        );
      }
    }

    const localTokens = resolveAdaptationLocalTokens(
      themeName,
      index,
      rule.value.localTokens,
      rootLocalTokens,
    );

    return {
      when: rule.when,
      query: mediaQueryForCondition(
        themeName,
        index,
        rule.when,
        adaptations.widthBreakpoints,
      ),
      tokens: resolved.tokens,
      localTokens,
      components: input.typography?.scale
        ? omitRootTypeScaleDefaults(
            resolved.components,
            rootComponents,
            rule.value.components,
          )
        : resolved.components,
    };
  });

  assertNoReachableTokenCycles(
    themeName,
    adaptations.widthBreakpoints,
    rootTokens,
    rootLocalTokens,
    resolvedRules,
  );
  return resolvedRules;
}
