// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental render` — a page to one self-contained HTML
 * file, and back. Experimental (spec:AST-017 FR27): it is registered only
 * under the `experimental` group.
 *
 * The command surface comes from the colocated CommandDoc via
 * `defineCommand`; this file reads flags, calls `render()`, and prints.
 *
 * Usage:
 *   astryx experimental render page.tsx --out page.html
 *   astryx experimental render --reverse page.html --out page.tsx
 */

import {getCliInvocation} from '../../../../foundation/env/package-manager.mjs';
import {shellArg} from '../../../../foundation/text/shell-arg.mjs';
import {jsonOut} from '../../../../foundation/response/json.mjs';
import {resultSet} from '../../../../foundation/debug/index.mjs';
import {emit, section, text, record, list} from '../../formatters/index.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {defineCommand} from '../../lib/define-command.mjs';
import {render as renderApi} from '../../../../api/render/render.mjs';
import {doc as renderCommand} from '../experimental-render.doc.mjs';
import {doc as renderFn} from '../../../../api/render/render.doc.mjs';

/** @param {number} n */
const kb = n => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/**
 * Register `render` under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalRender(group, program) {
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
      if (result.type === 'render.page') {
        const d = result.data;
        emit(
          section(`Rendered ${d.input}`),
          record({
            input: d.input,
            output: d.output,
            bytes: kb(d.bytes),
            cssBytes: kb(d.cssBytes),
            classes: d.classes,
            images: d.images,
            files: d.files.join(', '),
            stylesheets: d.stylesheets.join(', ') || 'none',
          }),
          ...(d.warnings.length > 0
            ? [section('Warnings'), list(d.warnings.map(w => w.message))]
            : []),
          text(`Give it back: ${run} experimental render --reverse ${shellArg(d.output)}`),
        );
        return answered;
      }
      const d = result.data;
      const edits = d.edits ?? [];
      emit(
        section(d.mode === 'embedded' ? `Restored ${d.output}` : `Rebuilt ${d.output}`),
        record({
          input: d.input,
          mode: d.mode,
          exact: d.exact,
          output: d.output,
          files: d.files.join(', '),
          ...(d.missing?.length ? {missing: d.missing.join(', ')} : {}),
          ...(d.mode === 'rebuilt'
            ? {
                components: (d.components ?? []).join(', ') || 'none',
                elements: d.elements ?? 0,
                ...(d.omitted?.length ? {omitted: d.omitted.join(', ')} : {}),
                ...(d.unknown?.length ? {unknown: d.unknown.join(', ')} : {}),
              }
            : {}),
          ...(d.format === undefined ? {} : {format: d.format}),
          ...(d.renderedBy ? {renderedBy: d.renderedBy} : {}),
          ...(d.packages ? {packages: d.packages.join(', ') || 'none'} : {}),
          ...(d.title === undefined ? {} : {title: d.title}),
          ...(d.edited === undefined ? {} : {edited: d.edited}),
          ...(d.stylesEdited === undefined ? {} : {stylesEdited: d.stylesEdited}),
        }),
        ...(d.mode === 'rebuilt'
          ? [
              text(
                'The file had no embedded source, so the page was rebuilt from its Astryx markup: text and layout only. Review it before use.',
              ),
            ]
          : []),
        ...(d.edited
          ? [
              section('Changed after the render'),
              ...(edits.length > 0
                ? edits.map(edit =>
                    record({
                      was: edit.was ?? '(added after the render)',
                      now: edit.now ?? '(removed after the render)',
                      ...(edit.file ? {file: edit.file, line: edit.line} : {}),
                    }),
                  )
                : [text(d.stylesEdited ? 'Only the styles changed after the render; the text did not.' : 'The markup changed after the render, but its text did not: only attributes, elements or formatting.')]),
              ...(d.moreEdits ? [record({moreEdits: d.moreEdits})] : []),
              text('The restored files are the page as rendered, without these changes: make them in the restored files, then render again.'),
            ]
          : []),
        ...(d.mode === 'embedded'
          ? [
              text(
                `Render it again: ${run} experimental render ${shellArg(d.output)} --out ${shellArg(d.input)}${d.title === undefined ? '' : ` --title ${shellArg(d.title)}`}`,
              ),
            ]
          : []),
      );
      return answered;
    },
  });
}
