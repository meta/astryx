// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.definitions` leaf (AST-084 FR6): every Astryx icon definition,
 * with how many bundled templates use it and whether a set maps it.
 *
 * @output the `icon.definitions` envelope
 * @position api/icon/definitions — dispatched by ../icon.mjs
 */

import {
  astryxIconDefinitions,
  findLocalIconSet,
  loadIconSets,
  templateIconMeanings,
} from '../_adapter.mjs';
import {oneNamedSet} from '../_records.mjs';

/**
 * List every Astryx icon definition.
 * @param {{cwd: string, set?: string}} options
 * @returns {Promise<import('../icon.type.mjs').IconDefinitionsResponse>}
 */
export async function iconDefinitions({cwd, set: selector}) {
  const [checked, meanings] = await Promise.all([
    checkedSet(cwd, selector),
    templateIconMeanings(),
  ]);
  const templates = new Map(
    meanings.map(each => [each.definition, each.templates]),
  );
  return {
    type: 'icon.definitions',
    data: {
      set: checked?.key ?? null,
      definitions: astryxIconDefinitions().definitions.map(({doc}) => ({
        name: doc.name,
        builtIn: doc.builtIn === true,
        description: doc.description,
        words: doc.words,
        templates: templates.get(doc.name) ?? 0,
        ...(checked
          ? {
              mapped: Object.prototype.hasOwnProperty.call(
                checked.map,
                doc.name,
              ),
            }
          : {}),
      })),
    },
  };
}

/**
 * The set the definitions are checked against: the one `selector` names, in
 * the icon-set package the command runs in and then among the installed
 * sets; else the project's main set; else the only set of the icon-set
 * package. Null when there is none, or when the project config does not
 * load and the command runs outside an icon-set package.
 * @param {string} cwd
 * @param {string | undefined} selector
 * @returns {Promise<{key: string, map: Record<string, string>} | null>}
 */
async function checkedSet(cwd, selector) {
  /** @param {{package: string, name: string, data: {map?: Record<string, string>}}} set */
  const entry = set => ({
    key: `${set.package}/${set.name}`,
    map: set.data.map ?? {},
  });
  const local = await findLocalIconSet(cwd, selector).catch(() => null);
  if (selector != null && local) return entry(local.set);
  if (selector != null) {
    const {sets, withdrawn} = await loadIconSets(cwd);
    return entry(oneNamedSet(sets, withdrawn, selector));
  }
  // A project config this CLI cannot load names no set: the list still
  // answers, unchecked or checked against the local set.
  const loaded = await loadIconSets(cwd).catch(() => null);
  const choice = loaded?.choice;
  if (choice?.status === 'selected' && choice.set) return entry(choice.set);
  return local ? entry(local.set) : null;
}
