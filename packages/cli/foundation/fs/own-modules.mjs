// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The installed CLI's imports of its own modules, resolved by their
 * path in its folder.
 *
 * @input `ownModuleHooks(root)`, from the kept gathers' recorder
 *   (gather-cache.mjs), which registers them just before its own hooks.
 * @output Module hooks whose resolve step answers a relative `.mjs` import
 *   between two of the CLI's own modules with that module's path in the
 *   CLI's folder; every other import goes on to the next resolver.
 * @position The build id stands for the installed CLI's own files (AST-081
 *   FR7), so Node need not check that each one exists and where it really
 *   lives. Installed only where the recorder installs its hooks, never under
 *   Yarn Plug'n'Play.
 */

import {isCliBuildFile} from './paths.mjs';

/**
 * The URL of the CLI module `specifier` names from `parent`, when both are
 * the CLI's own; else null. A specifier with an escape, a query or a hash
 * goes to Node, which checks it.
 * @param {string} specifier
 * @param {string | undefined} parent - the importing module's URL
 * @param {string} root - the CLI folder's file URL, ending in `/`
 * @returns {string | null}
 */
export function ownModuleUrl(specifier, parent, root) {
  if (parent === undefined || !isCliBuildFile(parent, root, '/')) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (!specifier.endsWith('.mjs') || /[%?#]/.test(specifier)) return null;
  const url = new URL(specifier, parent).href;
  return isCliBuildFile(url, root, '/') ? url : null;
}

/**
 * Module hooks that resolve the CLI's imports of its own modules by path.
 * Registered just before the recorder's hooks, they sit below them in the
 * resolve chain, so the recorder still sees each import.
 * @param {string} root - the CLI folder's file URL, ending in `/`
 */
export function ownModuleHooks(root) {
  return {
    /**
     * @param {string} specifier
     * @param {{parentURL?: string}} context
     * @param {(specifier: string, context: any) => any} nextResolve
     */
    resolve(specifier, context, nextResolve) {
      const url = ownModuleUrl(specifier, context.parentURL, root);
      return url === null
        ? nextResolve(specifier, context)
        : {url, format: 'module', shortCircuit: true};
    },
  };
}
