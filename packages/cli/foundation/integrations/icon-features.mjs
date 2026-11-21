// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one gate every icon surface reads: whether icon features are on
 *   in a project.
 * @input A loaded project's config and loaded integrations.
 * @output `iconFeatureGate(project)`: on, and why, or off.
 *   `ICON_FEATURES_RELEASED`: the release switch.
 * @position Read by foundation/config/project.mjs (`iconSets()`, the
 *   integration checks, and the docs catalog), and by discover, doctor,
 *   integration validate, upgrade, and search's icons block. While the switch is off, a
 *   project with no icon-set package and no `experimental.iconSet` reads no
 *   icon feature, so its output stays as it is without them.
 */

/**
 * The release switch. While it is false, icon features are on only in a
 * project that installs an icon-set package or sets `experimental.iconSet`.
 * Set it to true to turn them on in every project.
 */
export const ICON_FEATURES_RELEASED = false;

/**
 * @typedef {object} IconFeatureGate
 * @property {boolean} on whether every icon surface reads icon sets
 * @property {'released' | 'iconSet' | 'pack' | null} reason why they are on:
 *   the release switch, the project's `experimental.iconSet`, or an installed
 *   icon-set package; null when off
 */

/**
 * Whether icon features are on in a project, and why. They are on when the
 * release switch is on, when astryx.config sets `experimental.iconSet`, or
 * when an installed integration declares an `experimental.iconSets` root.
 * The package being authored in the current folder (`__local`) is not
 * installed: its own sets turn nothing on there.
 * A project that cannot be read has them off, unless they are released.
 * @param {{config?: {experimental?: {iconSet?: unknown}}, loadedIntegrations?: ReadonlyArray<{iconSets?: unknown, __local?: unknown, __loadError?: unknown, __providerConflict?: unknown} | null | undefined>} | null | undefined} project
 * @returns {IconFeatureGate}
 */
export function iconFeatureGate(project) {
  if (ICON_FEATURES_RELEASED) return {on: true, reason: 'released'};
  if (project?.config?.experimental?.iconSet) {
    return {on: true, reason: 'iconSet'};
  }
  const packInstalled = (project?.loadedIntegrations ?? []).some(
    integration =>
      Boolean(integration?.iconSets) &&
      !integration?.__local &&
      !integration?.__loadError &&
      !integration?.__providerConflict,
  );
  return packInstalled ? {on: true, reason: 'pack'} : {on: false, reason: null};
}
