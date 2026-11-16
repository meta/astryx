// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The installed CLI's imports of its own modules, resolved by their
 * path in its folder.
 *
 * @input `ownModuleHooks(root)`, from the kept gathers' recorder
 *   (gather-cache.mjs), which registers them before its own hooks.
 * @output Module hooks whose resolve step answers a relative `.mjs` import
 *   between two of the CLI's own modules with that module's path in the
 *   CLI's folder; every other import goes on to the next resolver.
 * @position The build id stands for the installed CLI's own files (AST-081
 *   FR7), so their imports need no check on disk. Installed only where the
 *   recorder installs its hooks, never under Yarn Plug'n'Play.
 */

/**
 * Whether `url` names a file in the CLI's folder, outside the node_modules
 * folder inside it.
 * @param {string} url
 * @param {string} root - the CLI folder's file URL, ending in `/`
 * @returns {boolean}
 */
function isOwn(url, root) {
  return url.startsWith(root) && !url.startsWith(`${root}node_modules/`);
}

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
  if (parent === undefined || !isOwn(parent, root)) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (!specifier.endsWith('.mjs') || /[%?#]/.test(specifier)) return null;
  const url = new URL(specifier, parent).href;
  return isOwn(url, root) ? url : null;
}

/**
 * Module hooks that resolve the CLI's imports of its own modules by path.
 * Registered before any other hook, they sit at the end of the resolve
 * chain, so every hook registered after them still sees each import.
 * @param {string} root - the CLI folder's real file URL, ending in `/`
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
