// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental export` — a page to one self-contained HTML
 * file, and back. Experimental (spec:AST-017 FR27): it is registered only
 * under the `experimental` group.
 *
 * The command surface comes from the colocated CommandDoc via
 * `defineCommand`; this file reads flags, calls `render()`, and prints.
 *
 * Usage:
 *   astryx experimental export page.tsx --out page.html
 *   astryx experimental export --reverse page.html --out page.tsx  (as experimental import does)
 */

import {getCliInvocation} from '../../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../../foundation/response/json.mjs';
import {resultSet} from '../../../../foundation/debug/index.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {render as renderApi} from '../../../../api/render/render.mjs';
import {doc as renderCommand} from '../experimental-export.doc.mjs';
import {doc as renderFn} from '../../../../api/render/render.doc.mjs';
import {printRendered, printRestored} from './render-output.mjs';

/**
 * Register `export` under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalExport(group, program) {
  defineCommand(group, renderCommand, {
    fn: renderFn,
    action: async (
      /** @type {string | undefined} */ file,
      /** @type {{out?: string, reverse?: boolean, title?: string, overwrite?: boolean}} */ options,
    ) => {
      const json = program.opts().json || false;
      /** @type {Awaited<ReturnType<typeof renderApi>>} */
      let result;
      try {
        result = await renderApi(file ?? '', {
          cwd: process.cwd(),
          out: options.out,
          reverse: options.reverse ?? false,
          title: options.title,
          overwrite: options.overwrite ?? false,
        });
      } catch (e) {
        const err = /** @type {import('../../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {suggestions: err.suggestions, code: err.code});
      }
      const answered = resultSet({count: 1, resultKind: 'mixed', directMatch: true});
      if (json) {
        jsonOut(result);
        return answered;
      }
      const run = getCliInvocation();
      if (result.type === 'render.page') printRendered(result.data, run);
      else printRestored(result.data, run);
      return answered;
    },
  });
}
