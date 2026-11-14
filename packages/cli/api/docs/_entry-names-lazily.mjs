// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file {@link docsEntryNamesLazily}: the docs routes the lookup commands'
 * not-found hint names, with their module (./_entry-names.mjs) loaded only
 * when the hint asks for them: for a name whose last segment can end a route.
 *
 * @input a project folder and the integrations it loads
 * @output the routes, in tree order
 * @position api/docs: given by the component, hook and template adapters to
 *   foundation/suggest/other-command.mjs as its `docsNames`
 */

/**
 * Every route `astryx docs <route>` reads in the project at `cwd`
 * (./_entry-names.mjs docsEntryNames).
 * @param {string} cwd
 * @param {Parameters<typeof import('./_entry-names.mjs').docsEntryNames>[1]} integrations
 * @returns {Promise<string[]>}
 */
export async function docsEntryNamesLazily(cwd, integrations) {
  const {docsEntryNames} = await import('./_entry-names.mjs');
  return docsEntryNames(cwd, integrations);
}
