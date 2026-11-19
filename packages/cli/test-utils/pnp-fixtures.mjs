// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stand-ins for Yarn's Plug'n'Play runtime: the `pnpapi` module that a
 * process inside the runtime can require, and the `.pnp.cjs` file that Yarn
 * writes at a project root. The packages live outside any node_modules, as
 * Yarn keeps them, in folders the test names. One workspace holds every folder
 * under the project root and depends on each package named.
 * @input a project root, and a map of package names to folders
 * @output fixture files
 * @position packages/cli/test-utils — used by the PnP tests of paths,
 *   package-manager, the hand-off, and the global and project rows.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The CommonJS source of a stand-in runtime API for `root`.
 * @param {string} root the project root
 * @param {Record<string, string>} packages name -> package folder
 * @returns {string}
 */
function apiSource(root, packages) {
  return `const path = require('node:path');
const root = ${JSON.stringify(path.resolve(root))};
const packages = ${JSON.stringify(packages)};
const workspace = {name: 'app', reference: 'workspace:.'};
const api = {
  findPackageLocator(location) {
    const relative = path.relative(root, location);
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : workspace;
  },
  getPackageInformation(locator) {
    if (locator !== workspace) return null;
    const dependencies = Object.keys(packages).map(name => [name, 'npm:0.0.0']);
    return {packageLocation: root + path.sep, packageDependencies: new Map(dependencies)};
  },
  resolveToUnqualified(name, issuer) {
    if (!api.findPackageLocator(issuer) || !(name in packages)) {
      const error = new Error(name);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }
    return packages[name];
  },
};
module.exports = api;
`;
}

/**
 * Make this process act as one inside a Plug'n'Play runtime for `root`: set
 * `process.versions.pnp`, and put a requirable `pnpapi` in `root`'s
 * node_modules. The caller deletes `process.versions.pnp` again after the test.
 * @param {string} root a project folder; lookups from it find the API
 * @param {Record<string, string>} packages name -> package folder
 * @returns {string} `root`
 */
export function usePnpApi(root, packages) {
  const api = path.join(root, 'node_modules', 'pnpapi');
  fs.mkdirSync(api, {recursive: true});
  fs.writeFileSync(
    path.join(api, 'package.json'),
    JSON.stringify({name: 'pnpapi', version: '1.0.0', main: 'index.js'}),
  );
  fs.writeFileSync(path.join(api, 'index.js'), apiSource(root, packages));
  Object.defineProperty(process.versions, 'pnp', {
    value: '3',
    configurable: true,
  });
  return root;
}

/**
 * Write a stand-in `.pnp.cjs` at `root`. Preloaded with `--require`, as Yarn
 * preloads it, it sets `process.versions.pnp` and makes `pnpapi` resolve to
 * itself.
 * @param {string} root the project root
 * @param {Record<string, string>} packages name -> package folder
 * @returns {string} the file
 */
export function writePnpRuntime(root, packages) {
  const file = path.join(root, '.pnp.cjs');
  const setup = `api.setup = () => {
  process.versions.pnp = '3';
  const Module = require('node:module');
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return request === 'pnpapi' ? __filename : resolve.call(this, request, ...rest);
  };
};
if (module.parent && module.parent.id === 'internal/preload') api.setup();
`;
  fs.writeFileSync(file, apiSource(root, packages) + setup);
  return file;
}
