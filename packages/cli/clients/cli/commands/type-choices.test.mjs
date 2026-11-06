// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `--type` on build and search: for each command the help text, the CLI
 * choices, the API doc and the invalid-type error name the same set, so they
 * cannot drift apart. Build's doc and theme are deprecated (DEP-0018): they
 * still run with unchanged output, warn once on stderr in text mode, and carry
 * the lifecycle entry in JSON.
 */

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {SEARCH_DOMAINS} from '../../../api/search/_query.mjs';
import {doc as buildCommand} from './build.doc.mjs';
import {doc as searchCommand} from './search.doc.mjs';
import {doc as buildFn} from '../../../api/build/build.doc.mjs';
import {doc as searchFn} from '../../../api/search/search.doc.mjs';
import {
  BUILD_DOMAINS,
  DEPRECATED_BUILD_DOMAIN_ID,
  DEPRECATED_BUILD_DOMAINS,
  build,
} from '../../../api/build/build.mjs';
import {search} from '../../../api/search/search.mjs';

const BIN = fileURLToPath(new URL('../bin/astryx.mjs', import.meta.url));

/** @param {any} d */
const typeOption = d =>
  d.options.find((/** @type {any} */ o) => o.flag.startsWith('--type'));
/** @param {any} d */
const typeParam = d =>
  d.params.find((/** @type {any} */ p) => p.name === 'options.type');

/**
 * What build returns for each domain: template names a start; component and
 * hook list only that domain; deprecated doc and theme return an empty kit.
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
  if (DEPRECATED_BUILD_DOMAINS.includes(type)) expect(data.domain).toEqual([]);
  else for (const entry of data.domain) expect(entry.domain).toBe(type);
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
    DEPRECATED_BUILD_DOMAINS,
  ],
  [
    'search',
    searchCommand,
    searchFn,
    (/** @type {string} */ t) =>
      search('button', {type: /** @type {any} */ (t)}),
    checkSearch,
    SEARCH_DOMAINS,
    [],
  ],
])('%s --type', (_name, command, fn, run, check, domains, deprecated) => {
  const accepted = [...domains, ...deprecated];

  it('lists the accepted domains in the CLI choices and help text', () => {
    const option = typeOption(command);
    expect(option.choices).toEqual(accepted);
    expect(option.description).toContain(`(${domains.join('|')})`);
    if (deprecated.length)
      expect(option.description).toContain(
        `${deprecated.join(' and ')} are deprecated`,
      );
  });

  it('lists the accepted domains in the API doc', () => {
    const named = [...typeParam(fn).type.matchAll(/'([a-z]+)'/g)].map(
      m => m[1],
    );
    expect(named).toEqual(accepted);
  });

  it('names the same domains in the invalid-type error', async () => {
    const {suggestions} = await run('bogus').catch(e => e);
    expect(suggestions.map((/** @type {any} */ s) => s.name)).toEqual(accepted);
    for (const s of suggestions.slice(domains.length))
      expect(s.reason).toBe(
        `deprecated: use astryx search <query> --type ${s.name}`,
      );
  });

  it.each(accepted)('accepts %s', async type => {
    const response = /** @type {any} */ (await run(type));
    expect(response).toBeTruthy();
    check(type, response.data);
  });
});

describe('build --type doc|theme deprecation', () => {
  /** @param {string[]} args */
  const cli = args =>
    spawnSync(process.execPath, [BIN, 'build', 'neutral', ...args], {
      encoding: 'utf8',
    });

  it.each(DEPRECATED_BUILD_DOMAINS)(
    'warns once on stderr for %s and leaves stdout alone',
    type => {
      const run = cli(['--type', type]);
      expect(run.status).toBe(0);
      const notes = run.stderr.match(/is deprecated/g) ?? [];
      expect(notes).toHaveLength(1);
      expect(run.stderr).toContain(`search <query> --type ${type}`);
      expect(run.stdout).not.toContain('deprecated');
    },
    60_000,
  );

  it.each(DEPRECATED_BUILD_DOMAINS)(
    'carries the lifecycle entry in JSON for %s',
    type => {
      const run = cli(['--type', type, '--json']);
      expect(run.status).toBe(0);
      expect(run.stderr).not.toContain('deprecated');
      expect(JSON.parse(run.stdout).meta.deprecations).toEqual([
        {
          id: DEPRECATED_BUILD_DOMAIN_ID,
          replacements: [`astryx search <query> --type ${type}`],
        },
      ]);
    },
    60_000,
  );

  it('adds nothing for a current kind', () => {
    const run = cli(['--type', 'component', '--json']);
    expect(run.stderr).not.toContain('deprecated');
    expect(JSON.parse(run.stdout).meta.deprecations).toBeUndefined();
  }, 60_000);
});
