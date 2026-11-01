// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the unified `search` command + its programmatic API.
 *
 * Two layers:
 *   1. API-level (direct import of api/search.mjs) — ranking, cross-domain
 *      results, --type/--limit, typo tolerance, empty results, envelope shape.
 *   2. CLI-level (spawned subprocess) — exit codes and the --json contract,
 *      which only fire through a real Commander .parse() against argv.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  search,
  scoreCandidate,
  SEARCH_DOMAINS,
} from '../../../api/search/search.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {linkThisCliAsProjectCli} from '../../../test-utils/release-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Run against the monorepo root so @astryxdesign/core is discoverable.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const OPTS = {cwd: REPO_ROOT};

// The API-level search walks the source tree and imports every `.doc.mjs` to
// build its index; that takes several seconds and gets slower under the
// full-suite parallel load — enough to cross the default 5s per-test limit.
// The CLI-level cases spawn a subprocess (its own 30s cap) but still run under
// the vitest per-test timeout. Give both the same generous scan budget.
const SCAN_TIMEOUT = 30_000;

/**
 * A JSON value as the formatters print it (they normalize typography to ASCII).
 * @param {unknown} value
 */
function asText(value) {
  return (Array.isArray(value) ? value.join(', ') : String(value))
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .trimEnd();
}

/**
 * Whether some text line prints `key:` with this value. The command field gains
 * the caller's invocation prefix, so the value is matched as the line's end; a
 * multi-line value is matched by its first line.
 * @param {string[]} lines
 * @param {string} key
 * @param {unknown} value
 */
function printsField(lines, key, value) {
  // The text prefixes a command (`command`, `parent`) with the project's
  // invocation (`pnpm exec astryx`, or `pnpm dlx @astryxdesign/cli` where no
  // `astryx` bin is installed), so compare the part after `astryx`.
  const text = asText(value).split('\n')[0].trimEnd();
  const shown = text.replace(/^astryx /, '');
  return lines.some(
    line => line.startsWith(`${key}:`) && line.trimEnd().endsWith(shown),
  );
}

describe(
  'search() API — ranking',
  () => {
    it('ranks an exact component name match first', async () => {
      const {data} = await search('button', OPTS);
      expect(data.results.length).toBeGreaterThan(0);
      const top = data.results[0];
      expect(top.domain).toBe('component');
      expect(top.name).toBe('Button');
      expect(top.score).toBe(100);
      expect(top.command).toBe('astryx component Button');
    });

    it('returns components/hooks tagged with a matching keyword', async () => {
      const {data} = await search('button', OPTS);
      // IconButton carries the "button" keyword; should be present and scored
      // on a keyword (not name) signal.
      const iconButton = data.results.find(r => r.name === 'IconButton');
      expect(iconButton).toBeTruthy();
      expect(iconButton.domain).toBe('component');
      expect(iconButton.score).toBeGreaterThanOrEqual(70);
      expect(iconButton.reason.toLowerCase()).toContain('keyword');
    });
  },
  SCAN_TIMEOUT,
);

describe(
  'search() API — cross-domain',
  () => {
    it('returns results from more than one domain for a broad query', async () => {
      const {data} = await search('color', OPTS);
      const domains = new Set(data.results.map(r => r.domain));
      // "color" is a doc topic AND appears across components.
      expect(domains.has('doc')).toBe(true);
      expect(domains.size).toBeGreaterThan(1);
      // The doc topic should carry a follow-up `astryx docs` command.
      const docHit = data.results.find(r => r.domain === 'doc');
      expect(docHit.command.startsWith('astryx docs ')).toBe(true);
    });

    it('every result is tagged with a known domain and a command', async () => {
      const {data} = await search('button', OPTS);
      for (const r of data.results) {
        expect(SEARCH_DOMAINS).toContain(r.domain);
        expect(typeof r.command).toBe('string');
        expect(r.command.length).toBeGreaterThan(0);
      }
    });
  },
  SCAN_TIMEOUT,
);

describe(
  'search() API — filters',
  () => {
    it('--type component returns only components', async () => {
      const {data} = await search('modal', {...OPTS, type: 'component'});
      expect(data.results.length).toBeGreaterThan(0);
      for (const r of data.results) {
        expect(r.domain).toBe('component');
      }
    });

    it('--type doc returns only docs', async () => {
      const {data} = await search('color', {...OPTS, type: 'doc'});
      for (const r of data.results) {
        expect(r.domain).toBe('doc');
      }
    });

    it('--type theme returns only themes, each with the command that adds it', async () => {
      const {data} = await search('warm', {...OPTS, type: 'theme'});
      expect(data.results.map(r => r.name)).toContain('neutral');
      for (const r of data.results) {
        expect(r.domain).toBe('theme');
        expect(r.command).toBe(`astryx theme add ${r.name}`);
      }
    });

    it('respects --limit', async () => {
      const {data} = await search('button', {...OPTS, limit: 3});
      expect(data.results.length).toBeLessThanOrEqual(3);
    });

    it('rejects an unknown --type', async () => {
      await expect(search('x', {...OPTS, type: 'bogus'})).rejects.toThrow(
        /Unknown --type/,
      );
    });
  },
  SCAN_TIMEOUT,
);

describe(
  'search() API — fuzzy / typo tolerance',
  () => {
    it('finds Button for the typo "buton"', async () => {
      const {data} = await search('buton', OPTS);
      const button = data.results.find(r => r.name === 'Button');
      expect(button).toBeTruthy();
      expect(button.domain).toBe('component');
    });
  },
  SCAN_TIMEOUT,
);

describe(
  'search() API — empty + envelope',
  () => {
    it('returns an empty result set (not an error) for a no-match query', async () => {
      const {type, data} = await search('zzqqxx_definitely_no_match', OPTS);
      expect(type).toBe('search');
      expect(data.results).toEqual([]);
      expect(data.query).toBe('zzqqxx_definitely_no_match');
    });

    it('throws when the query is empty', async () => {
      await expect(search('', OPTS)).rejects.toThrow(/query is required/);
    });

    it('returns the correct envelope shape', async () => {
      const result = await search('button', OPTS);
      expect(result.type).toBe('search');
      expect(result.data).toHaveProperty('query');
      expect(Array.isArray(result.data.results)).toBe(true);
      const top = result.data.results[0];
      expect(top).toHaveProperty('domain');
      expect(top).toHaveProperty('name');
      expect(top).toHaveProperty('score');
      expect(top).toHaveProperty('description');
      expect(top).toHaveProperty('command');
    });
  },
  SCAN_TIMEOUT,
);

describe('scoreCandidate()', () => {
  it('scores an exact name match at 100', () => {
    expect(scoreCandidate('button', {name: 'button'}).score).toBe(100);
  });

  it('scores an exact keyword above a description mention', () => {
    const kw = scoreCandidate('toggle', {name: 'Switch', keywords: ['toggle']});
    const desc = scoreCandidate('toggle', {
      name: 'Switch',
      description: 'A toggle control',
    });
    expect(kw.score).toBeGreaterThan(desc.score);
  });

  it('returns null when nothing matches', () => {
    expect(
      scoreCandidate('zzzz', {name: 'Button', keywords: ['cta']}),
    ).toBeNull();
  });
});

describe(
  'search CLI — exit codes + JSON contract',
  () => {
    it('exits 0 for a successful search', async () => {
      const r = await runCli(['search', 'button'], REPO_ROOT);
      expect(r.status).toBe(0);
    });

    it('exits 0 for a no-match query (valid empty result, not failure)', async () => {
      const r = await runCli(['search', 'zzqqxx_no_match'], REPO_ROOT);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('No results');
    });

    it(
      'takes every word after `search` as one query',
      async () => {
        // Commander took only the first word, so `search dark mode` searched for
        // "dark" and dropped "mode" without a word.
        const json = await runCli(
          ['--json', 'search', 'dark', 'mode', '--type', 'doc'],
          REPO_ROOT,
        );
        expect(json.status).toBe(0);
        const env = JSON.parse(json.stdout);
        expect(env.data.query).toBe('dark mode');
        // theme topic-level and section tie; either is correct
        const top = env.data.results[0];
        expect(
          top.name === 'theme' ||
            top.name === 'use-a-theme' ||
            top.section === 'light-dark-mode',
        ).toBe(true);
        const text = await runCli(
          ['search', 'dark', 'mode', '--type', 'doc'],
          REPO_ROOT,
        );
        expect(text.stdout).toContain('Results for "dark mode"');
      },
      SCAN_TIMEOUT,
    );

    it('exits 1 for an invalid --type', async () => {
      const r = await runCli(['search', 'x', '--type', 'bogus'], REPO_ROOT);
      expect(r.status).toBe(1);
    });

    it('exits 1 for an invalid --limit', async () => {
      const r = await runCli(['search', 'x', '--limit', '0'], REPO_ROOT);
      expect(r.status).toBe(1);
    });

    it.each(['1.5', '5abc'])(
      'refuses --limit %s like search({limit}) does, in both modes',
      async value => {
        await expect(
          search('x', {...OPTS, limit: Number(value)}),
        ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
        const json = await runCli(
          ['--json', 'search', 'x', '--limit', value],
          REPO_ROOT,
        );
        expect(json.status).toBe(1);
        expect(JSON.parse(json.stdout)).toMatchObject({
          code: 'ERR_INVALID_ARGUMENT',
        });
        const text = await runCli(['search', 'x', '--limit', value], REPO_ROOT);
        expect(text.status).toBe(1);
      },
    );

    it('emits a valid --json envelope', async () => {
      const r = await runCli(['--json', 'search', 'button'], REPO_ROOT);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.apiVersion).toBe(1);
      expect(parsed.type).toBe('search');
      expect(parsed.data.query).toBe('button');
      expect(Array.isArray(parsed.data.results)).toBe(true);
      expect(parsed.data.matchCount).toBeGreaterThanOrEqual(
        parsed.data.results.length,
      );
      expect(parsed.data.results[0].name).toBe('Button');
    });

    it('says how many matched when --limit cut the list short', async () => {
      // The text view is a projection of the JSON, and the JSON now carries the
      // match total. A bare "(2)" heading over a capped list reads as "that is
      // all Astryx has", which is the conclusion `search` exists to prevent.
      const capped = await runCli(
        ['search', 'button', '--type', 'component', '--limit', '2'],
        REPO_ROOT,
      );
      expect(capped.status).toBe(0);
      expect(capped.stdout).toMatch(/^Results for "button" \(2 of \d+\)$/m);

      const uncapped = await runCli(
        ['search', 'button', '--type', 'component', '--limit', '500'],
        REPO_ROOT,
      );
      expect(uncapped.stdout).toMatch(/^Results for "button" \(\d+\)$/m);
      expect(uncapped.stdout).not.toMatch(/Results for "button" \(\d+ of/);
    });

    it('emits a valid --json envelope with empty results for no match', async () => {
      const r = await runCli(
        ['--json', 'search', 'zzqqxx_no_match'],
        REPO_ROOT,
      );
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.type).toBe('search');
      expect(parsed.data.results).toEqual([]);
      expect(parsed.data.matchCount).toBe(0);
    });

    it('renders each result as a greppable key: value record', async () => {
      const r = await runCli(['search', 'button'], REPO_ROOT);
      expect(r.stdout).toMatch(
        /^command:\s+\S.*(?:astryx|@astryxdesign\/cli(?:@\S+)?) component Button$/m,
      );
      // Fields mirror the JSON object and are line-greppable.
      expect(r.stdout).toMatch(/^name:\s+Button$/m);
      expect(r.stdout).toMatch(/^domain:\s+component$/m);
      expect(r.stdout).toContain('description:');
    });

    it('prints every result field under its JSON key (score and reason with --verbose)', async () => {
      // Between them these reach every domain, so every per-domain field shows.
      // A theme matches `theme` only through its description, a prose mention
      // ranked below every name and keyword hit, so the theme domain comes from
      // a theme's own name.
      const domains = new Set();
      for (const args of [
        ['search', 'theme', '--limit', '60'],
        ['search', 'neutral', '--type', 'theme'],
      ]) {
        const env = JSON.parse(
          (await runCli(['--json', ...args], REPO_ROOT)).stdout,
        );
        const plain = (await runCli(args, REPO_ROOT)).stdout.split('\n');
        const verbose = (
          await runCli([...args, '--verbose'], REPO_ROOT)
        ).stdout.split('\n');
        for (const result of env.data.results) {
          domains.add(result.domain);
          for (const [key, value] of Object.entries(result)) {
            if (value == null || value === '') continue;
            const label = `${result.domain} ${result.name}: ${key}`;
            expect(printsField(verbose, key, value), label).toBe(true);
            if (key !== 'score' && key !== 'reason') {
              expect(printsField(plain, key, value), label).toBe(true);
            }
          }
        }
      }
      expect(domains).toEqual(new Set(SEARCH_DOMAINS));
    }, 90_000);

    it('--verbose exits 0 and prints import/match detail', async () => {
      // Regression: the boolean verbose flag was named --detail, which collided
      // with the value-taking global `--detail <level>` — a bare `search
      // --detail` errored "argument missing" and the verbose output was
      // unreachable. It is now `--verbose`.
      const r = await runCli(['search', 'button', '--verbose'], REPO_ROOT);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('import:');
      // Ranking detail: pre-formatter this was a single `match: <reason> (score N)`
      // line; it's now separate `score:` / `reason:` record fields mirroring --json.
      expect(r.stdout).toContain('score:');
      expect(r.stdout).toContain('reason:');
    });

    it('points at discover for packages that could add more, except for hooks', async () => {
      const open = await runCli(['search', 'data', 'table'], REPO_ROOT);
      expect(open.status).toBe(0);
      expect(open.stdout).toMatch(
        /^More in packages you could add: .*discover 'data table'$/m,
      );
      const none = await runCli(['search', 'zzqqxxnomatch'], REPO_ROOT);
      expect(none.stdout).toMatch(
        /^More in packages you could add: .*discover zzqqxxnomatch$/m,
      );
      const hooks = await runCli(
        ['search', 'click', '--type', 'hook'],
        REPO_ROOT,
      );
      expect(hooks.status).toBe(0);
      expect(hooks.stdout).not.toContain('More in packages you could add');
      const json = await runCli(['--json', 'search', 'button'], REPO_ROOT);
      expect(json.stdout).not.toContain('More in packages you could add');
    });

    it("finds components in an open search outside a project and in a fresh clone, reading the release's own Core", async () => {
      const empty = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-search-cli-carried-'),
      );
      const clone = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-search-cli-clone-'),
      );
      // A fresh clone: it declares Core, with nothing installed.
      fs.writeFileSync(
        path.join(clone, 'package.json'),
        JSON.stringify({
          name: 'clone',
          dependencies: {'@astryxdesign/core': '*'},
        }),
      );
      try {
        for (const dir of [empty, clone]) {
          const run = await runCli(['--json', 'search', 'button'], dir);
          expect(run.status).toBe(0);
          const envelope = JSON.parse(run.stdout);
          expect(envelope.meta?.partial).toBeUndefined();
          expect(
            envelope.data.results.some(
              (/** @type {any} */ r) =>
                r.domain === 'component' && r.name === 'Button',
            ),
          ).toBe(true);
        }
      } finally {
        fs.rmSync(empty, {recursive: true, force: true});
        fs.rmSync(clone, {recursive: true, force: true});
      }
    });

    it('searches the docs and themes when no @astryxdesign/core is reachable, and exits 1 for --type component', async () => {
      const empty = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-search-cli-no-core-'),
      );
      // The project's own CLI answers here and no Core is installed; outside a
      // project the carried Core would answer instead (AST-081 FR3).
      linkThisCliAsProjectCli(empty);
      try {
        const open = await runCli(
          ['--json', 'search', 'make', 'an', 'integration'],
          empty,
        );
        expect(open.status).toBe(0);
        expect(JSON.parse(open.stdout).data.results[0]).toMatchObject({
          domain: 'doc',
        });
        // Never silently: JSON names what it skipped and why.
        expect(JSON.parse(open.stdout).meta.partial).toMatchObject({
          skipped: ['component', 'hook', 'template'],
          reason: expect.stringContaining('@astryxdesign/core'),
        });
        // Bundled themes need no project, so an open search finds them too.
        const theme = await runCli(['--json', 'search', 'neutral'], empty);
        expect(theme.status).toBe(0);
        expect(JSON.parse(theme.stdout).data.results[0]).toMatchObject({
          domain: 'theme',
          name: 'neutral',
        });
        // The text says the search covered the docs and themes alone.
        const text = await runCli(['search', 'button'], empty);
        expect(text.status).toBe(0);
        expect(text.stdout).toContain('only the docs and themes were searched');
        expect(text.stderr).toMatch(
          /^astryx: components, hooks, and templates were not searched: /mu,
        );
        // A themes-only search needs no core, like a docs-only one.
        const themes = await runCli(
          ['--json', 'search', 'warm', '--type', 'theme'],
          empty,
        );
        expect(themes.status).toBe(0);
        const found = JSON.parse(themes.stdout).data.results;
        expect(found.map(r => r.name)).toContain('neutral');
        expect(found.every(r => r.domain === 'theme')).toBe(true);
        const json = await runCli(
          ['--json', 'search', 'button', '--type', 'component'],
          empty,
        );
        expect(json.status).toBe(1);
        expect(JSON.parse(json.stdout)).toMatchObject({
          code: 'ERR_CORE_NOT_FOUND',
        });
      } finally {
        fs.rmSync(empty, {recursive: true, force: true});
      }
    });
  },
  SCAN_TIMEOUT,
);
