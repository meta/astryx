// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The closed list of platform steps a base can serve.
 * @input nothing
 * @output BASE_STEPS, BASE_CAPABILITIES, and helpers that read a step name
 * @position foundation/bases — the step vocabulary that command docs, base
 *   declarations, the requirement check, and help share
 */

export {
  BASE_CAPABILITIES,
  BASE_STEPS,
} from '../../authoring/integration/base-steps.mjs';
import {BASE_STEPS} from '../../authoring/integration/base-steps.mjs';

/**
 * @param {string} value
 * @returns {value is import('../../authoring/integration/type').BaseStep}
 */
export function isBaseStep(value) {
  return /** @type {readonly string[]} */ (BASE_STEPS).includes(value);
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
 * The function name an adapter module exports for a step.
 * @param {string} step
 * @returns {string}
 */
export function exportOf(step) {
  return step.slice(step.indexOf('.') + 1);
}
