// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The closed, append-only list of platform steps a base can serve.
 * @input nothing
 * @output BASE_STEPS and BASE_CAPABILITIES
 * @position authoring/integration — shared by the command-doc schema and the
 *   CLI's requirement check
 */

/**
 * Every step, as `<capability>.<step>`. A shipped step keeps its inputs,
 * outputs, and meaning.
 * @type {readonly ['themes.targets', ...import('./type').BaseStep[]]}
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
 * The capabilities a base declares one adapter for, in list order.
 * @type {readonly import('./type').BaseCapability[]}
 */
export const BASE_CAPABILITIES = Object.freeze(
  /** @type {import('./type').BaseCapability[]} */ ([
    ...new Set(BASE_STEPS.map(step => step.slice(0, step.indexOf('.')))),
  ]),
);
