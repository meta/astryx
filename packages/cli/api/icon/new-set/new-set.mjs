// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.newSet` leaf (AST-084 FR13): start an icon set in the local
 * integration package.
 *
 * @output the `icon.newSet` envelope
 * @position api/icon/new-set — dispatched by the `experimental icon new-set`
 *   command
 */

import {addIconSet, authoring, refuseOutsideProject} from '../_adapter.mjs';
import {refuseOtherOptions} from '../_options.mjs';

/**
 * Start an icon set in the local integration package: `astryx experimental
 * icon new-set` (AST-084). Experimental (spec:AST-017 FR27).
 * @experimental
 * @param {string} name
 * @param {import('../icon.type.mjs').IconNewSetOptions} [options]
 * @returns {Promise<import('../icon.type.mjs').IconNewSetResponse>}
 */
export async function iconNewSet(name, options = {}) {
  refuseOtherOptions('icon-set', options);
  refuseOutsideProject(
    options.cwd ?? process.cwd(),
    'experimental icon new-set',
    'the integration package',
  );
  const {data} = await authoring(() => addIconSet(name, options));
  return {type: 'icon.newSet', data};
}
