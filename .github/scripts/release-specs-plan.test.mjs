// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for release-specs-plan.mjs and release-spec-visits.mjs:
 *   which release specs a change runs, and in which shard (spec:AST-030
 *   FR32).
 * @position A release spec runs when the change adds or changes it, changes
 *   a module it imports, or changes the rendered source of a component it
 *   visits; an unresolved visit runs it; imports that cannot be followed run
 *   them all. Shards hold every spec once, each at most twelve minutes.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  componentFolderOf,
  componentPathOf,
  proofImporters,
} from './a11y-pr-contracts.mjs';
import {
  isReleaseFile,
  planReleaseSpecs,
  SHARD_SECONDS,
  shardSpecs,
  UNKNOWN_SECONDS,
} from './release-specs-plan.mjs';
import {releaseSpecs, specVisits, storyFiles} from './release-spec-visits.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SPEC =
  'packages/core/src/Table/__tests__/Table.release.a11y.chromium.spec.ts';
const OTHER =
  'packages/core/src/List/__tests__/List.release.a11y.chromium.spec.ts';
const TAGGED = 'packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts';
const PATTERN = 'internal/a11y-spec/src/patterns/tabs.chromium.spec.ts';
const MAP = {
  stories: {'a11y-link-pattern': ['packages/core/src/Link/']},
  pages: {'Table.release.html': ['packages/core/src/Table/']},
};

/** A scratch checkout holding `files`, planned with the real import graph. */
function planIn(files, changed, map = MAP) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-plan-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  }
  const listed = Object.keys(files);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  try {
    return planReleaseSpecs({
      listed,
      changed,
      read,
      importers: specs =>
        proofImporters({root, listed, isProof: f => specs.includes(f), read}),
      map,
    });
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

const STORY = (title, component, folder) =>
  `import {${component}} from '@astryxdesign/core/${folder}';\nimport {Button} from '@astryxdesign/core/Button';\nconst meta = {\n  title: '${title}',\n  component: ${component},\n};\nexport default meta;\n`;

const TREE = {
  [SPEC]:
    "import {startRowFixture} from './Table.release.harness';\nawait page.goto(`${fixture.origin}/Table.release.html`);\n",
  'packages/core/src/Table/__tests__/Table.release.harness.ts':
    "import {rows} from '../tableRows';\nexport const startRowFixture = rows;\n",
  'packages/core/src/Table/tableRows.ts': 'export const rows = 1;\n',
  'packages/core/src/Table/Table.tsx': 'export const Table = 1;\n',
  [OTHER]: '\n',
  [TAGGED]:
    '// @pr-a11y release-only\nawait page.goto(`${storybook.origin}/iframe.html?id=core-link-navigation--destinations`);\n',
  'packages/core/src/Link/Link.tsx': 'export const Link = 1;\n',
  'packages/core/src/Link/Link.doc.mjs': 'export default {};\n',
  'packages/core/src/Button/Button.tsx': 'export const Button = 1;\n',
  'packages/core/src/Markdown/Markdown.tsx': 'export const Markdown = 1;\n',
  [PATTERN]:
    "// @pr-a11y release-only\nimport {TABS} from './tabs.fixtures';\n",
  'internal/a11y-spec/src/patterns/tabs.fixtures.ts':
    'export const TABS = 1;\n',
  'apps/storybook/stories/LinkNavigation.stories.tsx': STORY(
    'Core/Link Navigation',
    'Link',
    'Link',
  ),
};

describe('release specs', () => {
  it('are release files and specs tagged @pr-a11y release-only, in packages and internal harnesses', () => {
    expect(isReleaseFile(SPEC)).toBe(true);
    expect(
      isReleaseFile('packages/core/src/Table/Table.release.harness.ts'),
    ).toBe(false);
    const read = file => TREE[file];
    expect(releaseSpecs(Object.keys(TREE), read)).toEqual(
      [OTHER, PATTERN, SPEC, TAGGED].sort(),
    );
  });
});

describe('planReleaseSpecs', () => {
  it('runs a release spec the change adds or changes, tagged ones included', () => {
    expect(planIn(TREE, [SPEC]).specs).toEqual([SPEC]);
    expect(planIn(TREE, [TAGGED]).specs).toEqual([TAGGED]);
    expect(planIn(TREE, [PATTERN]).specs).toEqual([PATTERN]);
    expect(
      planIn(TREE, ['internal/a11y-spec/src/patterns/tabs.fixtures.ts']).specs,
    ).toEqual([PATTERN]);
  });

  it('runs a release spec that imports a changed module, directly or through its harness', () => {
    expect(
      planIn(TREE, [
        'packages/core/src/Table/__tests__/Table.release.harness.ts',
      ]).specs,
    ).toContain(SPEC);
    expect(
      planIn(TREE, ['packages/core/src/Table/tableRows.ts']).specs,
    ).toContain(SPEC);
  });

  it("runs a spec when the component its story id names changes, not the story's other components", () => {
    // core-link-navigation is Link's story: its meta's component.
    expect(planIn(TREE, ['packages/core/src/Link/Link.tsx']).specs).toEqual([
      TAGGED,
    ]);
    // The story renders a Button too, but Button is not what it visits.
    expect(planIn(TREE, ['packages/core/src/Button/Button.tsx']).specs).toEqual(
      [],
    );
  });

  it("runs no spec for a change that renders nothing, such as a component's doc", () => {
    expect(planIn(TREE, ['packages/core/src/Link/Link.doc.mjs']).specs).toEqual(
      [],
    );
  });

  it('runs a spec for a fixture page the map names', () => {
    expect(planIn(TREE, ['packages/core/src/Table/Table.tsx']).specs).toEqual([
      SPEC,
    ]);
  });

  it('adds what a @visits line names, and removes nothing', () => {
    const tagged = {
      ...TREE,
      [TAGGED]: `// @pr-a11y release-only\n// @visits Markdown\n${TREE[TAGGED]}`,
    };
    expect(
      planIn(tagged, ['packages/core/src/Markdown/Markdown.tsx']).specs,
    ).toEqual([TAGGED]);
    expect(planIn(tagged, ['packages/core/src/Link/Link.tsx']).specs).toEqual([
      TAGGED,
    ]);
  });

  it('runs a spec whose visit cannot be resolved, on any change', () => {
    const cases = {
      'an a11y-* id missing from the map':
        "// @pr-a11y release-only\nconst id = 'a11y-tabs-pattern--default';\n",
      'a page missing from the map':
        '// @pr-a11y release-only\nawait page.goto(`${storybook.origin}/unknown.html`);\n',
      'a story id no story file makes':
        "// @pr-a11y release-only\nconst id = 'core-nothing--default';\n",
      'a story id it never names':
        '// @pr-a11y release-only\nawait page.goto(`${storybook.origin}/iframe.html?id=${id}`);\n',
      'a sandbox page':
        "// @pr-a11y release-only\nconst id = 'core-link-navigation--destinations';\nawait page.goto(SANDBOX_URL + '/components/link');\n",
      'a @visits name no folder holds':
        "// @pr-a11y release-only\n// @visits Nothing\nconst id = 'core-link-navigation--destinations';\n",
    };
    for (const [what, text] of Object.entries(cases)) {
      const plan = planIn({...TREE, [TAGGED]: text}, [
        'packages/core/src/Button/Button.tsx',
      ]);
      expect(plan.specs, what).toEqual([TAGGED]);
      expect(plan.reasons[TAGGED], what).toContain('cannot be resolved');
    }
  });

  it('fills a templated story id from the quoted names that make a story', () => {
    const templated = {
      ...TREE,
      [TAGGED]:
        "// @pr-a11y release-only\nasync function open(component = 'link-navigation') {\n  await page.goto(`${storybook.origin}/iframe.html?id=core-${component}--destinations`);\n}\n",
    };
    expect(
      planIn(templated, ['packages/core/src/Link/Link.tsx']).specs,
    ).toEqual([TAGGED]);
  });

  it('runs every release spec when the imports cannot be followed', () => {
    const read = file => TREE[file];
    const plan = planReleaseSpecs({
      listed: Object.keys(TREE),
      changed: ['packages/core/src/Table/Table.tsx'],
      read,
      importers: () => {
        throw new Error('ENOENT: tableRows.ts');
      },
      map: MAP,
    });
    expect(plan.specs).toEqual([OTHER, PATTERN, SPEC, TAGGED].sort());
    expect(plan.reasons[OTHER]).toContain('could not be followed');
  });

  it('runs every release spec, with the reason, when the change has no file list', () => {
    const read = file => TREE[file];
    const plan = planReleaseSpecs({
      listed: Object.keys(TREE),
      changed: [],
      read,
      importers: () => new Map(),
      map: MAP,
      everything:
        'GitHub truncated the changed-file list, so every release spec runs',
    });
    expect(plan.specs).toEqual([OTHER, PATTERN, SPEC, TAGGED].sort());
    expect(plan.reasons[SPEC]).toContain('truncated');
  });

  it('runs nothing for a deleted release spec', () => {
    const {[OTHER]: _deleted, ...rest} = TREE;
    expect(planIn(rest, [OTHER]).specs).toEqual([]);
  });
});

describe('the release specs of this repository', () => {
  const listed = execFileSync('git', ['-C', ROOT, 'ls-files'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const map = JSON.parse(read('.github/release-spec-visits.json'));
  const NAVIGATION =
    'packages/core/src/Link/__tests__/Link.navigation.a11y.chromium.spec.ts';
  const plan = changed =>
    planReleaseSpecs({
      listed,
      changed,
      read,
      importers: specs =>
        proofImporters({
          root: ROOT,
          listed,
          isProof: f => specs.includes(f),
          read,
        }),
      map,
    });

  it('resolves every visit, so none runs on every pull request', () => {
    const stories = storyFiles(listed, read);
    for (const spec of releaseSpecs(listed, read))
      expect(
        specVisits(spec, {listed, read, stories, map}).unresolved,
        spec,
      ).toEqual([]);
  });

  it('runs Link.navigation for a Markdown change through its @visits line, not for a Markdown doc', () => {
    expect(plan(['packages/core/src/Markdown/Markdown.tsx']).specs).toContain(
      NAVIGATION,
    );
    expect(plan(['packages/core/src/Link/Link.tsx']).specs).toContain(
      NAVIGATION,
    );
    expect(
      plan(['packages/core/src/Markdown/Markdown.doc.mjs']).specs,
    ).not.toContain(NAVIGATION);
  });

  it('visits the component folder that holds each release spec', () => {
    // A spec in a component's folder proves that component; when its stories
    // name another one, a `@visits` line names its own.
    const stories = storyFiles(listed, read);
    for (const spec of releaseSpecs(listed, read)) {
      const own = componentFolderOf(spec) ? componentPathOf(spec) : null;
      if (own)
        expect(
          specVisits(spec, {listed, read, stories, map}).folders,
          spec,
        ).toContain(own);
    }
  });

  it('maps every folder in the visit map to a folder that exists', () => {
    const folders = [
      ...Object.values(map.stories).flat(),
      ...Object.values(map.pages).flat(),
    ];
    for (const folder of folders)
      expect(
        listed.some(file => componentPathOf(file) === folder),
        folder,
      ).toBe(true);
  });

  it("covers each a11y story owner of a mapped pattern with that owner's folder", async () => {
    const {A11Y_STORY_OWNER_PREFIXES} =
      await import('./lib/a11y-story-identity.js');
    for (const [prefix, owner] of A11Y_STORY_OWNER_PREFIXES) {
      const id = prefix.split('--')[0];
      if (!map.stories[id]) continue;
      const [pkg, name] = owner.split('/');
      const folder = listed
        .find(file =>
          new RegExp(`^packages/${pkg}/src/[A-Z][^/]*/${name}\\.tsx$`).test(
            file,
          ),
        )
        ?.replace(/[^/]+$/, '');
      expect(map.stories[id], `${prefix} → ${owner}`).toContain(folder);
    }
  });
});

describe('shardSpecs', () => {
  const specs = n => Array.from({length: n}, (_, i) => `s${i}.spec.ts`);

  it('holds every spec once, each shard at most twelve minutes', () => {
    const all = specs(40);
    const seconds = Object.fromEntries(all.map((s, i) => [s, 30 + i * 7]));
    const shards = shardSpecs(all, seconds);
    expect(shards.flatMap(shard => shard.specs).sort()).toEqual(
      [...all].sort(),
    );
    for (const shard of shards)
      expect(shard.seconds).toBeLessThanOrEqual(SHARD_SECONDS);
    const total = all.reduce((sum, s) => sum + seconds[s], 0);
    expect(shards.length).toBeGreaterThanOrEqual(
      Math.ceil(total / SHARD_SECONDS),
    );
  });

  it('counts a spec with no recorded time as one minute', () => {
    const shards = shardSpecs(specs(13), {});
    expect(UNKNOWN_SECONDS).toBe(60);
    // Thirteen minutes of unknown specs: two shards, none over twelve.
    expect(shards).toHaveLength(2);
    expect(shards.reduce((sum, shard) => sum + shard.seconds, 0)).toBe(780);
    for (const shard of shards)
      expect(shard.seconds).toBeLessThanOrEqual(SHARD_SECONDS);
  });

  it('gives a spec longer than a shard a shard of its own, and keeps the others within the limit', () => {
    const shards = shardSpecs(['long', 'a', 'b', 'c'], {
      long: 900,
      a: 400,
      b: 400,
      c: 400,
    });
    expect(shards.find(shard => shard.specs.includes('long')).specs).toEqual([
      'long',
    ]);
    for (const shard of shards.filter(each => each.specs.length > 1))
      expect(shard.seconds).toBeLessThanOrEqual(SHARD_SECONDS);
    expect(shards.flatMap(shard => shard.specs).sort()).toEqual([
      'a',
      'b',
      'c',
      'long',
    ]);
  });

  it('plans no shard for no spec', () => {
    expect(shardSpecs([], {})).toEqual([]);
  });
});

describe('componentPathOf', () => {
  it("names a file's component folder, or its package's source folder", () => {
    expect(componentPathOf('packages/core/src/Button/Button.tsx')).toBe(
      'packages/core/src/Button/',
    );
    expect(
      componentPathOf('packages/core/src/Button/__tests__/Button.test.tsx'),
    ).toBe('packages/core/src/Button/');
    expect(componentFolderOf('packages/core/src/Button/Button.tsx')).toBe(
      'core/Button',
    );
    // Rich Text has no component folders: the package is the component.
    expect(componentPathOf('packages/richtext/src/plugins/Code.tsx')).toBe(
      'packages/richtext/src/',
    );
    expect(componentFolderOf('packages/richtext/src/plugins/Code.tsx')).toBe(
      null,
    );
    expect(componentPathOf('apps/storybook/stories/Button.stories.tsx')).toBe(
      null,
    );
  });
});
