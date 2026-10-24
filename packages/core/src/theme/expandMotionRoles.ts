// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expandMotionRoles.ts
 * @input The motion axis of a theme: the optional scale (fast, medium, ratio,
 *   slow, easing) and the motion roles it retunes (springs, durations,
 *   curves)
 * @output MotionConfig, motionScaleOf (the scale part, validated), and
 *   expandMotionRoles (one CSS custom property per role the theme sets)
 * @position Theme utility; consumed by resolveThemeValues for the root theme
 *   and for each adaptation rule
 *
 * A motion role is a spring, duration or curve of a motion table, named by its
 * table path (`sheet.present`, `springs.navigationPush`,
 * `timing.curves.easeInOut`; see motion/roles.ts). A theme writes a role's CSS
 * variable only when it sets the role; an empty variable means the table's
 * measured value, so a theme never has to restate the defaults.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/expandMotionRoles.test.ts
 * - /packages/core/src/theme/defineTheme.ts (`DefineThemeInput.motion`)
 * - /packages/cli/assets/theme.template.ts (the annotated field reference)
 * - /packages/cli/assets/docs/motion.doc.mjs
 */

import {
  formatMotionRoleValue,
  isMotionRoleId,
  motionRole,
  motionRoleVariable,
  type MotionCurvePoints,
  type MotionRoleKind,
} from '../motion/roles';
import type {SpringDescription} from '../motion/spring';
import type {MotionScaleConfig} from './expandMotionScale';

/** The motion roles a theme retunes, by kind. Keys are role ids. */
export interface MotionRoleValues {
  /**
   * Springs by role, in any vocabulary: `{response, dampingRatio}`,
   * `{duration, bounce}` or `{mass?, stiffness, damping}`.
   */
  springs?: Readonly<Record<string, SpringDescription>>;
  /** Durations by role, in milliseconds. */
  durations?: Readonly<Record<string, number>>;
  /** Cubic-bézier curves by role, `[x1, y1, x2, y2]`. */
  curves?: Readonly<Record<string, MotionCurvePoints>>;
}

/**
 * A theme's motion axis: the duration scale (all of `fast`, `medium` and
 * `ratio`, or none of them) and the motion roles it retunes.
 */
export interface MotionConfig
  extends Partial<MotionScaleConfig>, MotionRoleValues {}

const ROLE_GROUPS = [
  ['springs', 'spring'],
  ['durations', 'duration'],
  ['curves', 'curve'],
] as const satisfies ReadonlyArray<
  readonly [keyof MotionRoleValues, MotionRoleKind]
>;

/** Whether a motion config writes any duration-scale field. */
export function hasMotionScale(config: Partial<MotionScaleConfig>): boolean {
  return (
    config.fast !== undefined ||
    config.medium !== undefined ||
    config.ratio !== undefined ||
    config.slow !== undefined ||
    config.easing !== undefined
  );
}

/**
 * The duration-scale part of a motion config, or undefined when it writes
 * none. A scale must give `fast`, `medium` and `ratio` together.
 */
export function motionScaleOf(
  config: MotionConfig | undefined,
  path: string,
): MotionScaleConfig | undefined {
  if (config === undefined || !hasMotionScale(config)) {
    return undefined;
  }
  const {fast, medium, ratio, slow, easing} = config;
  if (fast === undefined || medium === undefined || ratio === undefined) {
    throw new Error(
      `${path} must supply \`fast\`, \`medium\`, and \`ratio\` together, or none of them to retune only motion roles.`,
    );
  }
  return {
    fast,
    medium,
    ratio,
    ...(slow !== undefined ? {slow} : {}),
    ...(easing !== undefined ? {easing} : {}),
  };
}

/** Whether a motion config retunes any motion role. */
export function hasMotionRoleValues(config: MotionRoleValues): boolean {
  return ROLE_GROUPS.some(
    ([group]) =>
      config[group] !== undefined && Object.keys(config[group]).length > 0,
  );
}

/**
 * The CSS custom properties for the roles a motion config sets, e.g.
 * `{'--motion-sheet-present': '0.5s 0.15'}`. Throws, naming the role, on a
 * malformed id, a value of the wrong kind, or a role whose registered table
 * holds another kind.
 */
export function expandMotionRoles(
  config: MotionRoleValues,
  path: string,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [group, kind] of ROLE_GROUPS) {
    const values = config[group];
    if (values === undefined) {
      continue;
    }
    if (
      values === null ||
      typeof values !== 'object' ||
      Array.isArray(values)
    ) {
      throw new Error(`${path}.${group} must map role ids to values.`);
    }
    for (const [id, value] of Object.entries(values)) {
      const location = `${path}.${group}["${id}"]`;
      if (!isMotionRoleId(id)) {
        throw new Error(
          `${location}: a motion role is named by its table path, such as "sheet.present" or "springs.navigationPush".`,
        );
      }
      const registered = motionRole(id);
      if (registered !== undefined && registered.kind !== kind) {
        throw new Error(
          `${location}: "${id}" is a ${registered.kind}; set it under the matching group.`,
        );
      }
      const variable = motionRoleVariable(id);
      try {
        tokens[variable] = formatMotionRoleValue(kind, value);
      } catch (error) {
        throw new Error(
          `${location}: ${error instanceof Error ? error.message : String(error)}.`,
          {cause: error},
        );
      }
    }
  }
  return tokens;
}
