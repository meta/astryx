// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `--type` on build and search accepts exactly search's domains, and
 * the help text, the CLI choices, the API doc and the invalid-type error all
 * name that same set, so the four cannot drift apart.
 */

import {describe, expect, it} from 'vitest';
import {SEARCH_DOMAINS} from '../../../api/search/_query.mjs';
import {doc as buildCommand} from './build.doc.mjs';
import {doc as searchCommand} from './search.doc.mjs';
import {doc as buildFn} from '../../../api/build/build.doc.mjs';
import {doc as searchFn} from '../../../api/search/search.doc.mjs';
import {build} from '../../../api/build/build.mjs';
import {search} from '../../../api/search/search.mjs';

/** @param {any} d */
const typeOption = d =>
  d.options.find((/** @type {any} */ o) => o.flag.startsWith('--type'));
/** @param {any} d */
const typeParam = d =>
  d.params.find((/** @type {any} */ p) => p.name === 'options.type');

describe.each([
  [
    'build',
    buildCommand,
    buildFn,
    (/** @type {string} */ t) =>
      build('settings page', {type: /** @type {any} */ (t)}),
  ],
  [
    'search',
    searchCommand,
    searchFn,
    (/** @type {string} */ t) =>
      search('button', {type: /** @type {any} */ (t)}),
  ],
])('%s --type', (_name, command, fn, run) => {
  it('lists exactly the accepted domains in the CLI choices and help text', () => {
    const option = typeOption(command);
    expect(option.choices).toEqual(SEARCH_DOMAINS);
    expect(option.description).toContain(`(${SEARCH_DOMAINS.join('|')})`);
  });

  it('lists exactly the accepted domains in the API doc', () => {
    const named = [...typeParam(fn).type.matchAll(/'([a-z]+)'/g)].map(
      m => m[1],
    );
    expect(named).toEqual(SEARCH_DOMAINS);
  });

  it('names the same domains in the invalid-type error', async () => {
    await expect(run('bogus')).rejects.toMatchObject({
      suggestions: SEARCH_DOMAINS.map(d => ({name: d, reason: 'valid type'})),
    });
  });

  it.each(SEARCH_DOMAINS)('accepts %s', async type => {
    await expect(run(type)).resolves.toBeTruthy();
  });
});
