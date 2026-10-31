// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the `component` command dispatcher
 * (api/component/component.mjs), run against the real @astryxdesign/core
 * registry. `component` fans out to list/detail(+props/source/showcase/blocks)
 * leaves; this pins the DISPATCH + precedence rules that no other suite covered
 * (component had no api-level tests). Locks behavior so a future refactor of the
 * router can't silently change which leaf a given arg/flag combination hits.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {component} from './component.mjs';
import {search} from '../search/search.mjs';
import {AstryxError} from '../error.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// api/component/ -> up 4 = repo root (has packages/core, which findCoreDir walks to).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const cwd = REPO;
const SLOW = 30_000;

describe('component dispatcher — routing', () => {
  it(
    'routes a bare name to component.detail',
    async () => {
      const r = await component('Button', {cwd});
      expect(r.type).toBe('component.detail');
      expect(r.data.name).toBe('Button');
    },
    SLOW,
  );

  it(
    'routes no-name to the list leaf (component.list, detail=names)',
    async () => {
      const r = await component(undefined, {cwd});
      expect(r.type).toBe('component.list');
      expect(r.data.detail).toBe('names');
      expect(Object.keys(r.data.components).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'routes --category to the list leaf, filtered to that group',
    async () => {
      const r = await component(undefined, {cwd, category: 'Layout'});
      expect(r.type).toBe('component.list');
      expect(Object.keys(r.data.components)).toContain('Layout');
    },
    SLOW,
  );

  it(
    'treats an empty-string name as a list (not a not-found error)',
    async () => {
      const r = await component('', {cwd});
      expect(r.type).toBe('component.list');
    },
    SLOW,
  );
});

describe('component dispatcher — detail levels on list', () => {
  it(
    '--detail compact lists with detail=compact',
    async () => {
      const r = await component(undefined, {
        cwd,
        list: true,
        detail: 'compact',
      });
      expect(r.type).toBe('component.list');
      expect(r.data.detail).toBe('compact');
    },
    SLOW,
  );

  it(
    '--detail full lists with detail=full',
    async () => {
      const r = await component(undefined, {cwd, list: true, detail: 'full'});
      expect(r.type).toBe('component.list');
      expect(r.data.detail).toBe('full');
    },
    SLOW,
  );
});

describe('component list — components whose docs live in a family folder', () => {
  it('lists HStack, VStack and Heading at every detail level, each with its own import', async () => {
    const {docs: stackDoc} = await import(
      path.join(REPO, 'packages', 'core', 'src', 'Stack', 'Stack.doc.mjs')
    );
    const vstackMember = stackDoc.components.find(c => c.name === 'VStack');

    const names = await component(undefined, {cwd, list: true});
    const listed = Object.values(names.data.components).flat();
    for (const name of ['HStack', 'VStack', 'Heading']) {
      expect(listed).toContainEqual({name, package: '@astryxdesign/core'});
    }

    const compact = await component(undefined, {cwd, list: true, detail: 'compact'});
    const brief = Object.values(compact.data.components).flat();
    expect(brief.find(e => e.name === 'VStack')).toEqual({
      name: 'VStack',
      package: '@astryxdesign/core',
      description: vstackMember.description,
      import: '@astryxdesign/core/VStack',
    });

    const full = await component(undefined, {cwd, list: true, detail: 'full'});
    const entry = Object.values(full.data.components)
      .flat()
      .find(e => e.name === 'VStack');
    // Shaped like every other full entry (a component doc plus its package):
    // the member's own name, display name and summary, and no scoping field
    // the full-entry type does not describe.
    expect(entry).toEqual({
      name: 'VStack',
      package: '@astryxdesign/core',
      displayName: vstackMember.displayName,
      group: stackDoc.group,
      category: stackDoc.category,
      usage: {description: vstackMember.description},
      props: vstackMember.props,
      theming: stackDoc.theming,
      import: '@astryxdesign/core/VStack',
    });
  }, SLOW);

  it('answers a Core-scoped lookup of a member with that member, as the unscoped lookup does', async () => {
    for (const name of ['HStack', 'VStack']) {
      const unscoped = await component(name, {cwd});
      const scoped = await component(name, {
        cwd,
        package: '@astryxdesign/core',
      });
      expect(scoped.data.name).toBe(name);
      expect(scoped.data.parentDoc).toBe('Stack');
      expect(scoped.data.import).toBe(`@astryxdesign/core/${name}`);
      expect(scoped.data.props).toEqual(unscoped.data.props);
      expect(scoped.data.props.length).toBeGreaterThan(0);
    }
  }, SLOW);

  it('prints each one\'s own import path in the list, the detail, and search', async () => {
    // The path `component <Name>` prints is the one docs and examples teach:
    // the component's own entry point, never its family's (/Stack, /Text) or
    // a re-export (/Layout).
    const compact = Object.values(
      (await component(undefined, {cwd, list: true, detail: 'compact'})).data.components,
    ).flat();
    const full = Object.values(
      (await component(undefined, {cwd, list: true, detail: 'full'})).data.components,
    ).flat();
    const textList = (await runCli(['component', '--list'], cwd)).stdout;
    const textCompact = (
      await runCli(['component', '--list', '--detail', 'compact'], cwd)
    ).stdout;
    /** The `import:` line of a text record, found by its `name:` line. */
    const textImport = (text, name) =>
      new RegExp(`^name:\\s+${name}\\n(?:(?!name:).*\\n)*?import:\\s+(\\S+)`, 'm').exec(
        text,
      )?.[1];
    for (const name of ['VStack', 'HStack', 'Heading']) {
      const expected = `@astryxdesign/core/${name}`;
      expect(compact.find(e => e.name === name)?.import).toBe(expected);
      expect((await component(name, {cwd})).data.import).toBe(expected);
      const hits = (await search(name, {cwd, type: 'component'})).data.results;
      expect(hits.find(r => r.name === name)?.import).toBe(expected);
      expect(textImport(textList, name)).toBe(expected);
      expect(textImport(textCompact, name)).toBe(expected);
    }
    // The full level spreads a component's own doc, which states no import
    // (Button's entry has none either); a member's entry is scoped to the
    // member and states its own.
    for (const name of ['VStack', 'HStack']) {
      expect(full.find(e => e.name === name)?.import).toBe(`@astryxdesign/core/${name}`);
    }
  }, SLOW);
});

describe('component dispatcher — projection precedence (locked)', () => {
  it(
    '--props routes to component.detail.props',
    async () => {
      const r = await component('Button', {cwd, props: true});
      expect(r.type).toBe('component.detail.props');
    },
    SLOW,
  );

  it(
    '--source routes to component.detail.source',
    async () => {
      const r = await component('Button', {cwd, source: true});
      expect(r.type).toBe('component.detail.source');
    },
    SLOW,
  );

  it(
    '--source WINS over --props when both are set (precedence lock)',
    async () => {
      const r = await component('Button', {cwd, props: true, source: true});
      expect(r.type).toBe('component.detail.source');
    },
    SLOW,
  );

  it(
    '--list WINS over a given name (list dispatch precedence lock)',
    async () => {
      const r = await component('Button', {cwd, list: true});
      expect(r.type).toBe('component.list');
    },
    SLOW,
  );
});

describe('component dispatcher — name resolution', () => {
  it(
    'strips a legacy XDS prefix (XDSButton -> Button)',
    async () => {
      const r = await component('XDSButton', {cwd});
      expect(r.type).toBe('component.detail');
      expect(r.data.name).toBe('Button');
    },
    SLOW,
  );

  it(
    'is case-SENSITIVE: a lowercased name is unknown',
    async () => {
      let err;
      try {
        await component('button', {cwd});
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe('ERR_UNKNOWN_COMPONENT');
    },
    SLOW,
  );

  it(
    'throws ERR_UNKNOWN_COMPONENT for a genuinely unknown name',
    async () => {
      let err;
      try {
        await component('ZzzNope99', {cwd});
      } catch (e) {
        err = e;
      }
      expect(err.code).toBe('ERR_UNKNOWN_COMPONENT');
    },
    SLOW,
  );

  it(
    'throws ERR_UNKNOWN_PACKAGE when --package names a missing package',
    async () => {
      let err;
      try {
        await component('Button', {cwd, package: '@nonexistent/pkg-xyz'});
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe('ERR_UNKNOWN_PACKAGE');
    },
    SLOW,
  );
});

describe('component dispatcher — scoped --package routes all projections', () => {
  const CORE = '@astryxdesign/core';

  it(
    '--package (core) routes --showcase like the no-scope path',
    async () => {
      const ns = await component('Button', {cwd, showcase: true});
      const sc = await component('Button', {
        cwd,
        package: CORE,
        showcase: true,
      });
      expect(sc.type).toBe(ns.type); // was silently component.detail before the fix
    },
    SLOW,
  );

  it(
    '--package (core) routes --blocks like the no-scope path',
    async () => {
      const ns = await component('Button', {cwd, blocks: true});
      const sc = await component('Button', {cwd, package: CORE, blocks: true});
      expect(sc.type).toBe(ns.type);
      expect(sc.type).toBe('component.detail.blocks');
    },
    SLOW,
  );

  it(
    "--props carries a prop doc's stability marker (Drawer's experimental prop)",
    async () => {
      const r = await component('Drawer', {cwd, props: true});
      expect(r.type).toBe('component.detail.props');
      const experimental = r.data.find(p => p.name === 'experimental');
      expect(experimental?.stability).toBe('experimental');
      // Only the experimental prop object is marked; stable props carry no field.
      expect(
        r.data.filter(p => p.stability !== undefined).map(p => p.name),
      ).toEqual(['experimental']);
    },
    SLOW,
  );

  it(
    '--props --json and the text props table both show the stability marker',
    async () => {
      const json = await runCli(
        ['component', 'Drawer', '--props', '--json'],
        cwd,
      );
      expect(json.status).toBe(0);
      const envelope = JSON.parse(json.stdout);
      expect(envelope.type).toBe('component.detail.props');
      expect(
        envelope.data.find(p => p.name === 'experimental')?.stability,
      ).toBe('experimental');

      const text = await runCli(['component', 'Drawer', '--props'], cwd);
      expect(text.status).toBe(0);
      const rows = text.stdout
        .split('\n')
        .filter(line => line.startsWith('| `'));
      const experimentalRow = rows.find(line =>
        line.startsWith('| `experimental` |'),
      );
      expect(experimentalRow).toContain('**(experimental)**');
      expect(
        rows.filter(line => line.includes('**(experimental)**')),
      ).toHaveLength(1);
    },
    SLOW,
  );

  it(
    '--package (core) still routes --source and --props',
    async () => {
      expect(
        (await component('Button', {cwd, package: CORE, source: true})).type,
      ).toBe('component.detail.source');
      expect(
        (await component('Button', {cwd, package: CORE, props: true})).type,
      ).toBe('component.detail.props');
    },
    SLOW,
  );
});

describe('component dispatcher — category guard', () => {
  it(
    'a non-string category throws a coded error (not a raw TypeError)',
    async () => {
      for (const bad of [123, {}, [1]]) {
        const err = await component(undefined, {
          cwd,
          category: /** @type {any} */ (bad),
        }).catch(e => e);
        expect(err).toBeInstanceOf(AstryxError);
        expect(err.code).toBe('ERR_UNKNOWN_CATEGORY');
      }
    },
    SLOW,
  );
});

describe('component dispatcher — detail and lang guards', () => {
  // `detail` and `lang` are the same controls as the CLI's --detail and --lang:
  // same accepted values, same error codes.
  it(
    'rejects a detail level the CLI rejects, with the same code',
    async () => {
      const cliRun = await runCli(
        ['--json', 'component', '--list', '--detail', 'bogus'],
        cwd,
      );
      expect(cliRun.code).toBe(1);
      expect(JSON.parse(cliRun.stdout).code).toBe('ERR_INVALID_DETAIL');

      const bogus = /** @type {any} */ ('bogus');
      for (const call of [
        () => component(undefined, {cwd, list: true, detail: bogus}),
        () => component('Button', {cwd, detail: bogus}),
      ]) {
        const err = await call().catch(e => e);
        expect(err).toBeInstanceOf(AstryxError);
        expect(err.code).toBe('ERR_INVALID_DETAIL');
      }
    },
    SLOW,
  );

  it(
    'rejects a lang the CLI rejects, with the same code',
    async () => {
      const cliRun = await runCli(
        ['--json', 'component', 'Button', '--lang', 'fr'],
        cwd,
      );
      expect(cliRun.code).toBe(1);
      expect(JSON.parse(cliRun.stdout).code).toBe('ERR_INVALID_LANG');

      for (const call of [
        () => component('Button', {cwd, lang: 'fr'}),
        () =>
          component(undefined, {
            cwd,
            list: true,
            detail: 'compact',
            lang: 'fr',
          }),
      ]) {
        const err = await call().catch(e => e);
        expect(err).toBeInstanceOf(AstryxError);
        expect(err.code).toBe('ERR_INVALID_LANG');
      }
      const zh = await component('Button', {cwd, lang: 'zh'});
      expect(zh.type).toBe('component.detail');
    },
    SLOW,
  );
});

describe('component dispatcher — detail levels on single component (text only)', () => {
  it(
    '--detail compact returns less text than full',
    async () => {
      const full = await runCli(['component', 'Button'], cwd);
      const compact = await runCli(
        ['component', 'Button', '--detail', 'compact'],
        cwd,
      );
      expect(full.code).toBe(0);
      expect(compact.code).toBe(0);
      expect(compact.stdout.length).toBeLessThan(full.stdout.length);
      // Compact still shows the name and import
      expect(compact.stdout).toContain('Button');
      expect(compact.stdout).toContain('@astryxdesign/core');
    },
    SLOW,
  );

  it(
    '--detail brief returns less text than compact',
    async () => {
      const compact = await runCli(
        ['component', 'Button', '--detail', 'compact'],
        cwd,
      );
      const brief = await runCli(
        ['component', 'Button', '--detail', 'brief'],
        cwd,
      );
      expect(brief.code).toBe(0);
      expect(brief.stdout.length).toBeLessThan(compact.stdout.length);
      expect(brief.stdout).toContain('Button');
    },
    SLOW,
  );

  it(
    '--json --detail compact returns the same full JSON as --json (contract)',
    async () => {
      const full = await runCli(['--json', 'component', 'Button'], cwd);
      const compact = await runCli(
        ['--json', 'component', 'Button', '--detail', 'compact'],
        cwd,
      );
      expect(full.code).toBe(0);
      expect(compact.code).toBe(0);
      const fullData = JSON.parse(full.stdout);
      const compactData = JSON.parse(compact.stdout);
      // JSON shape is identical — detail is a text-only projection
      expect(Object.keys(compactData.data).sort()).toEqual(
        Object.keys(fullData.data).sort(),
      );
    },
    SLOW,
  );
});

describe('component not-found suggestions', () => {
  const suggested = async (/** @type {string} */ name) => {
    const error = await component(name, {cwd}).catch(e => e);
    expect(error).toBeInstanceOf(AstryxError);
    expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
    return error.suggestions.map((/** @type {{name: string}} */ s) => s.name);
  };

  it(
    'leaves out a weaker match after a strong first suggestion',
    async () => {
      // FieldLabel is another name for it; past the second suggestion, the
      // matches on one word of the name ("input", "label") are weaker and add
      // only noise.
      const names = await suggested('InputLabel');
      expect(names[0]).toBe('FieldLabel');
      expect(names).toHaveLength(2);
    },
    SLOW,
  );

  it(
    'keeps a close spelling of the whole name after a stronger first match',
    async () => {
      expect(await suggested('Blockqoute')).toContain('Blockquote');
      expect(await suggested('TextrAea')).toContain('TextArea');
    },
    SLOW,
  );
});
