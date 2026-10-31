// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `template.show` leaf — return a resolved template's source, exactly as
 * `template.copy` writes it, plus the components it composes.
 *
 * @position api/template/show — reads the resolved match's source file; the
 *   template dispatcher routes `show` (and the no-target-path default) here.
 */

import * as fs from 'node:fs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  extractComponents,
  pkgOf,
  replaceDemoMedia,
} from '../../../foundation/discovery/template-adapter.mjs';
import {
  NO_ICON_SETS,
  mapTemplateIcons,
} from '../../../foundation/discovery/template-icons.mjs';

/**
 * Build the `template.show` envelope for an already-resolved template.
 * @param {import('../../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate} match
 * @param {{iconSets?: Parameters<typeof mapTemplateIcons>[1]}} [options]
 *   the project's icon sets; without them the template's icons are unchanged
 * @returns {import('../template.type.mjs').TemplateShowResponse}
 */
export function templateShow(match, {iconSets = NO_ICON_SETS} = {}) {
  if (!fs.existsSync(match.filePath)) {
    throw new AstryxError(
      `No source file found for template "${match.dirName}"`,
      undefined,
      ERROR_CODES.ERR_NO_SOURCE,
    );
  }

  // The source template.copy writes (spec:AST-028 FR7): a template printed and
  // pasted must not keep a media path only Astryx's previews serve, and the
  // caller is told how many it replaced, the way the copy receipt tells it.
  const {source: withMedia, demoMediaReplaced} = replaceDemoMedia(
    fs.readFileSync(match.filePath, 'utf-8'),
  );
  // Icons follow the project's icon set, as template.copy writes them.
  const {source, icons} = mapTemplateIcons(withMedia, iconSets, match.icons);

  return {
    type: 'template.show',
    package: pkgOf(match),
    data: {
      template: match.dirName,
      description: match.description,
      type: match.type,
      components: extractComponents(match.filePath),
      source,
      demoMediaReplaced,
      ...(icons ? {icons} : {}),
    },
  };
}
