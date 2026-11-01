// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.list` leaf (AST-084 FR7): every installed icon set with the
 * icon definitions its `map` covers, the project's set, and the sets
 * withdrawn with why.
 *
 * @output the `icon.list` envelope
 * @position api/icon/list — dispatched by ../icon.mjs
 */

import {astryxIconDefinitions, loadIconSets} from '../_adapter.mjs';

/**
 * List the installed icon sets.
 * @param {{cwd: string}} options
 * @returns {Promise<import('../icon.type.mjs').IconListResponse>}
 */
export async function iconList({cwd}) {
  const {sets, withdrawn, choice} = await loadIconSets(cwd);
  const astryx = astryxIconDefinitions().definitions.map(each => each.doc);
  const builtIn = astryx.filter(doc => doc.builtIn).map(doc => doc.name);
  return {
    type: 'icon.list',
    data: {
      status: choice.status,
      projectSet: choice.set
        ? `${choice.set.package}/${choice.set.name}`
        : null,
      reason: choice.reason,
      sets: sets.map(set => {
        const mapped = new Set(Object.keys(set.data.map ?? {}));
        return {
          name: set.name,
          displayName: set.displayName,
          description: set.description,
          package: set.package,
          license: set.license,
          iconCount: set.data.icons.length,
          default: set.data.default ?? null,
          variants: set.data.variants ?? null,
          coverage: {
            builtIn: {
              mapped: builtIn.filter(name => mapped.has(name)).length,
              total: builtIn.length,
              missing: builtIn.filter(name => !mapped.has(name)),
            },
            astryx: {
              mapped: astryx.filter(doc => mapped.has(doc.name)).length,
              total: astryx.length,
            },
            own: set.definitions.map(each => each.doc.name),
          },
          project: set === choice.set,
        };
      }),
      withdrawn: withdrawn.map(each => ({
        name: each.name,
        package: each.package,
        reason: each.reason,
      })),
    },
  };
}
