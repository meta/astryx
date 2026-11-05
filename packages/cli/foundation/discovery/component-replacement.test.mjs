// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {resolveComponentReplacements} from './component-replacement.mjs';
import {COMPONENT_REPLACES_CLI} from '../integrations/cli-requirement.mjs';

// Real Core: replacement targets are names in Core's component catalog.
const CORE_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'core');
const FLOOR = {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`};

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-component-replacement-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * One integration package on disk, shaped like a loaded integration.
 * @param {string} name
 * @param {Array<{name: string, replaces?: unknown, legacy?: boolean}>} components
 * @param {{peers?: Record<string, string>, autolinked?: boolean}} [options]
 */
function integration(name, components, {peers, autolinked = false} = {}) {
  const dir = path.join(tmpDir, name.replace('/', '__'));
  const componentsDir = path.join(dir, 'components');
  fs.mkdirSync(componentsDir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      ...(peers ? {peerDependencies: peers} : {}),
    }),
  );
  for (const component of components) {
    const doc = {
      ...(component.legacy ? {} : {type: 'component'}),
      name: component.name,
      displayName: component.name,
      ...('replaces' in component ? {replaces: component.replaces} : {}),
      usage: {description: `${component.name} from ${name}.`},
      props: [],
    };
    fs.writeFileSync(
      path.join(componentsDir, `${component.name}.doc.mjs`),
      component.legacy
        ? `export const docs = ${JSON.stringify(doc)};\n`
        : `export default ${JSON.stringify(doc)};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component.name}.tsx`),
      `export function ${component.name}() { return null; }\n`,
    );
  }
  return {
    name,
    version: '1.0.0',
    components: componentsDir,
    __spec: name,
    __packageDir: dir,
    __manifestFile: path.join(dir, 'astryx.integration.mjs'),
    ...(autolinked ? {__autolinked: true} : {}),
  };
}

/** @param {Awaited<ReturnType<typeof resolveComponentReplacements>>} result */
const codes = result =>
  result.findings.map(
    finding => `${finding.severity}:${finding.code}:${finding.component}`,
  );

/**
 * An opted-in integration whose one component doc is the given module source,
 * with shared modules beside the components root under `lib/`.
 * @param {string} name
 * @param {string} component
 * @param {string} docSource
 * @param {Record<string, string>} [lib]
 */
function integrationWithDocSource(name, component, docSource, lib = {}) {
  const loaded = integration(name, [], {peers: FLOOR});
  const libDir = path.join(loaded.__packageDir, 'lib');
  fs.mkdirSync(libDir, {recursive: true});
  for (const [file, source] of Object.entries(lib)) {
    fs.writeFileSync(path.join(libDir, file), source);
  }
  fs.writeFileSync(
    path.join(loaded.components, `${component}.doc.mjs`),
    docSource,
  );
  fs.writeFileSync(
    path.join(loaded.components, `${component}.tsx`),
    `export function ${component}() { return null; }\n`,
  );
  return loaded;
}

const BASE_DOC = `export default {type: 'component', name: 'AcmeNav', displayName: 'Acme Nav', replaces: 'SideNav', usage: {description: 'Acme nav.'}, props: []};\n`;

describe('resolveComponentReplacements', () => {
  it('applies a replacement from a package that declares the CLI floor', async () => {
    const acme = integration(
      '@acme/nav',
      [{name: 'AcmeSideNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [acme]);
    expect(result.findings).toEqual([]);
    expect(result.active).toHaveLength(1);
    expect(result.forTarget('SideNav')).toMatchObject({
      target: 'SideNav',
      name: 'AcmeSideNav',
      package: '@acme/nav',
    });
    // The name matches exactly, as Core component lookups do.
    expect(result.forTarget('sidenav')).toBeUndefined();
    expect(result.forTarget('TopNav')).toBeUndefined();
  });

  it.each([
    ['no CLI peer', undefined],
    [
      'a range that admits an earlier stable CLI',
      {'@astryxdesign/cli': '>=0.6.4'},
    ],
    ['a caret range on an earlier minor', {'@astryxdesign/cli': '^0.6.0'}],
  ])(
    'keeps the released behavior for a package with %s',
    async (_label, peers) => {
      const old = integration(
        '@acme/old',
        [{name: 'OldTopNav', replaces: 'TopNav'}],
        {peers},
      );
      const result = await resolveComponentReplacements(CORE_DIR, [old]);
      expect(result.active).toEqual([]);
      expect(result.forTarget('TopNav')).toBeUndefined();
      expect(codes(result)).toEqual([
        'warning:inactive_component_replacement:OldTopNav',
      ]);
      expect(result.findings[0].optedIn).toBe(false);
      expect(result.findings[0].message).toContain(
        `">=${COMPONENT_REPLACES_CLI}"`,
      );
      expect(result.findings[0].message).toContain('"TopNav" stays Core');
    },
  );

  it('reports a package without the floor with warnings only, even for invalid declarations', async () => {
    const old = integration('@acme/old', [
      {name: 'Missing', replaces: 'NoSuchComponent'},
      {name: 'Button', replaces: 'Card'},
      {name: 'NavA', replaces: 'SideNav'},
      {name: 'NavB', replaces: 'SideNav'},
    ]);
    const result = await resolveComponentReplacements(CORE_DIR, [old]);
    expect(result.active).toEqual([]);
    expect(
      result.findings.every(finding => finding.severity === 'warning'),
    ).toBe(true);
    expect(result.findings.every(finding => finding.optedIn === false)).toBe(
      true,
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'warning:missing_component_replacement_target:Missing',
        'warning:invalid_component_replacement:Button',
      ]),
    );
  });

  it('reports duplicate declarations in a package without the floor as warnings', async () => {
    const old = integration('@acme/old', [
      {name: 'NavA', replaces: 'SideNav'},
      {name: 'NavB', replaces: 'SideNav'},
    ]);
    const result = await resolveComponentReplacements(CORE_DIR, [old]);
    expect(result.active).toEqual([]);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'warning:ambiguous_component_replacement:NavA',
        'warning:ambiguous_component_replacement:NavB',
      ]),
    );
  });

  it('says a same-name declaration without the floor leaves the bare name ambiguous', async () => {
    const old = integration('@acme/old', [
      {name: 'SideNav', replaces: 'SideNav'},
    ]);
    const result = await resolveComponentReplacements(CORE_DIR, [old]);
    expect(codes(result)).toEqual([
      'warning:inactive_component_replacement:SideNav',
    ]);
    expect(result.findings[0].message).toContain(
      'the bare name "SideNav" stays ambiguous',
    );
    expect(result.findings[0].message).not.toContain('stays Core');
  });

  it('fails closed on invalid declarations from a package with the floor', async () => {
    const bad = integration(
      '@acme/bad',
      [
        {name: 'Missing', replaces: 'NoSuchComponent'},
        {name: 'WrongCase', replaces: 'sidenav'},
        {name: 'Button', replaces: 'Card'},
        {name: 'NavA', replaces: 'TopNav'},
        {name: 'NavB', replaces: 'TopNav'},
      ],
      {peers: FLOOR},
    );
    const result = await resolveComponentReplacements(CORE_DIR, [bad]);
    expect(codes(result).sort()).toEqual(
      [
        'error:missing_component_replacement_target:Missing',
        'error:missing_component_replacement_target:WrongCase',
        'error:invalid_component_replacement:Button',
        'error:ambiguous_component_replacement:NavA',
        'error:ambiguous_component_replacement:NavB',
      ].sort(),
    );
    expect(
      result.findings.find(f => f.component === 'WrongCase')?.message,
    ).toContain('Core names it "SideNav"');
    expect(result.findings.every(finding => finding.optedIn === true)).toBe(
      true,
    );
    // Nothing replaces Core: neither the duplicated target nor the target of a
    // component named after another Core component.
    expect(result.active).toEqual([]);
    expect(result.forTarget('TopNav')).toBeUndefined();
    expect(result.forTarget('Card')).toBeUndefined();
  });

  it('rejects a value that is not a non-empty string', async () => {
    const bad = integration(
      '@acme/bad',
      [{name: 'AcmeNav', replaces: 42, legacy: true}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [bad]);
    expect(result.active).toEqual([]);
    expect(codes(result)).toEqual([
      'error:invalid_component_replacement:AcmeNav',
    ]);
  });

  it('applies a replacement under the export a doc names when its file is named otherwise', async () => {
    // Nav.doc.mjs documents AcmeSideNav, the export of a Nav.tsx that exports
    // nothing named Nav.
    const acme = integrationWithDocSource(
      '@acme/nav',
      'Nav',
      BASE_DOC.replace("name: 'AcmeNav'", "name: 'AcmeSideNav'"),
    );
    fs.writeFileSync(
      path.join(acme.components, 'Nav.tsx'),
      'export function AcmeSideNav() { return null; }\n',
    );
    const result = await resolveComponentReplacements(CORE_DIR, [acme]);
    expect(result.findings).toEqual([]);
    expect(result.forTarget('SideNav')).toMatchObject({
      name: 'AcmeSideNav',
      package: '@acme/nav',
    });
  });

  it("counts a doc's replaces once when the doc lists its own name as a member", async () => {
    // Chip.doc.mjs documents AcmeChip beside a Chip.tsx that exports both, and
    // lists itself first, as the component-family guide asks.
    const acme = integrationWithDocSource(
      '@acme/chips',
      'Chip',
      `export default {type: 'component', name: 'AcmeChip', replaces: 'Badge', usage: {description: 'Acme chip.'}, components: [{name: 'AcmeChip', description: 'A chip.', props: []}]};\n`,
    );
    fs.writeFileSync(
      path.join(acme.components, 'Chip.tsx'),
      'export function Chip() { return null; }\nexport function AcmeChip() { return null; }\n',
    );
    const result = await resolveComponentReplacements(CORE_DIR, [acme]);
    expect(result.findings).toEqual([]);
    expect(result.forTarget('Badge')).toMatchObject({
      name: 'Chip',
      package: '@acme/chips',
    });
  });

  it('lets a replacement keep the Core name it replaces', async () => {
    const acme = integration(
      '@acme/nav',
      [{name: 'SideNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [acme]);
    expect(result.findings).toEqual([]);
    expect(result.forTarget('SideNav')).toMatchObject({
      name: 'SideNav',
      package: '@acme/nav',
    });
  });

  it('lets the later configured package win, with a warning', async () => {
    const first = integration(
      '@acme/first',
      [{name: 'FirstNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const second = integration(
      '@acme/second',
      [{name: 'SecondNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [
      first,
      second,
    ]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/second');
    expect(codes(result)).toEqual([
      'warning:ambiguous_component_replacement:SecondNav',
    ]);
    expect(result.findings[0].message).toContain('configured later');
  });

  it('lets an explicitly configured package beat an autolinked one', async () => {
    const explicit = integration(
      '@acme/explicit',
      [{name: 'ExplicitNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const autolinked = integration(
      '@acme/auto',
      [{name: 'AutoNav', replaces: 'SideNav'}],
      {peers: FLOOR, autolinked: true},
    );
    const result = await resolveComponentReplacements(CORE_DIR, [
      explicit,
      autolinked,
    ]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/explicit');
    expect(result.findings[0].message).toContain('explicitly configured');
  });

  it('lets the later autolinked dependency win when nothing is configured', async () => {
    const a = integration('@acme/a', [{name: 'ANav', replaces: 'SideNav'}], {
      peers: FLOOR,
      autolinked: true,
    });
    const b = integration('@acme/b', [{name: 'BNav', replaces: 'SideNav'}], {
      peers: FLOOR,
      autolinked: true,
    });
    const result = await resolveComponentReplacements(CORE_DIR, [a, b]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/b');
    expect(result.findings[0].message).toContain(
      'listed later in package.json',
    );
  });

  it('never lets an invalid autolinked declaration disable an explicit replacement', async () => {
    const explicit = integration(
      '@acme/explicit',
      [{name: 'ExplicitNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const broken = integration(
      '@acme/broken',
      [
        {name: 'NavA', replaces: 'SideNav'},
        {name: 'NavB', replaces: 'SideNav'},
      ],
      {peers: FLOOR, autolinked: true},
    );
    const result = await resolveComponentReplacements(CORE_DIR, [
      explicit,
      broken,
    ]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/explicit');
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'error:ambiguous_component_replacement:NavA',
        'error:ambiguous_component_replacement:NavB',
      ]),
    );
  });

  it('ignores a package without the floor when another package replaces the same target', async () => {
    const old = integration('@acme/old', [
      {name: 'OldNav', replaces: 'SideNav'},
    ]);
    const acme = integration(
      '@acme/nav',
      [{name: 'AcmeSideNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [acme, old]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/nav');
    expect(codes(result)).toEqual([
      'warning:inactive_component_replacement:OldNav',
    ]);
  });

  it('warns about a component from another package that the replacement shadows', async () => {
    const native = integration('@acme/native', [{name: 'SideNav'}]);
    const acme = integration(
      '@acme/nav',
      [{name: 'AcmeSideNav', replaces: 'SideNav'}],
      {
        peers: FLOOR,
      },
    );
    const result = await resolveComponentReplacements(CORE_DIR, [native, acme]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/nav');
    expect(codes(result)).toEqual(['warning:shadowed_component_name:SideNav']);
    expect(result.findings[0].message).toContain('--package @acme/native');
  });

  it.each([
    [
      'a re-exported doc',
      "export {default} from '../lib/base.mjs';\n",
      {'base.mjs': BASE_DOC},
    ],
    [
      'an imported default',
      "import base from '../lib/base.mjs';\nexport default base;\n",
      {'base.mjs': BASE_DOC},
    ],
    [
      'a factory call',
      "import {navDoc} from '../lib/factory.mjs';\nexport default navDoc('AcmeNav', 'SideNav');\n",
      {
        'factory.mjs':
          "export const navDoc = (name, target) => ({type: 'component', name, displayName: name, replaces: target, usage: {description: name}, props: []});\n",
      },
    ],
    [
      'Object.assign over a shared base',
      "import {shared} from '../lib/shared.mjs';\nexport default Object.assign({}, shared, {name: 'AcmeNav', displayName: 'Acme Nav'});\n",
      {
        'shared.mjs':
          "export const shared = {type: 'component', replaces: 'SideNav', usage: {description: 'Acme nav.'}, props: []};\n",
      },
    ],
    [
      'a computed key',
      "const key = 'rep' + 'laces';\nexport default {type: 'component', name: 'AcmeNav', displayName: 'Acme Nav', [key]: 'SideNav', usage: {description: 'Acme nav.'}, props: []};\n",
      {},
    ],
  ])(
    'reads a replacement declared through %s',
    async (_form, docSource, lib) => {
      const acme = integrationWithDocSource(
        '@acme/nav',
        'AcmeNav',
        docSource,
        lib,
      );
      const result = await resolveComponentReplacements(CORE_DIR, [acme]);
      expect(result.findings).toEqual([]);
      expect(result.forTarget('SideNav')).toMatchObject({
        name: 'AcmeNav',
        package: '@acme/nav',
      });
    },
  );

  it('never reports an invalid component as shadowed', async () => {
    const broken = integration('@acme/broken', []);
    fs.writeFileSync(
      path.join(broken.components, 'SideNav.doc.mjs'),
      "export default {type: 'component', name: 'SideNav', props: 'not a list'};\n",
    );
    fs.writeFileSync(
      path.join(broken.components, 'SideNav.tsx'),
      'export function SideNav() { return null; }\n',
    );
    const acme = integration(
      '@acme/nav',
      [{name: 'AcmeSideNav', replaces: 'SideNav'}],
      {peers: FLOOR},
    );
    const result = await resolveComponentReplacements(CORE_DIR, [broken, acme]);
    expect(result.forTarget('SideNav')?.package).toBe('@acme/nav');
    expect(result.findings).toEqual([]);
  });

  it('decides nothing when no component declares a replacement', async () => {
    const plain = integration('@acme/plain', [{name: 'AcmeCard'}], {
      peers: FLOOR,
    });
    const result = await resolveComponentReplacements(CORE_DIR, [plain]);
    expect(result).toMatchObject({active: [], findings: []});
  });
});
