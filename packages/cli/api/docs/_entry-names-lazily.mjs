// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file {@link docsRoutesLazily}: the docs routes the lookup commands'
 * not-found hint names, with their module (./_entry-names.mjs) loaded only
 * when the hint works them out: when its name index is made, or where none is
 * kept, for a name whose last segment can end a route.
 *
 * @input a project folder and the integrations it loads
 * @output the routes, in tree order
 * @position api/docs: given by the component, docs, hook and template
 *   adapters to foundation/suggest/other-command.mjs as its `docsRoutes`
 */

/**
 * Every route `astryx docs <route>` reads in the project at `cwd`
 * (./_entry-names.mjs docsRoutesNow).
 * @param {string} cwd
 * @param {Parameters<typeof import('./_entry-names.mjs').docsRoutesNow>[1]} integrations
 * @returns {Promise<string[]>}
 */
export async function docsRoutesLazily(cwd, integrations) {
  const {docsRoutesNow} = await import('./_entry-names.mjs');
  return docsRoutesNow(cwd, integrations);
}
