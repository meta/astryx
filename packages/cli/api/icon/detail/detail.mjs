// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.detail` leaf (AST-084 FR7): one icon by `<set>/<id>`, with every
 * variant's import line.
 *
 * @input `<set>/<id>`, where `<set>` is a set name or `<package>/<set>`
 * @output the `icon.detail` envelope, naming the set's package
 * @position api/icon/detail — dispatched by ../icon.mjs
 */

import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {loadIconSets} from '../_adapter.mjs';
import {
  closest,
  iconRecord,
  importLine,
  rankIcons,
  setsNamed,
  unusableSet,
} from '../_records.mjs';

/**
 * Read one icon.
 * @param {string} reference `<set>/<id>` or `<package>/<set>/<id>`
 * @param {{cwd: string}} options
 * @returns {Promise<import('../icon.type.mjs').IconDetailResponse>}
 */
export async function iconDetail(reference, {cwd}) {
  const slash = reference.lastIndexOf('/');
  const selector = reference.slice(0, slash);
  const id = reference.slice(slash + 1);
  const {sets, withdrawn} = await loadIconSets(cwd);
  const named = setsNamed(sets, selector);
  if (named.length === 0) throw unusableSet(sets, withdrawn, selector);
  if (named.length > 1) {
    throw new AstryxError(
      `Icon set name "${selector}" is installed by ${named.map(each => each.package).join(' and ')}`,
      named.map(each => ({
        name: `${each.package}/${each.name}/${id}`,
        reason: 'name the package',
      })),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const set = named[0];
  const icon = set.data.icons.find(each => each.id === id);
  if (!icon) {
    const nearby = rankIcons([set], id.replace(/-/g, ' ')).map(
      match => `${set.name}/${match.id}`,
    );
    throw new AstryxError(
      `No icon "${id}" in icon set "${set.name}"`,
      nearby.length > 0
        ? nearby.slice(0, 5).map(name => ({name, reason: 'similar icon'}))
        : closest(
            id,
            set.data.icons.map(each => each.id),
            'icon in this set',
          ).map(each => ({...each, name: `${set.name}/${each.name}`})),
      ERROR_CODES.ERR_NOT_FOUND,
    );
  }
  const record = iconRecord(set, icon);
  return {
    type: 'icon.detail',
    package: set.package,
    data: {
      ...record,
      variants: record.variants.map(variant => ({
        ...variant,
        import: importLine(variant.export, variant.module),
      })),
    },
  };
}
