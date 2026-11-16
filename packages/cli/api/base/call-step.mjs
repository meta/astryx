// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Call one step of the active base's adapter and check its result.
 * @input the base, the adapter modules the requirement check loaded, a step,
 *   its input, and the step's output check
 * @output the step's value with its warnings and notices, or an AstryxError:
 *   the command's own code for a typed failure, ERR_BASE_ADAPTER for a throw
 *   or a result that breaks the contract
 * @position api/base — the one place a command reaches a base's code
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {findPackageRoot} from '../../foundation/fs/paths.mjs';
import {projectUsesTypeScript} from '../../foundation/config/theme-state.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {capabilityOf, exportOf} from '../../foundation/bases/steps.mjs';

const FAILURE_CODES = ['invalid-input', 'unsupported', 'not-found', 'conflict'];

/**
 * The CLI error codes a command maps a step's typed failure to.
 * @typedef {object} FailureCodes
 * @property {string} invalid for `invalid-input`
 * @property {string} notFound for `not-found`
 */

/**
 * @typedef {object} StepCall
 * @property {{name: string, dir: string | null, version: string | null, adapters: Record<string, string>}} base
 * @property {Record<string, Record<string, unknown>>} adapters the loaded
 *   modules, by capability
 * @property {string} cwd
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
export function isStringList(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * The context every step receives. `read` is confined to the project and the
 * base package.
 * @param {StepCall} call
 * @returns {import('../../authoring/integration/adapter').StepContext}
 */
function stepContext({base, cwd}) {
  const projectDir = findPackageRoot(cwd) ?? null;
  const roots = [projectDir, base.dir]
    .filter(dir => dir != null)
    .map(dir => path.resolve(/** @type {string} */ (dir)));
  return {
    cwd,
    projectDir,
    base: {
      name: base.name,
      dir: /** @type {string} */ (base.dir),
      version: base.version,
    },
    cliVersion: cliVersion(),
    typescript: projectDir != null && projectUsesTypeScript(projectDir),
    async read(file) {
      const resolved = path.resolve(projectDir ?? cwd, String(file));
      const inside = roots.some(root => {
        const rel = path.relative(root, resolved);
        return !rel.startsWith('..') && !path.isAbsolute(rel);
      });
      if (!inside) return null;
      try {
        return await fs.promises.readFile(resolved, 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/**
 * Call one step. The requirement check has already proved the module loads
 * and exports the step.
 * @template T
 * @param {StepCall} call
 * @param {string} step such as `themes.compile`
 * @param {unknown} input
 * @param {{codes: FailureCodes, check: (value: Record<string, unknown>) => string | null}} contract
 *   `check` returns what is wrong with the value, or null
 * @returns {Promise<{value: T, warnings: string[], notices: string[]}>}
 */
export async function callStep(call, step, input, {codes, check}) {
  const capability = capabilityOf(step);
  const module = call.base.adapters[capability];
  const broken = (/** @type {string} */ why) =>
    new AstryxError(
      `The active base ${call.base.name} broke its ${step} step in ${module}: ${why}`,
      undefined,
      ERROR_CODES.ERR_BASE_ADAPTER,
    );
  const fn = call.adapters[capability]?.[exportOf(step)];
  if (typeof fn !== 'function') throw broken('the step is not a function.');
  /** @type {unknown} */
  let result;
  try {
    result = await fn(input, stepContext(call));
  } catch (error) {
    throw broken(
      `it threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isObject(result) || typeof result.ok !== 'boolean') {
    throw broken('it returned something that is not {ok: true, value} or {ok: false, failure}.');
  }
  if (result.ok === false) {
    const failure = result.failure;
    if (
      !isObject(failure) ||
      !FAILURE_CODES.includes(/** @type {string} */ (failure.code)) ||
      typeof failure.message !== 'string'
    ) {
      throw broken('it failed without a failure {code, message}.');
    }
    const at = isObject(failure.at) && typeof failure.at.file === 'string'
      ? ` (${failure.at.file}${typeof failure.at.line === 'number' ? `:${failure.at.line}` : ''})`
      : '';
    const code =
      failure.code === 'invalid-input'
        ? codes.invalid
        : failure.code === 'not-found'
          ? codes.notFound
          : failure.code === 'conflict'
            ? ERROR_CODES.ERR_FILE_EXISTS
            : ERROR_CODES.ERR_BASE_CAPABILITY;
    throw new AstryxError(
      `${failure.message}${at}`,
      typeof failure.fix === 'string'
        ? [{name: failure.fix, reason: `the fix ${call.base.name} names`}]
        : undefined,
      code,
    );
  }
  if (!isObject(result.value)) throw broken('its value is not an object.');
  const wrong = check(result.value);
  if (wrong) throw broken(wrong);
  return {
    value: /** @type {T} */ (result.value),
    warnings: isStringList(result.warnings) ? result.warnings : [],
    notices: isStringList(result.notices) ? result.notices : [],
  };
}
