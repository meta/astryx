// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hook.detail.params leaf — the parameters table for one hook.
 *
 * Reuses the shared hook resolver (see ../../_adapter.mjs) and projects just the
 * resolved doc's `params` array into the `hook.detail.params` envelope.
 * Byte-for-byte identical to the flat command's `--params` branch.
 *
 * @input  hook name + { cwd, zh, lang }
 * @output HookDetailParamsResponse ({ type: 'hook.detail.params', data: HookParamDoc[] })
 * @position api/hook/detail/params/params.mjs — dispatched from ../../hook.mjs
 */

import {CORE_PACKAGE, resolveCoreDir, resolveHookDoc} from '../../_adapter.mjs';

/**
 * @param {string} name
 * @param {{cwd?: string, zh?: boolean, lang?: string|null}} [options]
 * @returns {Promise<import('../../hook.type.mjs').HookDetailParamsResponse>}
 */
export async function params(name, {cwd = process.cwd(), zh = false, lang = null} = {}) {
  const coreDir = resolveCoreDir(cwd);
  const docs = await resolveHookDoc(coreDir, name, {zh, lang});
  return {type: 'hook.detail.params', package: CORE_PACKAGE, data: docs.params || []};
}
