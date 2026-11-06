// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `--type` on build accepts exactly build's domains and on search
 * exactly search's, and for each command the help text, the CLI choices, the
 * API doc and the invalid-type error name that same set, so the four cannot
 * drift apart. Build refuses doc and theme and points to search for them.
 */

import {describe, expect, it} from 'vitest';
import {SEARCH_DOMAINS} from '../../../api/search/_query.mjs';
import {doc as buildCommand} from './build.doc.mjs';
import {doc as searchCommand} from './search.doc.mjs';
import {doc as buildFn} from '../../../api/build/build.doc.mjs';
import {doc as searchFn} from '../../../api/search/search.doc.mjs';
import {BUILD_DOMAINS, build} from '../../../api/build/build.mjs';
import {search} from '../../../api/search/search.mjs';

/** @param {any} d */
const typeOption = d =>
  d.options.find((/** @type {any} */ o) => o.flag.startsWith('--type'));
/** @param {any} d */
const typeParam = d =>
  d.params.find((/** @type {any} */ p) => p.name === 'options.type');

/**
 * What build returns for each domain: template names a start; component and
 * hook list only that domain.
 * @param {string} type
 * @param {any} data
 */
const checkBuild = (type, data) => {
  if (type === 'template') {
    expect(data.start).not.toBeNull();
    return;
  }
  expect(data.start).toBeNull();
  expect(data.pages).toEqual([]);
  expect(data.blocks).toEqual([]);
  for (const entry of data.domain) expect(entry.domain).toBe(type);
};

/**
 * Search returns only entries of the requested domain.
 * @param {string} type
 * @param {any} data
 */
const checkSearch = (type, data) => {
  for (const entry of data.results) expect(entry.domain).toBe(type);
};

describe.each([
  [
    'build',
    buildCommand,
    buildFn,
    (/** @type {string} */ t) =>
      build('settings page', {type: /** @type {any} */ (t)}),
    checkBuild,
    BUILD_DOMAINS,
  ],
  [
    'search',
    searchCommand,
    searchFn,
    (/** @type {string} */ t) =>
      search('button', {type: /** @type {any} */ (t)}),
    checkSearch,
    SEARCH_DOMAINS,
  ],
])('%s --type', (_name, command, fn, run, check, domains) => {
  it('lists exactly the accepted domains in the CLI choices and help text', () => {
    const option = typeOption(command);
    expect(option.choices).toEqual(domains);
    expect(option.description).toContain(`(${domains.join('|')})`);
  });

  it('lists exactly the accepted domains in the API doc', () => {
    const named = [...typeParam(fn).type.matchAll(/'([a-z]+)'/g)].map(
      m => m[1],
    );
    expect(named).toEqual(domains);
  });

  it('names the same domains in the invalid-type error', async () => {
    await expect(run('bogus')).rejects.toMatchObject({
      suggestions: domains.map(d => ({name: d, reason: 'valid type'})),
    });
  });

  it.each(domains)('accepts %s', async type => {
    const response = /** @type {any} */ (await run(type));
    expect(response).toBeTruthy();
    check(type, response.data);
  });
});

describe('build --type', () => {
  it.each(['doc', 'theme'])('refuses %s and points to search', async type => {
    await expect(
      build('settings page', {type: /** @type {any} */ (type)}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      suggestions: expect.arrayContaining([
        expect.objectContaining({name: `astryx search <query> --type ${type}`}),
      ]),
    });
  });
});
