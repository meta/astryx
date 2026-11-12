// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration components, and the members a family doc lists, are found
 * by the names their docs document; every doc that works today reads as before.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  discoverIntegrationComponents,
  discoverValidIntegrationComponents,
  findIntegrationComponent,
  findIntegrationComponentDoc,
  findIntegrationComponentSource,
  unscopedComponentOwners,
} from './component-discovery.mjs';

/** @type {string} the integration's components root */
let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-export-names-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/**
 * Write a component doc, and its same-stem source when given.
 * @param {string} file path under the root, without extension
 * @param {{name: string, source?: string, form?: 'default' | 'docs', suffix?: string, extra?: string}} options
 *   `name` is written as a JavaScript expression
 */
function writeComponent(
  file,
  {name, source, form = 'default', suffix = '.doc.mjs', extra = ''},
) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const doc = `{\n  type: 'component',\n  name: ${name},\n  usage: {description: 'A component.'},\n  props: [],${extra}\n}`;
  fs.writeFileSync(
    `${target}${suffix}`,
    form === 'default'
      ? `export default ${doc};\n`
      : `export const docs = ${doc};\n`,
  );
  if (source != null) fs.writeFileSync(`${target}.tsx`, source);
}

const integration = () => ({name: '@acme/widgets', components: root});

/** @returns {string[]} */
const names = () =>
  discoverIntegrationComponents(integration())
    .map(record => record.name)
    .sort();

describe('integration components whose doc names another export of its file', () => {
  it('records a doc beside a kebab-case file under the export its doc names', async () => {
    writeComponent('artifact-viewer', {
      name: "'AcmeArtifactViewer'",
      source: 'export function AcmeArtifactViewer() { return null; }\n',
    });

    const [record] = discoverIntegrationComponents(integration());
    expect(record).toMatchObject({
      name: 'AcmeArtifactViewer',
      package: '@acme/widgets',
      docPath: path.join(root, 'artifact-viewer.doc.mjs'),
      sourcePath: path.join(root, 'artifact-viewer.tsx'),
    });
    expect(
      (await discoverValidIntegrationComponents(integration())).components,
    ).toEqual([expect.objectContaining({name: 'AcmeArtifactViewer'})]);
    expect(
      findIntegrationComponentDoc(integration(), 'AcmeArtifactViewer'),
    ).toBe(record.docPath);
    expect(findIntegrationComponentDoc(integration(), 'artifact-viewer')).toBe(
      record.docPath,
    );
    expect(
      findIntegrationComponentSource(integration(), 'AcmeArtifactViewer'),
    ).toBe(record.sourcePath);
  });

  it('leaves a name to Core or a file-named component over one a doc records', () => {
    const core = {package: '@astryxdesign/core', hold: 'core'};
    const fileNamed = {package: '@beta/kit', hold: 'file'};
    const documented = {package: '@acme/widgets', hold: 'doc'};
    expect(unscopedComponentOwners([documented, fileNamed])).toEqual([
      fileNamed,
    ]);
    expect(unscopedComponentOwners([core, documented])).toEqual([core]);
    expect(unscopedComponentOwners([documented])).toEqual([documented]);

    // Badge.doc.mjs records AcmeBadge, so the doc holds both names only
    // because it documents them; Panel.doc.mjs names an export another file
    // has, so it keeps its file name.
    writeComponent('Badge', {
      name: "'AcmeBadge'",
      source: 'export function AcmeBadge() { return null; }\n',
    });
    writeComponent('Panel', {
      name: "'AcmeChip'",
      source: 'export function AcmeChip() { return null; }\n',
    });
    writeComponent('AcmeChip', {
      name: "'AcmeChip'",
      source: 'export function AcmeChip() { return null; }\n',
    });
    const hold = (/** @type {string} */ name) =>
      findIntegrationComponent(integration(), name)?.hold;
    expect(hold('AcmeBadge')).toBe('doc');
    expect(hold('Badge')).toBe('doc');
    expect(hold('Panel')).toBe('file');
    expect(hold('AcmeChip')).toBe('file');
  });

  it('takes no name a hidden doc or a replacement in the package claims', () => {
    // A hidden doc is still the file named AcmeCarousel: its name stays its own.
    writeComponent('AcmeCarousel', {
      name: "'AcmeCarousel'",
      extra: '\n  hidden: true,',
      source: 'export function AcmeCarousel() { return null; }\n',
    });
    writeComponent('gallery/Slides', {
      name: "'AcmeCarousel'",
      source: 'export function AcmeCarousel() { return null; }\n',
    });
    // A doc in the package replaces Carousel, so that name answers with it.
    writeComponent('Pager', {
      name: "'AcmePager'",
      extra: "\n  replaces: 'Carousel',",
      source: 'export function AcmePager() { return null; }\n',
    });
    writeComponent('Kit', {
      name: "'Carousel'",
      source: 'export function Carousel() { return null; }\n',
    });

    expect(names()).toEqual(['AcmePager', 'Kit', 'Slides']);
    expect(findIntegrationComponentDoc(integration(), 'AcmeCarousel')).toBe(
      path.join(root, 'AcmeCarousel.doc.mjs'),
    );
    expect(findIntegrationComponentDoc(integration(), 'Carousel')).toBeNull();
  });

  it('settles a name two docs document by path, the same in every locale', () => {
    // By UTF-16 code unit `B/` sorts before `a/`; a locale's collation puts
    // `a/` first.
    for (const [file, stem] of [
      ['a/Alpha', 'Alpha'],
      ['B/Beta', 'Beta'],
    ]) {
      writeComponent(file, {
        name: "'Twin'",
        source: `export function Twin() { return null; }\n// ${stem}\n`,
      });
    }

    expect(names()).toEqual(['Alpha', 'Twin']);
    expect(findIntegrationComponentDoc(integration(), 'Twin')).toBe(
      path.join(root, 'B', 'Beta.doc.mjs'),
    );
  });

  it('reads a name a spread can override, and reports an unreadable doc under its file name', async () => {
    fs.writeFileSync(
      path.join(root, 'Based.doc.mjs'),
      "const base = {\n  name: 'Based',\n  type: 'component',\n  usage: {description: 'x'},\n  props: [],\n};\nexport default {...base, name: 'AcmeBased'};\n",
    );
    fs.writeFileSync(
      path.join(root, 'Based.tsx'),
      'export function AcmeBased() { return null; }\n',
    );
    writeComponent('Throws', {
      name: "'AcmeThrows'",
      source: 'export function AcmeThrows() { return null; }\n',
    });
    const throws = path.join(root, 'Throws.doc.mjs');
    fs.writeFileSync(
      throws,
      `throw new Error('boom');\n${fs.readFileSync(throws, 'utf-8')}`,
    );

    expect(names()).toEqual(['AcmeBased', 'AcmeThrows']);
    const {errors} = await discoverValidIntegrationComponents(integration());
    expect(errors).toEqual([
      {
        name: 'Throws',
        message: 'Component "Throws" has invalid metadata: boom',
      },
    ]);
  });

  it('reads a legacy export, a .doc.ts doc and a re-exported component the same way', () => {
    writeComponent('Slides', {
      name: "'AcmeCarousel'",
      form: 'docs',
      source: "export {AcmeCarousel} from './carousel/impl';\n",
    });
    fs.mkdirSync(path.join(root, 'carousel'));
    fs.writeFileSync(
      path.join(root, 'carousel', 'impl.tsx'),
      'export function AcmeCarousel() { return null; }\n',
    );
    writeComponent('Pager', {
      name: "'AcmePager'",
      suffix: '.doc.ts',
      source: 'export const AcmePager = () => null;\n',
    });

    expect(names()).toEqual(['AcmeCarousel', 'AcmePager']);
  });

  it('keeps the file name for every doc that reads as before', async () => {
    // Named after its file.
    writeComponent('AcmeBadge', {
      name: "'AcmeBadge'",
      source: 'export function AcmeBadge() { return null; }\n',
    });
    // The file exports its own name, so that name stays.
    writeComponent('Chip', {
      name: "'AcmeChip'",
      source:
        'export function Chip() { return null; }\nexport function AcmeChip() { return null; }\n',
    });
    // The doc names an export the file does not have.
    writeComponent('Menu', {
      name: "'AcmeMenu'",
      source: 'export function Dropdown() { return null; }\n',
    });
    // A type is not a runtime export.
    writeComponent('Shape', {
      name: "'AcmeShape'",
      source: 'export type AcmeShape = {id: string};\n',
    });
    // A name the doc computes is not read.
    writeComponent('Tile', {
      name: "`${'Acme'}Tile`",
      source: 'export function AcmeTile() { return null; }\n',
    });
    // Another file already has the name.
    writeComponent('Panel', {
      name: "'AcmeBadge'",
      source: 'export function AcmeBadge() { return null; }\n',
    });
    // No source beside it.
    writeComponent('Orphan', {name: "'AcmeOrphan'"});

    expect(names()).toEqual([
      'AcmeBadge',
      'Chip',
      'Menu',
      'Orphan',
      'Panel',
      'Shape',
      'Tile',
    ]);
    for (const name of [
      'AcmeChip',
      'AcmeMenu',
      'AcmeShape',
      'AcmeTile',
      'AcmeOrphan',
    ]) {
      expect(findIntegrationComponentDoc(integration(), name)).toBeNull();
    }
    expect(
      (await discoverValidIntegrationComponents(integration())).errors,
    ).toEqual([
      {
        name: 'Orphan',
        message:
          'Component "Orphan" is missing its same-stem source file Orphan.tsx.',
      },
    ]);
  });

  it('still leaves a hidden doc out', () => {
    writeComponent('Slides', {
      name: "'AcmeCarousel'",
      extra: '\n  hidden: true,',
      source: 'export function AcmeCarousel() { return null; }\n',
    });

    expect(names()).toEqual([]);
  });
});

/**
 * Write a family doc and its source.
 * @param {string} file path under the root, without extension
 * @param {{name: string, members: string, source: string, extra?: string}} options
 *   `members` is the `components` array, written as JavaScript
 */
function writeFamily(file, {name, members, source, extra = ''}) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(
    `${target}.doc.mjs`,
    `export default {\n  type: 'component',\n  name: '${name}',\n  usage: {description: 'A family.'},${extra}\n  components: ${members},\n};\n`,
  );
  fs.writeFileSync(`${target}.tsx`, source);
}

describe('integration components a family doc lists in components', () => {
  it('records each exported full entry under its own name, with the file that declares it', async () => {
    writeFamily('carousel/AcmeCarousel', {
      name: 'AcmeCarousel',
      members:
        "[{name: 'AcmeCarousel', description: 'The carousel.'}, {name: 'AcmeSlide', description: 'One slide.'}, {name: 'AcmeDots', description: 'The dots.'}]",
      source:
        "export function AcmeCarousel() { return null; }\nexport function AcmeSlide() { return null; }\nexport {AcmeDots} from './dots';\n",
    });
    fs.writeFileSync(
      path.join(root, 'carousel', 'dots.tsx'),
      'export const AcmeDots = () => null;\n',
    );

    const records = discoverIntegrationComponents(integration());
    const docPath = path.join(root, 'carousel', 'AcmeCarousel.doc.mjs');
    expect(records.map(record => record.name)).toEqual([
      'AcmeCarousel',
      'AcmeSlide',
      'AcmeDots',
    ]);
    expect(records.find(record => record.name === 'AcmeSlide')).toMatchObject({
      docPath,
      sourcePath: path.join(root, 'carousel', 'AcmeCarousel.tsx'),
    });
    expect(findIntegrationComponentDoc(integration(), 'AcmeDots')).toBe(
      docPath,
    );
    expect(findIntegrationComponentSource(integration(), 'AcmeDots')).toBe(
      path.join(root, 'carousel', 'dots.tsx'),
    );
    const {components, errors} =
      await discoverValidIntegrationComponents(integration());
    expect(errors).toEqual([]);
    expect(components.map(record => record.name)).toEqual([
      'AcmeCarousel',
      'AcmeSlide',
      'AcmeDots',
    ]);
  });

  it('reads members from the module the doc imports, through the package exports', () => {
    // The components root inside a package whose exports publish the module.
    const componentsRoot = path.join(root, 'src');
    fs.mkdirSync(path.join(componentsRoot, 'carousel'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: '@acme/widgets',
        exports: {'./carousel': './src/carousel/index.ts'},
      }),
    );
    fs.writeFileSync(
      path.join(componentsRoot, 'carousel', 'AcmeCarousel.doc.mjs'),
      "export default {type: 'component', name: 'AcmeCarousel', import: '@acme/widgets/carousel', usage: {description: 'x'}, components: [{name: 'AcmeCarousel', description: 'x'}, {name: 'AcmeSlide', description: 'x'}]};\n",
    );
    fs.writeFileSync(
      path.join(componentsRoot, 'carousel', 'AcmeCarousel.tsx'),
      'export function AcmeCarousel() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(componentsRoot, 'carousel', 'index.ts'),
      "export * from './AcmeCarousel';\nexport {AcmeSlide} from './slide';\n",
    );
    fs.writeFileSync(
      path.join(componentsRoot, 'carousel', 'slide.tsx'),
      'export function AcmeSlide() { return null; }\n',
    );

    const loaded = {
      name: '@acme/widgets',
      components: componentsRoot,
      __packageDir: root,
    };
    expect(
      discoverIntegrationComponents(loaded).find(
        record => record.name === 'AcmeSlide',
      ),
    ).toMatchObject({
      sourcePath: path.join(componentsRoot, 'carousel', 'slide.tsx'),
    });
    // Without the package, only the doc's own source is read, and it lacks
    // the member.
    expect(
      discoverIntegrationComponents({...loaded, __packageDir: undefined}).map(
        record => record.name,
      ),
    ).toEqual(['AcmeCarousel']);
  });

  it('leaves every other entry as before', () => {
    writeFamily('Gallery', {
      name: 'AcmeGallery',
      extra: "\n  hiddenComponents: ['AcmeHidden'],",
      members: [
        '[',
        "  {name: 'AcmeGallery', description: 'x'},",
        // Not exported by the source.
        "  {name: 'AcmeMissing', description: 'x'},",
        // Hidden by the doc.
        "  {name: 'AcmeHidden', description: 'x'},",
        // A hook.
        "  {name: 'useGallery', description: 'x'},",
        // A name-only entry points at the member's own doc.
        "  {name: 'AcmeThumb'},",
        // Another file already has the name.
        "  {name: 'AcmeBadge', description: 'x'},",
        // A computed name.
        "  {name: `${'Acme'}Tile`, description: 'x'},",
        ']',
      ].join('\n'),
      source: [
        'export function AcmeGallery() { return null; }',
        'export function AcmeHidden() { return null; }',
        'export function useGallery() { return []; }',
        'export function AcmeThumb() { return null; }',
        'export function AcmeBadge() { return null; }',
        'export function AcmeTile() { return null; }',
        '',
      ].join('\n'),
    });
    writeComponent('AcmeBadge', {
      name: "'AcmeBadge'",
      source: 'export function AcmeBadge() { return null; }\n',
    });

    // Gallery.tsx exports no `Gallery`, so the doc's own name is its export.
    expect(names()).toEqual(['AcmeBadge', 'AcmeGallery']);
    for (const name of [
      'AcmeMissing',
      'AcmeHidden',
      'useGallery',
      'AcmeThumb',
      'AcmeTile',
    ]) {
      expect(findIntegrationComponentDoc(integration(), name)).toBeNull();
    }
  });

  it("does not hand a family's replaces to its members", async () => {
    writeFamily('AcmeCarousel', {
      name: 'AcmeCarousel',
      extra: "\n  replaces: 'Carousel',",
      members:
        "[{name: 'AcmeCarousel', description: 'x'}, {name: 'AcmeSlide', description: 'x'}]",
      source:
        'export function AcmeCarousel() { return null; }\nexport function AcmeSlide() { return null; }\n',
    });
    const {components} =
      await discoverValidIntegrationComponents(integration());
    expect(components.map(record => [record.name, record.replaces])).toEqual([
      ['AcmeCarousel', 'Carousel'],
      ['AcmeSlide', undefined],
    ]);
  });

  it('drops a member once the file its source re-exports stops exporting it', () => {
    writeFamily('AcmeTabs', {
      name: 'AcmeTabs',
      members: "[{name: 'AcmeTab', description: 'x'}]",
      source:
        "export function AcmeTabs() { return null; }\nexport * from './tab';\n",
    });
    const tab = path.join(root, 'tab.tsx');
    fs.writeFileSync(tab, 'export function AcmeTab() { return null; }\n');
    expect(names()).toEqual(['AcmeTab', 'AcmeTabs']);
    fs.writeFileSync(tab, 'export function AcmeTabLegacy() { return null; }\n');
    expect(names()).toEqual(['AcmeTabs']);
  });

  it('reads members a doc lists through a shorthand property', () => {
    fs.writeFileSync(
      path.join(root, 'AcmeTabs.tsx'),
      'export function AcmeTabs() { return null; }\nexport function AcmeTab() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(root, 'AcmeTabs.doc.mjs'),
      "const components = [{name: 'AcmeTab', description: 'x'}];\nexport default {type: 'component', name: 'AcmeTabs', usage: {description: 'x'}, components};\n",
    );
    expect(names()).toEqual(['AcmeTab', 'AcmeTabs']);
  });

  it('reports a family doc the loader rejects once, not once per member', async () => {
    writeFamily('AcmeStrip', {
      name: 'AcmeStrip',
      extra: '\n  displayName: 7,',
      members:
        "[{name: 'AcmeStrip', description: 'x'}, {name: 'AcmeStripItem', description: 'x'}]",
      source:
        'export function AcmeStrip() { return null; }\nexport function AcmeStripItem() { return null; }\n',
    });
    const {components, errors} =
      await discoverValidIntegrationComponents(integration());
    expect(components).toEqual([]);
    expect(errors.map(error => error.name)).toEqual(['AcmeStrip']);
  });

  /**
   * A package around the components root `src/`, with these files.
   * @param {Record<string, unknown>} manifest package.json fields
   * @param {Record<string, string>} files paths under the package
   */
  function writePackage(manifest, files) {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({name: '@acme/widgets', ...manifest}),
    );
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), text);
    }
    return {
      name: '@acme/widgets',
      components: path.join(root, 'src'),
      __packageDir: root,
    };
  }

  /** @param {object} loaded */
  const namesIn = loaded =>
    discoverIntegrationComponents(/** @type {any} */ (loaded))
      .map(record => record.name)
      .sort();

  const family = (/** @type {string} */ name, /** @type {string} */ entries) =>
    `export default {type: 'component', name: '${name}', usage: {description: 'x'}, components: [${entries}]};\n`;

  it('reads members from the main file of a package without exports, and none it cannot resolve', () => {
    const loaded = writePackage(
      {main: './src/index.ts'},
      {
        'src/list/AcmeList.doc.mjs': family(
          'AcmeList',
          "{name: 'AcmeListRow', description: 'x'}, {name: 'AcmeListCell', description: 'x'}",
        ).replace('usage:', "import: '@acme/widgets', usage:"),
        'src/list/AcmeList.tsx':
          'export function AcmeList() { return null; }\nexport function AcmeListRow() { return null; }\n',
        'src/list/cell.tsx':
          'export function AcmeListCell() { return null; }\n',
        'src/index.ts':
          "export {AcmeList} from './list/AcmeList';\nexport {AcmeListCell} from './list/cell';\n",
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeList', 'AcmeListCell']);
    // An import the package cannot resolve lists no members, not the
    // same-stem file's.
    fs.rmSync(path.join(root, 'src', 'index.ts'));
    expect(namesIn(loaded)).toEqual(['AcmeList']);
  });

  it('lists no member the import only re-exports from another package', () => {
    // Discovery follows relative re-exports alone; a package another package
    // re-exports is not this integration's member.
    const loaded = writePackage(
      {main: './src/index.ts'},
      {
        'src/list/AcmeList.doc.mjs': family(
          'AcmeList',
          "{name: 'AcmeListRow', description: 'x'}, {name: 'AcmeListCell', description: 'x'}",
        ).replace('usage:', "import: '@acme/widgets', usage:"),
        'src/list/AcmeList.tsx':
          'export function AcmeList() { return null; }\n',
        'src/index.ts':
          "export {AcmeList} from './list/AcmeList';\nexport {AcmeListRow} from '@acme/rows';\nexport * from '@acme/cells';\n",
        'node_modules/@acme/rows/package.json': JSON.stringify({
          name: '@acme/rows',
          main: 'index.js',
        }),
        'node_modules/@acme/rows/index.js':
          'export function AcmeListRow() { return null; }\n',
        'node_modules/@acme/cells/package.json': JSON.stringify({
          name: '@acme/cells',
          exports: {'.': './index.js'},
        }),
        'node_modules/@acme/cells/index.js':
          'export function AcmeListCell() { return null; }\n',
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeList']);
  });

  it("takes a member's source from the family's folder, never a bundle or the package root", () => {
    const loaded = writePackage(
      {exports: {'.': {import: './dist/index.mjs'}}},
      {
        'src/tabs/AcmeTabs.doc.mjs': family(
          'AcmeTabs',
          "{name: 'AcmeTab', description: 'x'}",
        ),
        'src/tabs/AcmeTabs.tsx':
          'export function AcmeTabs() { return null; }\nexport function AcmeTab() { return null; }\n',
        'dist/index.mjs':
          'function AcmeTabs() { return null; }\nfunction AcmeTab() { return null; }\nexport {AcmeTabs, AcmeTab};\n',
        // A member only the package's root file and the bundle declare is
        // listed, with no source.
        'src/cards/AcmeCards.doc.mjs': family(
          'AcmeCards',
          "{name: 'AcmeCard', description: 'x'}",
        ),
        'src/cards/AcmeCards.tsx':
          'export function AcmeCards() { return null; }\n',
        'src/index.tsx':
          "export {AcmeCards} from './cards/AcmeCards';\nexport function AcmeCard() { return null; }\n",
      },
    );
    fs.writeFileSync(
      path.join(root, 'dist', 'index.mjs'),
      `${fs.readFileSync(path.join(root, 'dist', 'index.mjs'), 'utf-8')}export function AcmeCard() { return null; }\n`,
    );

    const records = discoverIntegrationComponents(loaded);
    expect(records.map(record => record.name).sort()).toEqual([
      'AcmeCard',
      'AcmeCards',
      'AcmeTab',
      'AcmeTabs',
    ]);
    expect(findIntegrationComponentSource(loaded, 'AcmeTab')).toBe(
      path.join(root, 'src', 'tabs', 'AcmeTabs.tsx'),
    );
    expect(findIntegrationComponentDoc(loaded, 'AcmeCard')).toBe(
      path.join(root, 'src', 'cards', 'AcmeCards.doc.mjs'),
    );
    expect(findIntegrationComponentSource(loaded, 'AcmeCard')).toBeNull();
    expect(
      records.find(record => record.name === 'AcmeCard')?.sourcePath,
    ).toBeNull();
  });

  it('lists a member only a bundle declares, with no source, when the family doc sits at the package root', () => {
    const loaded = {
      ...writePackage(
        {exports: {'.': './dist/index.mjs'}},
        {
          'AcmeStrip.doc.mjs': family(
            'AcmeStrip',
            "{name: 'AcmeStripItem', description: 'x'}",
          ).replace('usage:', "import: '@acme/widgets', usage:"),
          'AcmeStrip.tsx': 'export function AcmeStrip() { return null; }\n',
          'dist/index.mjs':
            'export function AcmeStrip() { return null; }\nexport function AcmeStripItem() { return null; }\n',
        },
      ),
      components: root,
    };
    expect(namesIn(loaded)).toEqual(['AcmeStrip', 'AcmeStripItem']);
    expect(findIntegrationComponentSource(loaded, 'AcmeStripItem')).toBeNull();
  });

  it('lists the members a family doc without its own source imports', () => {
    const loaded = writePackage(
      {exports: {'./group': './src/group/index.ts'}},
      {
        'src/group/AcmeGroup.doc.mjs': family(
          'AcmeGroup',
          "{name: 'AcmeGroupItem', description: 'x'}",
        ).replace('usage:', "import: '@acme/widgets/group', usage:"),
        'src/group/index.ts':
          "export {AcmeGroupItem} from './AcmeGroupItem';\n",
        'src/group/AcmeGroupItem.tsx':
          'export function AcmeGroupItem() { return null; }\n',
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeGroup', 'AcmeGroupItem']);
    expect(findIntegrationComponentSource(loaded, 'AcmeGroupItem')).toBe(
      path.join(root, 'src', 'group', 'AcmeGroupItem.tsx'),
    );
  });

  it("finds a member's source in the family's folder when the import names built output", () => {
    const loaded = writePackage(
      {exports: {'./list': './dist/list/index.js'}},
      {
        'src/list/AcmeList.doc.mjs': family(
          'AcmeList',
          "{name: 'AcmeListRow', description: 'x'}",
        ).replace('usage:', "import: '@acme/widgets/list', usage:"),
        'src/list/AcmeList.tsx':
          'export function AcmeList() { return null; }\n',
        'src/list/row.tsx': 'export function AcmeListRow() { return null; }\n',
        'src/list/row.test.tsx':
          'export function AcmeListRow() { return null; }\n',
        'dist/list/index.js':
          "export {AcmeList} from './list.js';\nexport * from './row.js';\n",
        'dist/list/list.js': 'export function AcmeList() { return null; }\n',
        'dist/list/row.js': 'export function AcmeListRow() { return null; }\n',
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeList', 'AcmeListRow']);
    expect(findIntegrationComponentSource(loaded, 'AcmeListRow')).toBe(
      path.join(root, 'src', 'list', 'row.tsx'),
    );
    // Until the output exists, the import exports nothing.
    fs.rmSync(path.join(root, 'dist'), {recursive: true});
    expect(namesIn(loaded)).toEqual(['AcmeList']);
  });

  it('reads members through the source condition, the same with or without built output', () => {
    // The family's member is exported only from the root entry, as Lab's
    // TourStep is.
    const loaded = writePackage(
      {
        exports: {
          '.': {
            source: './src/index.ts',
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
        },
      },
      {
        'src/index.ts':
          "export {AcmeList} from './list/AcmeList';\nexport {AcmeListRow} from './list/row';\n",
        'src/list/AcmeList.doc.mjs': family(
          'AcmeList',
          "{name: 'AcmeList', description: 'x'}, {name: 'AcmeListRow', description: 'x'}",
        ),
        'src/list/AcmeList.tsx':
          'export function AcmeList() { return null; }\n',
        'src/list/row.tsx': 'export function AcmeListRow() { return null; }\n',
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeList', 'AcmeListRow']);
    expect(findIntegrationComponentSource(loaded, 'AcmeListRow')).toBe(
      path.join(root, 'src', 'list', 'row.tsx'),
    );
    // Built output, even a stale one without the member, changes nothing.
    fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'dist', 'index.js'),
      'export function AcmeList() { return null; }\n',
    );
    expect(namesIn(loaded)).toEqual(['AcmeList', 'AcmeListRow']);
    // A package that does not ship its source reads the built output.
    fs.rmSync(path.join(root, 'src', 'index.ts'));
    expect(namesIn(loaded)).toEqual(['AcmeList']);
  });

  it('lists a member another folder declares, with no source', async () => {
    const loaded = writePackage(
      {exports: {'./menu': './src/menu/index.ts'}},
      {
        'src/menu/AcmeMenu.doc.mjs': family(
          'AcmeMenu',
          "{name: 'AcmeMenuItem', description: 'x'}",
        ).replace('usage:', "import: '@acme/widgets/menu', usage:"),
        'src/menu/AcmeMenu.tsx':
          'export function AcmeMenu() { return null; }\n',
        'src/menu/index.ts':
          "export {AcmeMenu} from './AcmeMenu';\nexport {AcmeMenuItem} from '../shared/AcmeMenuItem';\n",
        'src/shared/AcmeMenuItem.tsx':
          'export function AcmeMenuItem() { return null; }\n',
      },
    );
    expect(namesIn(loaded)).toEqual(['AcmeMenu', 'AcmeMenuItem']);
    expect(findIntegrationComponentDoc(loaded, 'AcmeMenuItem')).toBe(
      path.join(root, 'src', 'menu', 'AcmeMenu.doc.mjs'),
    );
    expect(findIntegrationComponentSource(loaded, 'AcmeMenuItem')).toBeNull();
    // A member without a source is valid: only a doc's own component needs
    // its same-stem file.
    const {components, errors} = await discoverValidIntegrationComponents(
      /** @type {any} */ (loaded),
    );
    expect(errors).toEqual([]);
    expect(components.map(component => component.name).sort()).toEqual([
      'AcmeMenu',
      'AcmeMenuItem',
    ]);
  });

  it('reads members a binding holds and entries with computed fields', () => {
    fs.writeFileSync(
      path.join(root, 'AcmeRows.doc.mjs'),
      "const describe = text => text;\nconst MEMBERS = [{name: 'AcmeRow', description: describe('A row.')}];\nexport default {type: 'component', name: 'AcmeRows', usage: {description: 'x'}, components: MEMBERS};\n",
    );
    fs.writeFileSync(
      path.join(root, 'AcmeRows.tsx'),
      'export function AcmeRows() { return null; }\nexport function AcmeRow() { return null; }\n',
    );
    expect(names()).toEqual(['AcmeRow', 'AcmeRows']);
  });

  it("lists the doc's own name when its file keeps its own, and declares replaces once", async () => {
    writeFamily('Chip', {
      name: 'AcmeChip',
      extra: "\n  replaces: 'Badge',",
      members:
        "[{name: 'AcmeChip', description: 'x'}, {name: 'AcmeChipIcon', description: 'x'}]",
      source:
        'export function Chip() { return null; }\nexport function AcmeChip() { return null; }\nexport function AcmeChipIcon() { return null; }\n',
    });
    const {components} =
      await discoverValidIntegrationComponents(integration());
    expect(components.map(record => [record.name, record.replaces])).toEqual([
      ['Chip', 'Badge'],
      ['AcmeChip', undefined],
      ['AcmeChipIcon', undefined],
    ]);
  });

  it('takes no member name a hidden doc or a replacement in the package claims', () => {
    writeFamily('menu/AcmeMenu', {
      name: 'AcmeMenu',
      members:
        "[{name: 'AcmeMenuDivider', description: 'x'}, {name: 'Carousel', description: 'x'}, {name: 'AcmeMenuItem', description: 'x'}]",
      source:
        'export function AcmeMenu() { return null; }\nexport function AcmeMenuDivider() { return null; }\nexport function Carousel() { return null; }\nexport function AcmeMenuItem() { return null; }\n',
    });
    writeComponent('menu/AcmeMenuDivider', {
      name: "'AcmeMenuDivider'",
      extra: '\n  hidden: true,',
    });
    writeComponent('Slides', {
      name: "'AcmeCarousel'",
      extra: "\n  replaces: 'Carousel',",
      source: 'export function AcmeCarousel() { return null; }\n',
    });
    expect(names()).toEqual(['AcmeCarousel', 'AcmeMenu', 'AcmeMenuItem']);
    expect(findIntegrationComponentDoc(integration(), 'Carousel')).toBeNull();
  });
});
