// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for `astryx experimental render`: a page module to
 * one self-contained HTML file, and back.
 *
 *   render('page.tsx')                      render.page: write page.html
 *   render('page.html', {reverse: true})    render.reverse: write page.tsx
 *
 * @input a page module or a rendered HTML file, and options
 * @output render.page | render.reverse envelope
 * @position api/render — leaf; command wrapper in
 *   clients/cli/commands/experimental/render.mjs
 */

import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {PAGE_EXTENSIONS, embeddedPathProblem, renderToFile, reverseToFile} from './_adapter.mjs';

/**
 * Render a page module to one self-contained HTML file, or turn a rendered
 * file back into a page module.
 *
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} file the page module, or with `reverse` the HTML file
 * @param {import('./render.type.mjs').RenderOptions} [options]
 * @returns {Promise<import('./render.type.mjs').RenderPageResponse | import('./render.type.mjs').RenderReverseResponse>}
 */
export async function render(file, options = {}) {
  const {cwd = process.cwd(), reverse = false, overwrite = false, title} = options;
  if (typeof file !== 'string' || !file.trim()) {
    throw new AstryxError(
      reverse ? 'A rendered HTML file is required' : 'A page file is required',
      [
        reverse
          ? {name: 'astryx experimental render --reverse page.html', reason: 'turn a rendered file back into a page'}
          : {name: 'astryx experimental render page.tsx', reason: 'render a page to one HTML file'},
      ],
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  const input = path.resolve(cwd, file);
  const output = options.out ? path.resolve(cwd, options.out) : undefined;
  if (output && output === input) {
    throw new AstryxError(
      '--out names the input file itself; choose another file',
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (reverse) {
    if (title != null) {
      throw new AstryxError('--title applies only to rendering, not to --reverse', [], ERROR_CODES.ERR_INVALID_ARGUMENT);
    }
    if (!/\.html?$/i.test(input)) {
      throw new AstryxError(
        `--reverse reads a rendered .html file; ${file} is not one`,
        [{name: `astryx experimental render ${file}`, reason: 'render the page instead'}],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (output && !PAGE_EXTENSIONS.includes(path.extname(output).toLowerCase())) {
      throw new AstryxError(
        `--out for --reverse must be a page module (${PAGE_EXTENSIONS.join(', ')})`,
        [],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const outProblem = output
      ? (embeddedPathProblem(path.basename(output), {page: true}) ?? embeddedPathProblem(path.basename(output)))
      : null;
    if (output && outProblem) {
      throw new AstryxError(
        `--out for --reverse must name a page module, not ${outProblem.reason}`,
        [],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return {
      type: 'render.reverse',
      data: reverseToFile({cwd, input, output, overwrite}),
    };
  }
  if (!PAGE_EXTENSIONS.includes(path.extname(input).toLowerCase())) {
    throw new AstryxError(
      /\.html?$/i.test(input)
        ? `${file} is already HTML; pass --reverse to turn it back into a page`
        : `render reads a page module (${PAGE_EXTENSIONS.join(', ')}); ${file} is not one`,
      /\.html?$/i.test(input)
        ? [{name: `astryx experimental render --reverse ${file}`, reason: 'turn it back into a page'}]
        : [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (overwrite) {
    throw new AstryxError(
      '--overwrite applies only to --reverse; rendering replaces an existing HTML file only when a render wrote it',
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (output && !/\.html?$/i.test(output)) {
    throw new AstryxError('--out must be an .html file', [], ERROR_CODES.ERR_INVALID_ARGUMENT);
  }
  const target = output ?? input.replace(/\.[^.]+$/, '.html');
  return {
    type: 'render.page',
    data: await renderToFile({cwd, input, output: target, title}),
  };
}
