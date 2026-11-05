// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for hook-discovery, run against the real
 * @astryxdesign/core source tree plus throwaway fixtures. Pins the
 * category grouping, the missing-src guarding (which differs from
 * component-discovery), and the Levenshtein fuzzy-fallback in findHookDoc.
 * Also gates the index against the hooks barrel: every hook the built barrel
 * exports must be discoverable, so adding a hook without a doc fails here.
 */

import {describe, it, expect, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  discoverHooks,
  findHookDoc,
  getAllHookNames,
} from './hook-discovery.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const CORE = path.join(REPO, 'packages', 'core');
const SLOW = 30_000;

const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true});
});

describe('discoverHooks (real core)', () => {
  it(
    'discovers real hooks grouped by category',
    () => {
      const hooks = discoverHooks(CORE);
      const cats = Object.keys(hooks);
      expect(cats.length).toBeGreaterThan(1);
      if (cats.includes('Other')) expect(cats[cats.length - 1]).toBe('Other');
      const nonOther = cats.filter(c => c !== 'Other');
      expect([...nonOther].sort((a, b) => a.localeCompare(b))).toEqual(
        nonOther,
      );
      for (const members of Object.values(hooks)) {
        expect([...members].sort()).toEqual(members);
      }
      const all = getAllHookNames(CORE);
      expect(all).toContain('useMediaQuery');
      expect(all.length).toBeGreaterThan(10);
    },
    SLOW,
  );

  it('capitalizes categories and buckets category-less docs into Other', () => {
    const core = mkTmp('as-hd-cat-');
    const hooksDir = path.join(core, 'src', 'hooks');
    fs.mkdirSync(hooksDir, {recursive: true});
    fs.writeFileSync(
      path.join(hooksDir, 'useThing.doc.mjs'),
      "export default {\n  category: 'layout',\n};\n",
    );
    fs.writeFileSync(
      path.join(hooksDir, 'useOrphan.doc.mjs'),
      'export default {};\n',
    );
    expect(discoverHooks(core)).toEqual({
      Layout: ['useThing'],
      Other: ['useOrphan'],
    });
  });

  it('discovers use*.doc.mjs colocated in component directories', () => {
    const core = mkTmp('as-hd-colo-');
    const compDir = path.join(core, 'src', 'Resizable');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(compDir, 'useResizable.doc.mjs'),
      "export default {\n  category: 'interaction',\n};\n",
    );
    expect(discoverHooks(core)).toEqual({Interaction: ['useResizable']});
  });

  it('returns {} when src/ is missing (guarded with existsSync)', () => {
    const core = mkTmp('as-hd-nosrc-');
    expect(discoverHooks(core)).toEqual({});
    expect(getAllHookNames(core)).toEqual([]);
  });
});

describe('findHookDoc (real core)', () => {
  it(
    'resolves an exact hook name',
    () => {
      expect(findHookDoc(CORE, 'useMediaQuery')).toMatch(
        /useMediaQuery\.doc\.mjs$/,
      );
    },
    SLOW,
  );

  it(
    'resolves a bare (use-prefix-stripped, case-insensitive) name',
    () => {
      expect(findHookDoc(CORE, 'mediaquery')).toMatch(
        /useMediaQuery\.doc\.mjs$/,
      );
    },
    SLOW,
  );

  it('returns null when src/ is missing (guarded)', () => {
    const core = mkTmp('as-fhd-nosrc-');
    expect(findHookDoc(core, 'useFoo')).toBeNull();
  });
});

describe('findHookDoc fuzzy Levenshtein fallback (pinned current behavior)', () => {
  it(
    'auto-resolves a typo within edit distance 3',
    () => {
      expect(getAllHookNames(CORE)).not.toContain('useLayers');
      expect(getAllHookNames(CORE)).toContain('useLayer');
      expect(findHookDoc(CORE, 'useLayers')).toMatch(/useLayer\.doc\.mjs$/);
    },
    SLOW,
  );

  it(
    'returns null when the closest hook is farther than distance 3',
    () => {
      expect(findHookDoc(CORE, 'useZzzzzz')).toBeNull();
      expect(findHookDoc(CORE, 'zzzzzzzzzz')).toBeNull();
    },
    SLOW,
  );
});

/**
 * The set of hooks a barrel actually exports, read from the module itself
 * rather than from its text. Importing is what makes this a derivation: it sees
 * `export * from` re-exports, aliases and any other form the language allows,
 * and type-only exports have already been erased. A regex over the source can
 * only see the spellings someone thought to write a pattern for.
 * @param {string} entry absolute path to a built ESM barrel
 */
async function exportedHookNames(entry) {
  const mod = await import(pathToFileURL(entry).href);
  return new Set(Object.keys(mod).filter(name => /^use[A-Z]/.test(name)));
}

describe('core hooks barrel coverage (real core)', () => {
  // Discovery is filesystem-driven: a hook is only reachable from `astryx hook`
  // and `astryx search` if it ships a .doc.mjs. Nothing about adding a hook
  // forces one, so the index silently goes stale; seven exported hooks,
  // useAnnounce among them, were invisible until this check existed.
  //
  // Only the standalone hooks in src/hooks/ are in scope. Hooks that belong to
  // a component's API (useDialog, useToast, ...) are documented in that
  // component's directory and deliberately never enter this barrel, so their
  // absence from it is not a defect.
  it(
    'every hook exported from the barrel has a doc and is discoverable',
    async () => {
      // The built barrel, not src/hooks/index.ts: this suite runs in the `node`
      // project, which has no StyleX babel transform, so importing core's TS
      // source throws on the first stylex.defineVars it reaches. dist is present
      // because the project's globalSetup builds core before any worker forks.
      const exported = await exportedHookNames(
        path.join(CORE, 'dist', 'hooks', 'index.js'),
      );
      expect(exported.size).toBeGreaterThan(10);

      const discovered = new Set(getAllHookNames(CORE));
      const missing = [...exported]
        .filter(name => !discovered.has(name))
        .sort();
      if (missing.length) {
        throw new Error(
          `${missing.length} exported hook(s) are missing from the CLI hook index, so ` +
            `\`astryx hook <name>\` and \`astryx search\` deny they exist. Add a ` +
            `<hook>.doc.mjs next to each hook in packages/core/src/hooks/:\n  ${missing.join('\n  ')}`,
        );
      }
      expect(missing).toEqual([]);
    },
    SLOW,
  );

  it('sees hooks re-exported with `export *`, which a regex over `export {…}` misses', async () => {
    const dir = mkTmp('as-hd-star-');
    fs.writeFileSync(
      path.join(dir, 'useStarred.mjs'),
      'export function useStarred() {}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'useNamed.mjs'),
      'export function useNamed() {}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'index.mjs'),
      "export * from './useStarred.mjs';\nexport {useNamed} from './useNamed.mjs';\n",
    );

    expect(await exportedHookNames(path.join(dir, 'index.mjs'))).toEqual(
      new Set(['useStarred', 'useNamed']),
    );
  });
});
