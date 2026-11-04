// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.map` leaf (AST-084 FR13): register which icon of the set being
 * authored draws one icon definition, or remove that entry.
 *
 * @output the `icon.map` envelope
 * @position api/icon/map — dispatched by the `experimental icon map` command
 */

import * as path from 'node:path';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  authoring,
  closestNames,
  findLocalIconSet,
  mappableDefinitions,
  refuseOutsideProject,
  writeGeneratedIcons,
  writeIconSetData,
  definitionNameOf,
  iconIdIn,
  iconsWithWord,
} from '../_adapter.mjs';
import {passed, refuseIgnoredPairs} from '../_options.mjs';

/**
 * Set `map[definition] = icon` in the set's data file, or remove the entry.
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string | undefined} definition omitted with `pairs`
 * @param {string | undefined} icon an icon in the set: its id, its export name in any case, or another name its library exports it as; omit with `remove`
 * @param {import('../icon.type.mjs').IconMapOptions} [options]
 * @returns {Promise<import('../icon.type.mjs').IconMapResponse | import('../icon.type.mjs').IconMapManyResponse>}
 */
export async function iconMap(definition, icon, options = {}) {
  const {cwd = process.cwd(), set: selector, remove = false, pairs} = options;
  refuseOutsideProject(cwd, 'experimental icon map', 'the icon-set package');
  // `--pairs` names every entry itself, and `--remove` names no icon
  // (spec:AST-042 FR5).
  refuseIgnoredPairs(
    {
      'a definition': passed(definition),
      'an icon': passed(icon),
      '--remove': passed(remove),
      '--pairs': passed(pairs),
    },
    [
      ['--pairs', 'a definition'],
      ['--pairs', 'an icon'],
      ['--pairs', '--remove'],
      ['--remove', 'an icon'],
    ],
  );
  if (pairs != null) {
    return authoring(() => mapMany({cwd, selector, pairs}));
  }
  return authoring(async () => {
    if (typeof definition !== 'string' || definition.trim() === '') {
      throw new AstryxError(
        'Name the icon definition to map',
        [
          {
            name: 'astryx docs cli/experimental/icon-definitions',
            reason: 'every icon definition',
          },
        ],
        ERROR_CODES.ERR_MISSING_ARGUMENT,
      );
    }
    if (!remove && (typeof icon !== 'string' || icon.trim() === '')) {
      throw new AstryxError(
        'Name the icon id to map it to, or pass --remove',
        undefined,
        ERROR_CODES.ERR_MISSING_ARGUMENT,
      );
    }
    const {packageDir, set} = await findLocalIconSet(cwd, selector);
    // The docs' kebab id (`eye-slash`) names the same definition, and a
    // library's other name for an icon (`trash-2`) names the same icon.
    definition = definitionNameOf(definition, mappableDefinitions(set));
    if (!remove) icon = iconIdIn(set, /** @type {string} */ (icon)) ?? icon;
    const map = {...(set.data.map ?? {})};
    const previous = map[definition] ?? null;
    if (remove) {
      delete map[definition];
    } else {
      if (!mappableDefinitions(set).has(definition)) {
        throw new AstryxError(
          `"${definition}" is not an icon definition.`,
          [
            ...closestNames(definition, [...mappableDefinitions(set)]).map(
              name => ({name, reason: 'a known icon definition'}),
            ),
            {
              name: `astryx experimental icon new-definition ${definition} --set ${set.name}`,
              reason: 'add it as your own definition',
            },
          ],
          ERROR_CODES.ERR_NOT_FOUND,
        );
      }
      const ids = set.data.icons.map(each => each.id);
      if (!ids.includes(/** @type {string} */ (icon))) {
        throw new AstryxError(
          `Icon set "${set.name}" has no icon "${icon}". Name an icon by its id, its export name, or another name its library exports it as; a word it carries is not its name.`,
          refusalSuggestions(set, /** @type {string} */ (icon), ids),
          ERROR_CODES.ERR_NOT_FOUND,
        );
      }
      map[definition] = /** @type {string} */ (icon);
    }
    const changed = remove ? previous != null : previous !== icon;
    /** @type {string[]} */
    const files = [];
    if (changed) {
      const next = {...set.data, map};
      // A set with a generated module gets its theme map rewritten too.
      const written = set.data.generated
        ? writeGeneratedIcons(packageDir, set.data.generated, next, [])
        : null;
      try {
        writeIconSetData(set, next);
      } catch (error) {
        written?.undo();
        throw error;
      }
      files.push(...(written?.files ?? []));
    }
    return {
      type: /** @type {const} */ ('icon.map'),
      data: {
        set: set.name,
        package: set.package,
        file: path.relative(packageDir, set.dataPath).split(path.sep).join('/'),
        definition,
        icon: remove ? null : /** @type {string} */ (icon),
        previous,
        changed,
        ...(files.length > 0 ? {files} : {}),
      },
    };
  });
}

/**
 * `--pairs`: write many `map` entries in one checked write, all or none.
 * @param {{cwd: string, selector: string | undefined, pairs: string | string[]}} options
 * @returns {Promise<import('../icon.type.mjs').IconMapManyResponse>}
 */
async function mapMany({cwd, selector, pairs}) {
  const items = (Array.isArray(pairs) ? pairs : [pairs])
    .flatMap(each => String(each).split(/[\s,]+/u))
    .filter(Boolean);
  if (items.length === 0) {
    throw new AstryxError(
      'Pass --pairs with <definition>=<icon> entries, such as close=x-mark,search=magnifying-glass.',
      undefined,
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  const {packageDir, set} = await findLocalIconSet(cwd, selector);
  const known = mappableDefinitions(set);
  const ids = set.data.icons.map(each => each.id);
  const map = {...(set.data.map ?? {})};
  /** @type {Array<{definition: string, icon: string, previous: string | null, changed: boolean}>} */
  const entries = [];
  for (const item of items) {
    const match = /^([^=]+)=([^=]+)$/u.exec(item);
    if (!match) {
      throw new AstryxError(
        `"${item}" is not a <definition>=<icon> pair.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const name = definitionNameOf(match[1], known);
    const id = iconIdIn(set, match[2]) ?? match[2];
    if (!known.has(name)) {
      throw new AstryxError(
        `"${name}" is not an icon definition. Nothing was written.`,
        closestNames(name, [...known]).map(each => ({
          name: each,
          reason: 'a known icon definition',
        })),
        ERROR_CODES.ERR_NOT_FOUND,
      );
    }
    if (!ids.includes(id)) {
      throw new AstryxError(
        `Icon set "${set.name}" has no icon "${id}" (for ${name}). Name an icon by its id, its export name, or another name its library exports it as; a word it carries is not its name. Nothing was written.`,
        refusalSuggestions(set, id, ids),
        ERROR_CODES.ERR_NOT_FOUND,
      );
    }
    const previous = map[name] ?? null;
    map[name] = id;
    entries.push({
      definition: name,
      icon: id,
      previous,
      changed: previous !== id,
    });
  }
  const changed = entries.some(each => each.changed);
  /** @type {string[]} */
  const files = [];
  if (changed) {
    const next = {...set.data, map};
    const written = set.data.generated
      ? writeGeneratedIcons(packageDir, set.data.generated, next, [])
      : null;
    try {
      writeIconSetData(set, next);
    } catch (error) {
      written?.undo();
      throw error;
    }
    files.push(...(written?.files ?? []));
  }
  return {
    type: /** @type {const} */ ('icon.mapMany'),
    data: {
      set: set.name,
      package: set.package,
      file: path.relative(packageDir, set.dataPath).split(path.sep).join('/'),
      entries,
      changed,
      ...(files.length > 0 ? {files} : {}),
    },
  };
}

/**
 * The icons a refused name may have meant: those that carry it as a word
 * (`glass` → `magnifying-glass`), then the closest ids.
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet} set
 * @param {string} name
 * @param {string[]} ids
 */
function refusalSuggestions(set, name, ids) {
  return [...new Set([...iconsWithWord(set, name), ...closestNames(name, ids)])]
    .slice(0, 5)
    .map(each => ({name: each, reason: 'an icon in this set'}));
}
