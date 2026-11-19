// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What `astryx experimental export` and `astryx experimental import`
 * print in text: the file a render wrote, and the page an import gave back.
 * Both read the `render()` API's answer; JSON prints that answer as it is.
 */

import * as path from 'node:path';
import {shellArg} from '../../../../foundation/text/shell-arg.mjs';
import {emit, section, text, record, list} from '../../formatters/index.mjs';
import {freeRestoreFolder} from '../../../../foundation/render/restore-folder.mjs';

/** @param {number} n */
const kb = n => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/**
 * A file rendered outside the current folder comes back into it: an import
 * writes only inside the folder it runs from, so the command names the first
 * free restore folder here, as a restore beside the file would.
 * @param {{output: string, files: string[]}} d
 */
const restoreHere = d =>
  path.isAbsolute(d.output)
    ? ` --out ${shellArg(`${path.relative(process.cwd(), freeRestoreFolder(process.cwd(), path.basename(d.output)))}/${d.files[0]}`)}`
    : '';

/** The text answer names this many files at most. The JSON answer keeps every file. */
const LISTED_FILES = 10;

/**
 * Names the first files, then counts the rest. The rest are named by the
 * folder they share, when they share one.
 * @param {string[]} files
 */
function fileList(files) {
  if (files.length <= LISTED_FILES) return files.join(', ');
  const rest = files.slice(LISTED_FILES);
  const folder = sharedFolder(rest);
  return `${files.slice(0, LISTED_FILES).join(', ')}, ... and ${rest.length} more${folder ? ` in ${folder}/` : ''}`;
}

/**
 * @param {string[]} files
 * @returns {string} the deepest folder that holds every file, or '' at the top
 */
function sharedFolder(files) {
  /** @type {string[] | undefined} */
  let shared;
  for (const file of files) {
    const parts = file.replaceAll('\\', '/').split('/').slice(0, -1);
    if (shared === undefined) {
      shared = parts;
      continue;
    }
    let same = 0;
    while (same < shared.length && same < parts.length && shared[same] === parts[same]) same++;
    shared = shared.slice(0, same);
  }
  return (shared ?? []).join('/');
}

/**
 * Print the file a render wrote.
 * @param {import('../../../../api/render/render.type.mjs').RenderPageResponse['data']} d
 * @param {string} run how the caller runs the CLI
 */
export function printRendered(d, run) {
  emit(
    section(`Rendered ${d.input}`),
    record({
      input: d.input,
      output: d.output,
      bytes: kb(d.bytes),
      cssBytes: kb(d.cssBytes),
      classes: d.classes,
      images: d.images,
      files: fileList(d.files),
      ...(d.notCarried?.length ? {notCarried: fileList(d.notCarried)} : {}),
      stylesheets: d.stylesheets.join(', ') || 'none',
      scriptBytes: kb(d.scriptBytes),
      scriptModules: d.scriptModules,
    }),
    ...(d.warnings.length > 0
      ? [section('Warnings'), list(d.warnings.map(w => w.message))]
      : []),
    text(
      `Give it back: ${run} experimental import ${shellArg(d.output)}${restoreHere(d)}`,
    ),
  );
}

/**
 * Print the page an import gave back.
 * @param {import('../../../../api/render/render.type.mjs').RenderReverseResponse['data']} d
 * @param {string} run how the caller runs the CLI
 */
export function printRestored(d, run) {
  const edits = d.edits ?? [];
  emit(
    section(
      d.mode === 'embedded' ? `Restored ${d.output}` : `Rebuilt ${d.output}`,
    ),
    record({
      input: d.input,
      mode: d.mode,
      exact: d.exact,
      output: d.output,
      files: fileList(d.files),
      ...(d.missing?.length ? {missing: d.missing.join(', ')} : {}),
      ...(d.aliased?.imports.length
        ? {
            aliased: d.aliased.imports
              .map(a => `${a.import} (${a.file})`)
              .join(', '),
          }
        : {}),
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
    ...(d.aliased?.sameAsProject ?? []).map(a =>
      text(
        `The page imports ${a.import} through this project's alias, which reaches ${a.file}: the same file the page carries, so the page uses it and it was not written again.`,
      ),
    ),
    ...(d.aliased?.differs ?? []).map(a =>
      text(
        `${a.import} reaches ${a.project} in this project, which ${a.changed ? `is the same as the page's copy, but files it imports differ here (${a.changed.join(', ')})` : a.exists ? 'differs from the copy the page carries' : 'is not there'}. The page's copy came back as ${a.file}. The "paths" below apply to the whole project: with them, every file that imports ${a.import} gets the page's copy${a.exists ? ` instead of ${a.project}` : ''}.${(a.instead ?? []).length > 0 ? ` To change only the restored page, import the copy by a relative path instead: ${(a.instead ?? []).map(x => `in ${x.file}, import '${x.import}'`).join('; ')}.` : ''}`,
      ),
    ),
    ...(d.aliased?.imports.length && d.aliased.paths
      ? [
          text(
            `The page imports ${d.aliased.imports.length === 1 ? 'a file' : 'files'} through a path alias that does not reach ${d.aliased.imports.length === 1 ? 'it' : 'them'} in this project, so ${d.aliased.imports.length === 1 ? 'it' : 'they'} came back in the page's own layout. To build or render the page again, set the "paths" of ${d.aliased.config} (create it if it is not there) to: ${Object.entries(
              d.aliased.paths,
            )
              .map(
                ([key, targets]) =>
                  `${JSON.stringify(key)}: ${JSON.stringify(targets)}`,
              )
              .join(', ')}.`,
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
            : [
                text(
                  d.stylesEdited
                    ? 'Only the styles changed after the render; the text did not.'
                    : 'The markup changed after the render, but its text did not: only attributes, elements or formatting.',
                ),
              ]),
          ...(d.moreEdits ? [record({moreEdits: d.moreEdits})] : []),
          text(
            'The restored files are the page as rendered, without these changes: make them in the restored files, then render again.',
          ),
        ]
      : []),
    ...(d.mode === 'embedded'
      ? [
          text(
            `Export it again: ${run} experimental export ${shellArg(d.output)} --out ${shellArg(d.input)}${d.title === undefined ? '' : ` --title ${shellArg(d.title)}`}`,
          ),
        ]
      : []),
  );
}
