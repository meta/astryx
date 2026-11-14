// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The closed, append-only list of platform steps a base can serve.
 * @input nothing
 * @output BASE_STEPS, BASE_CAPABILITIES, STEP_CALLERS, and helpers that
 *   read a step name or a manifest's adapters
 * @position foundation/bases — the step vocabulary that base declarations,
 *   the requirement check, and help share. The authoring schemas check only
 *   a step's shape; a test holds every command declaration to this list.
 */

/**
 * Every step, as `<capability>.<step>`. A shipped step keeps its inputs,
 * outputs, and meaning.
 * @type {readonly ['themes.targets', ...import('../../authoring/integration/type').BaseStep[]]}
 */
export const BASE_STEPS = Object.freeze([
  'themes.targets',
  'themes.compile',
  'themes.appModule',
  'themes.template',
  'themes.scaffold',
  'themes.checks',
  'templates.skeleton',
  'templates.standalonePage',
  'render.page',
  'render.reverse',
  'icons.appModule',
  'setup.guide',
]);

/**
 * Each step a command calls on a base other than Core, with the commands
 * that call it. A base serves a step only to these commands, whatever else
 * it declares: any other command that needs the step runs only on Core.
 * @type {Readonly<Partial<Record<import('../../authoring/integration/type').BaseStep, readonly string[]>>>}
 */
export const STEP_CALLERS = Object.freeze({
  'themes.targets': ['theme targets', 'experimental theme targets'],
  'themes.compile': ['theme build', 'experimental theme compile'],
  'themes.appModule': [
    'theme add',
    'theme use',
    'theme remove',
    'experimental theme add',
    'experimental theme use',
    'experimental theme remove',
  ],
});

/**
 * Does `command` call `step` on a base other than Core?
 * @param {string} command the command path, such as `theme build`
 * @param {string} step
 * @returns {boolean}
 */
export function callsStep(command, step) {
  return (
    /** @type {Record<string, readonly string[] | undefined>} */ (STEP_CALLERS)[
      step
    ]?.includes(command) ?? false
  );
}

/**
 * The capability a step belongs to.
 * @param {string} step
 * @returns {string}
 */
export function capabilityOf(step) {
  return step.split('.')[0];
}

/**
 * The capabilities a base declares one adapter for, in list order.
 * @type {readonly import('../../authoring/integration/type').BaseCapability[]}
 */
export const BASE_CAPABILITIES = Object.freeze(
  /** @type {import('../../authoring/integration/type').BaseCapability[]} */ ([
    ...new Set(BASE_STEPS.map(capabilityOf)),
  ]),
);

/**
 * @param {string} value
 * @returns {value is import('../../authoring/integration/type').BaseStep}
 */
export function isBaseStep(value) {
  return /** @type {readonly string[]} */ (BASE_STEPS).includes(value);
}

/**
 * The function name an adapter module exports for a step.
 * @param {string} step
 * @returns {string}
 */
export function exportOf(step) {
  return step.slice(step.indexOf('.') + 1);
}

/**
 * The keys of a raw integration manifest's `base.adapters` that name no
 * capability this CLI knows, as `base.adapters.<capability>`. Such an adapter
 * is ignored, so a newer base still loads, and a typo is reported the way an
 * unknown manifest key is.
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function unknownCapabilityKeys(manifest) {
  if (manifest == null || typeof manifest !== 'object') return [];
  const adapters = /** @type {{base?: {adapters?: unknown}}} */ (manifest).base
    ?.adapters;
  if (adapters == null || typeof adapters !== 'object') return [];
  return Object.keys(adapters)
    .filter(
      capability =>
        !(/** @type {readonly string[]} */ (BASE_CAPABILITIES)).includes(capability),
    )
    .map(capability => `base.adapters.${capability}`);
}
