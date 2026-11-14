// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs argument that names a component, hook or template.
 *
 * The not-found error puts the command that reads that entry first, in the
 * suggestion shape every other suggestion has. The list never grows: the
 * command takes the last suggestion's place, or, when no suggested doc shares
 * a word with the argument, it is the only suggestion. The cheap name checks
 * behind it list exactly what discovery lists.
 *
 * @input  made-up names, a project whose integration contributes made-up
 *   components and a template, and Core's own files
 * @output assertions on entryCommand, the cheap name checks, and the docs()
 *   not-found error
 * @position api/docs/ beside the docs dispatcher tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {entryCommand} from './_adapter.mjs';
import {
  discoverComponentNamesWhere,
  discoverComponents,
} from '../../foundation/discovery/component-discovery.mjs';
import {
  coreTemplateIds,
  discoverCoreTemplates,
  listTemplates,
  integrationMayReplaceTemplate,
  integrationTemplateIds,
  templateFilesNaming,
} from '../../foundation/discovery/template-adapter.mjs';
import {
  coreFilesNaming,
  foldEntryName,
  integrationFilesNaming,
} from '../../foundation/discovery/entry-name-files.mjs';
import {getAllHookNames} from '../../foundation/discovery/hook-discovery.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 30_000;

const NAMES = {
  components: ['Zorblet', 'ZorbletCard'],
  hooks: ['useWobble', 'useZorblet'],
  templates: ['glimmer-panel', 'wobble'],
};

describe('entryCommand', () => {
  it('names the command for an exact name in any case, with or without spaces and hyphens', () => {
    for (const typed of [
      'ZorbletCard',
      'zorbletcard',
      'zorblet-card',
      'Zorblet Card',
    ]) {
      expect(entryCommand(typed, NAMES)).toEqual({
        name: 'astryx component ZorbletCard',
        reason: 'a component, not a docs topic',
      });
    }
    expect(entryCommand('GlimmerPanel', NAMES)).toEqual({
      name: 'astryx template glimmer-panel',
      reason: 'a template, not a docs topic',
    });
  });

  it('matches a hook with or without its use prefix', () => {
    const hook = {
      name: 'astryx hook useWobble',
      reason: 'a hook, not a docs topic',
    };
    expect(entryCommand('useWobble', NAMES)).toEqual(hook);
    expect(entryCommand('use-wobble', NAMES)).toEqual(hook);
  });

  it('prefers a component to a hook, and a hook to a template', () => {
    expect(entryCommand('zorblet', NAMES)?.name).toBe(
      'astryx component Zorblet',
    );
    expect(entryCommand('wobble', NAMES)?.name).toBe('astryx hook useWobble');
  });

  it('gives nothing for a near name, a route, or an empty name', () => {
    expect(entryCommand('Zorblt', NAMES)).toBeNull();
    expect(entryCommand('ZorbletCards', NAMES)).toBeNull();
    expect(entryCommand('components/Zorblet', NAMES)).toBeNull();
    expect(entryCommand(' - ', NAMES)).toBeNull();
    expect(entryCommand('Zorblet', {})).toBeNull();
  });
});

/** @type {string} */
let tmpDir;
/** @type {string} */
let bareDir;

/** A project whose one integration contributes a component and a template. */
function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.mkdirSync(path.join(pkgDir, 'templates'));
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components', templates: './templates'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ZorbletCard.doc.mjs'),
    "export default {type: 'component', name: 'ZorbletCard', description: 'A card.', props: []};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ZorbletCard.tsx'),
    'export function ZorbletCard() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ThemeSwatch.doc.mjs'),
    "export default {type: 'component', name: 'ThemeSwatch', description: 'A swatch.', props: []};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ThemeSwatch.tsx'),
    'export function ThemeSwatch() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'glimmer-panel.doc.mjs'),
    "export default {type: 'block', name: 'Glimmer panel', description: 'A panel.'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'glimmer-panel.tsx'),
    'export default function Fixture() { return null; }\n',
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(REPO_ROOT, '.astryx-docs-entry-command-test-'),
  );
  scaffold();
  bareDir = fs.mkdtempSync(
    path.join(REPO_ROOT, '.astryx-docs-entry-command-bare-'),
  );
  fs.writeFileSync(
    path.join(bareDir, 'package.json'),
    JSON.stringify({name: 'bare'}),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  fs.rmSync(bareDir, {recursive: true, force: true});
});

describe('docs() for a name another command reads', () => {
  it(
    'stays not found and gives the command alone when no doc shares a word',
    async () => {
      for (const [typed, command] of [
        ['zorblet-card', 'astryx component ZorbletCard'],
        ['glimmer panel', 'astryx template glimmer-panel'],
      ]) {
        const plain = await docs(typed, undefined, {cwd: bareDir}).catch(
          e => e,
        );
        expect(plain.code).toBe('ERR_UNKNOWN_TOPIC');
        expect(plain.suggestions.length).toBeGreaterThan(1);
        const error = await docs(typed, undefined, {cwd: tmpDir}).catch(e => e);
        expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
        expect(error.suggestions).toEqual([
          {name: command, reason: expect.stringContaining('not a docs topic')},
        ]);
      }
    },
    SLOW,
  );

  it(
    'keeps the docs that share a word after the command, one fewer',
    async () => {
      const plain = await docs('theme-swatch', undefined, {cwd: bareDir}).catch(
        e => e,
      );
      expect(plain.suggestions.length).toBeGreaterThan(1);
      const error = await docs('theme-swatch', undefined, {cwd: tmpDir}).catch(
        e => e,
      );
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(error.suggestions).toEqual([
        {
          name: 'astryx component ThemeSwatch',
          reason: 'a component, not a docs topic',
        },
        ...plain.suggestions.slice(0, -1),
      ]);
      for (const suggestion of error.suggestions) {
        expect(Object.keys(suggestion).sort()).toEqual(['name', 'reason']);
      }
    },
    SLOW,
  );

  it(
    'leaves a docs typo and a docs route alone',
    async () => {
      const typo = await docs('tokns', undefined, {cwd: tmpDir}).catch(e => e);
      expect(typo.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(typo.suggestions.some(s => s.name.startsWith('astryx '))).toBe(
        false,
      );
      expect((await docs('tokens', undefined, {cwd: tmpDir})).data.route).toBe(
        'tokens',
      );
    },
    SLOW,
  );
});

describe('the cheap name checks', () => {
  const coreDir = path.join(REPO_ROOT, 'packages', 'core');

  it(
    'list each Core component exactly as discovery does',
    () => {
      const names = Object.values(discoverComponents(coreDir)).flat();
      expect(names.length).toBeGreaterThan(10);
      for (const name of names) {
        expect(discoverComponentNamesWhere(coreDir, n => n === name)).toEqual([
          name,
        ]);
      }
      expect(discoverComponentNamesWhere(coreDir, () => true)).toEqual(names);
      expect(
        discoverComponentNamesWhere(coreDir, n => n === 'Zorblet'),
      ).toEqual([]);
    },
    SLOW,
  );

  it(
    "list Core's template ids exactly as discovery does",
    async () => {
      const ids = (await discoverCoreTemplates()).map(t => t.dirName);
      expect([...coreTemplateIds()].sort()).toEqual([...ids].sort());
      // The kept file-name summary finds each block id, and no made-up one.
      for (const id of coreTemplateIds()) {
        if (listTemplates().includes(id)) continue;
        expect(templateFilesNaming([], foldEntryName(id)).blocks).toBe(true);
      }
      expect(templateFilesNaming([], 'zorbletwobble').blocks).toBe(false);
    },
    SLOW,
  );

  it(
    'find a file for each Core component and hook, and none for a made-up name',
    () => {
      const isNamed =
        (/** @type {string} */ wanted) => (/** @type {string} */ n) =>
          n === wanted;
      for (const name of Object.values(discoverComponents(coreDir)).flat()) {
        const found = coreFilesNaming(coreDir, foldEntryName(name));
        expect(found.component).toBe(true);
        // Only the top folders the name's files are in need reading.
        expect(
          discoverComponentNamesWhere(
            coreDir,
            isNamed(name),
            found.componentTops,
          ),
        ).toEqual([name]);
      }
      const hooks = getAllHookNames(coreDir);
      expect(hooks.length).toBeGreaterThan(5);
      for (const hook of hooks) {
        expect(getAllHookNames(coreDir, n => n === hook)).toEqual([hook]);
        const found = coreFilesNaming(coreDir, foldEntryName(hook));
        expect(found.hook).toBe(true);
        expect(getAllHookNames(coreDir, isNamed(hook), found.hookTops)).toEqual(
          [hook],
        );
        const bare = foldEntryName(hook).replace(/^use/, '');
        if (bare !== foldEntryName(hook)) {
          expect(coreFilesNaming(coreDir, bare).hook).toBe(true);
        }
      }
      expect(coreFilesNaming(coreDir, 'zorbletwobble')).toEqual({
        component: false,
        hook: false,
        componentTops: new Set(),
        hookTops: new Set(),
      });
    },
    SLOW,
  );

  it('find an integration component by its file name or its doc text', () => {
    const components = path.join(
      tmpDir,
      'node_modules',
      '@acme',
      'widgets',
      'components',
    );
    expect(integrationFilesNaming(components, 'zorbletcard')).toBe(true);
    expect(integrationFilesNaming(components, 'zorblet')).toBe(false);
    fs.writeFileSync(
      path.join(components, 'Family.doc.mjs'),
      "export default {type: 'component', name: 'Family', components: [{name: 'Zorblet'}]};\n",
    );
    expect(integrationFilesNaming(components, 'zorblet')).toBe(true);
  });

  it('read integration template ids, and whether one may replace Core', () => {
    const templates = path.join(
      tmpDir,
      'node_modules',
      '@acme',
      'widgets',
      'templates',
    );
    expect(integrationTemplateIds({templates})).toEqual(['glimmer-panel']);
    expect(templateFilesNaming([{templates}], 'glimmerpanel').listed).toBe(
      true,
    );
    expect(templateFilesNaming([{templates}], 'glimmer').listed).toBe(false);
    expect(integrationMayReplaceTemplate({templates})).toBe(false);
    fs.writeFileSync(
      path.join(templates, 'wobble.doc.mjs'),
      "/** @type {import('x').T} */\nexport default {type: 'block', name: 'Wobble', replaces: 'zorb'};\n",
    );
    expect(integrationMayReplaceTemplate({templates})).toBe(true);
  });
});
