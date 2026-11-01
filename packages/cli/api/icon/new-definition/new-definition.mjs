// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.newDefinition` leaf (AST-084 FR13): add one of an icon set's
 * own icon definitions.
 *
 * @output the `icon.newDefinition` envelope
 * @position api/icon/new-definition — dispatched by the `experimental icon
 *   new-definition` command
 */

import {
  addIconDefinition,
  authoring,
  refuseOutsideProject,
} from '../_adapter.mjs';
import {refuseOtherOptions} from '../_options.mjs';

/**
 * Add an icon set's own icon definition: `astryx experimental icon
 * new-definition` (AST-084). Experimental (spec:AST-017 FR27).
 * @experimental
 * @param {string} name
 * @param {import('../icon.type.mjs').IconNewDefinitionOptions} [options]
 * @returns {Promise<import('../icon.type.mjs').IconNewDefinitionResponse>}
 */
export async function iconNewDefinition(name, options = {}) {
  refuseOtherOptions('icon-definition', options);
  refuseOutsideProject(
    options.cwd ?? process.cwd(),
    'experimental icon new-definition',
    'the icon-set package',
  );
  const {data} = await authoring(() => addIconDefinition(name, options));
  return {type: 'icon.newDefinition', data};
}
