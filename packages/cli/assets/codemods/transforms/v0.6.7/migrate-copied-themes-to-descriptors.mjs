// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Give source themes copied by the released `theme add` the descriptors
 * that make them discoverable local themes.
 *
 * The released copy wrote each theme under `src/themes/<slug>` but left its
 * package descriptor behind. This project codemod writes only the missing
 * same-stem descriptor, marks the app-owned copy as unmaintained, and leaves
 * every existing source byte and import in place.
 */

import * as path from 'node:path';
import {discoverUnmigratedThemeCopies} from '../../../../foundation/discovery/theme-discovery.mjs';
import {themeDescriptorSource} from '../../../../foundation/integrations/theme-descriptor.mjs';

export const meta = {
  title: 'Give copied app themes their local descriptors',
  description:
    'Writes one unmaintained same-stem descriptor beside each earlier theme copy in src/themes.',
  codemodType: 'project',
};

/** @param {string} slug */
function displayName(slug) {
  return slug
    .split('-')
    .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

/**
 * @param {string} root project directory
 * @returns {Promise<import('../../runner.mjs').ProjectCodemodPlan>}
 */
export default async function migrateCopiedThemesToDescriptors(root) {
  return {
    writes: discoverUnmigratedThemeCopies(root).map(copy => {
      const name = displayName(copy.slug);
      return {
        path: path.join(copy.sourceDir, copy.descriptor),
        contents: themeDescriptorSource({
          type: 'theme',
          name: copy.slug,
          displayName: name,
          description: `${name} theme copied into this app.`,
          maintained: false,
        }),
      };
    }),
    deletes: [],
    problems: [],
  };
}
