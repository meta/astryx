// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle command — thin wrapper around api/swizzle.
 *
 * Copies a component's source into the consumer project for customization
 * (imports rewritten to the owner package's subpaths). All logic — owner
 * resolution, copy, import rewriting, StyleX detection, maintainer feedback —
 * lives in api/swizzle; this file only parses flags, prints, and prefixes
 * commands for the caller's package manager.
 */

import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, section, list, text, WARN, record} from '../formatters/index.mjs';
import {cliError, rejectEmptyArgument} from '../lib/cli-error.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {swizzle as swizzleApi} from '../../../api/swizzle/swizzle.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {doc as swizzleCommand} from './swizzle.doc.mjs';
import {doc as swizzleFn} from '../../../api/swizzle/swizzle.doc.mjs';
import {NO_RESULT_SET, resultSet} from '../../../foundation/debug/index.mjs';

/**
 * @param {import('commander').Command} program
 */
export function registerSwizzle(program) {
  defineCommand(program, swizzleCommand, {
    fn: swizzleFn,
    action: async (/** @type {string | undefined} */ component, /** @type {{output: string, package?: string, list?: boolean, overwrite?: boolean}} */ options) => {
      if (!options.list) {
        rejectEmptyArgument('component', component, 'astryx swizzle');
      }
      const json = program.opts().json || false;
      const run = getCliInvocation();

      /** @type {import('../../../api/swizzle/swizzle.type.mjs').SwizzleListResponse | import('../../../api/swizzle/swizzle.type.mjs').SwizzleCopyResponse} */
      let result;
      try {
        result = await swizzleApi(component, {
          cwd: process.cwd(),
          output: options.output,
          package: options.package,
          list: options.list,
          overwrite: options.overwrite,
        });
      } catch (e) {
        const err = /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {suggestions: err.suggestions, code: err.code});
      }

      // `--list` answers with the components you could eject; ejecting one is
      // a copy into the project, which is an effect with nothing to count.
      const answered =
        result.type === 'swizzle.list'
          ? resultSet({count: result.data.length, resultKind: 'component'})
          : NO_RESULT_SET;

      if (json) {
        jsonOut(result);
        return answered;
      }

      if (result.type === 'swizzle.list') {
        const components = result.data;
        emit(
          record({package: result.package}),
          section('Available components'),
          list(components),
          text(`Usage: ${run} swizzle <component>`),
          text(
            [
              `Example: ${run} swizzle Button`,
              `         ${run} swizzle XDSButton  (XDS prefix also works)`,
            ].join('\n'),
          ),
        );
        return answered;
      }

      const {package: ownerPackage, outputDir, filesCopied, usesStyleX, feedback} =
        result.data;

      /** @type {import('../formatters/index.mjs').Block[]} */
      const out = [
        text(`[ok] Copied ${filesCopied} files to ${outputDir}/`),
        text(
          [
            `Relative imports have been rewritten to use ${ownerPackage}.`,
            'You can now customize the component source freely.',
          ].join('\n'),
        ),
      ];

      // StyleX build requirement — swizzled StyleX source throws on import
      // ("Unexpected 'stylex.create' call at runtime") unless the consumer's
      // build runs a StyleX compiler, so the page does not render at all.
      if (usesStyleX) {
        out.push(
          text(
            [
              `${WARN} These components use StyleX and require a StyleX compiler in your build.`,
              `  Without one, importing them throws "Unexpected 'stylex.create' call at runtime"`,
              '  and the page does not render. See setup per framework:',
              `  ${run} docs styling`,
              '  Next.js note: the StyleX Babel plugin disables SWC and breaks next/font -',
              '  use an SWC-based StyleX transform instead (covered in the guide).',
            ].join('\n'),
          ),
        );
      }

      // Maintainer feedback note (skipped when the owner ships no issues URL).
      if (feedback) {
        out.push(
          text(
            [
              'Customizing a component often signals a gap in the design system.',
              'Let the maintainers know what you needed:',
              `  ${feedback.ghCommand || feedback.issuesUrl}`,
            ].join('\n'),
          ),
        );
      }

      emit(...out);
      return answered;
    },
  });
}
