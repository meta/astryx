// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file When the environment turns update notices off (spec AST-081 FR6,
 * FR10): the standard `CI` variable, which continuous integration services
 * set, and `NO_UPDATE_NOTIFIER`, the variable command-line tools share to
 * silence update notices (update-notifier, the Vercel CLI). Astryx defines
 * neither; it reads each for its shared meaning only (`spec:AST-017` FR14).
 *
 * @input  the environment
 * @output whether to skip the update check and every update notice
 * @position foundation/release — read by global-state.mjs and notices.mjs.
 */

/**
 * Whether `CI` is set to a value that means yes: present, and not empty,
 * `0`, or `false`, as continuous integration detection usually reads it.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isCi(env) {
  const value = env.CI;
  return (
    value !== undefined &&
    value !== '' &&
    value !== '0' &&
    value.toLowerCase() !== 'false'
  );
}

/**
 * Whether update checks and notices are off in this environment: in
 * continuous integration, or with `NO_UPDATE_NOTIFIER` set to any value.
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function updateNoticesOff(env = process.env) {
  return isCi(env) || env.NO_UPDATE_NOTIFIER !== undefined;
}
