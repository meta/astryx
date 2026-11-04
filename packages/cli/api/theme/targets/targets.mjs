// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme targets` leaf — the whole themeable surface, enumerated.
 *
 * @input  a cwd (to resolve the project's `@astryxdesign/core`) and an optional
 *         component/key filter
 * @output the `theme.targets` envelope: one row per theming target
 * @position api/theme/targets — projection over
 *           foundation/discovery/theming-targets.mjs, the same component docs
 *           `astryx component <Name>` prints its Theming table from.
 */

import * as path from 'node:path';
import {requireThemeCoreDir} from '../_adapter.mjs';
import {collectThemingTargets} from '../../../foundation/discovery/theming-targets.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError, coreDirOrThrow} from '../../error.mjs';

/**
 * Whether a target matches the caller's filter loosely: any target whose key,
 * class, or component contains it — so `theme targets thumb` finds the switch
 * thumb without knowing which component owns it.
 * @param {import('../../../foundation/discovery/theming-targets.mjs').ThemingTarget} target
 * @param {string} filter - already lowercased
 * @returns {boolean}
 */
function matchesLoosely(target, filter) {
  return (
    target.key.toLowerCase().includes(filter) ||
    target.className.toLowerCase().includes(filter) ||
    target.component.toLowerCase().includes(filter)
  );
}

/**
 * List every component theming target — the `defineTheme` `components` keys,
 * with the props and states each one accepts.
 *
 * A filter naming a component exactly wins over a substring search, so
 * `theme targets Button` is Button's own set (what `astryx component Button`
 * prints) rather than every key that happens to contain "button".
 *
 * @param {string} [filter] - component name, or a substring of a target key
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<import('../theme.type.mjs').ThemeTargetsResponse>}
 */
export async function themeTargets(filter, {cwd = process.cwd()} = {}) {
  const coreDir = coreDirOrThrow(requireThemeCoreDir, cwd);

  const all = await collectThemingTargets(path.join(coreDir, 'src'));
  const needle = filter ? String(filter).toLowerCase() : null;
  let targets = all;
  if (needle) {
    const named = all.filter(t => t.component.toLowerCase() === needle);
    targets = named.length > 0 ? named : all.filter(t => matchesLoosely(t, needle));
  }

  if (needle && targets.length === 0) {
    const near = [...new Set(all.map(t => t.component))]
      .filter(name => name.toLowerCase().startsWith(needle.slice(0, 3)))
      .sort()
      .slice(0, 5)
      .map(name => ({name, reason: 'has theming targets'}));
    throw new AstryxError(
      `No theming target matches "${filter}". Run \`theme targets\` with no filter for the whole list.`,
      near.length > 0 ? near : undefined,
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }

  return {
    type: 'theme.targets',
    data: {
      filter: filter ?? null,
      componentCount: new Set(targets.map(t => t.component)).size,
      targets,
    },
  };
}
