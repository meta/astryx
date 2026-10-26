// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {loadCoreDoc} from '../../scripts/core-docs.mjs';
import {
  buildContracts,
  checkContract,
  generateSwift,
  generateTypeScript,
} from './index.js';
import type {ComponentContract} from './types.js';
import {BUILTIN_ICON_NAMES} from '../icons/defaults.js';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const APPLE_GENERATED = path.join(
  PACKAGE_ROOT,
  'apple/Sources/AstryxNative/Generated',
);

describe('native contracts', () => {
  it('splits core Selector documentation into a portable core and a web part', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const selector = contracts.find(contract => contract.name === 'Selector');
    expect(selector).toBeDefined();
    expect(Object.keys(selector!.core)).toEqual(
      expect.arrayContaining([
        'label',
        'options',
        'value',
        'onChange',
        'isDisabled',
        'status',
      ]),
    );
    const web = new Map(
      selector!.webOnly.map(prop => [prop.name, prop.reason]),
    );
    expect(web.get('renderOption')).toContain('render function');
    expect(web.get('emptyText')).toContain('typed slot');
    expect(web.get('onClick')).toContain('DOM event');
    expect(web.get('presentation')).toContain(
      'native platforms use their own control',
    );
    expect(selector!.core).not.toHaveProperty('controlXstyle');
  });

  it('moves a prop only some native platforms carry out of the core and onto those platforms', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const switchContract = contracts.find(
      contract => contract.name === 'Switch',
    )!;
    for (const name of ['labelPosition', 'labelSpacing']) {
      expect(switchContract.core).not.toHaveProperty(name);
      expect(switchContract.platforms.android).toHaveProperty(name);
      expect(switchContract.platforms.windows).toHaveProperty(name);
      expect(switchContract.platforms.ios ?? {}).not.toHaveProperty(name);
      expect(switchContract.platforms.macos ?? {}).not.toHaveProperty(name);
    }
  });

  it('keeps value callbacks, typed text slots, and number sets in the core', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const byName = new Map(
      contracts.map(contract => [contract.name, contract]),
    );
    expect(byName.get('Switch')!.core.onChange?.type).toEqual({
      kind: 'fn',
      args: [{kind: 'boolean'}],
    });
    expect(byName.get('TextInput')!.core.onChange?.type).toEqual({
      kind: 'fn',
      args: [{kind: 'string'}],
    });
    expect(byName.get('Button')!.core.onClick?.type).toEqual({
      kind: 'fn',
      args: [],
    });
    // AST-082 FR4: Button `width` projects the web's size value to the two
    // values every platform supports; other widths stay on the web.
    expect(byName.get('Button')!.core.width?.type).toEqual({
      kind: 'enum',
      values: ['content', 'fill'],
    });
    expect(byName.get('Button')!.projections?.width).toEqual({
      content: 'auto',
      fill: '100%',
    });
    expect(byName.get('Heading')!.core.children?.type).toEqual({
      kind: 'string',
    });
    expect(byName.get('Heading')!.core.level?.type).toEqual({
      kind: 'numberEnum',
      values: [1, 2, 3, 4, 5, 6],
    });
    expect(byName.get('Text')!.core).not.toHaveProperty('id');
    expect(byName.get('Badge')!.core.label).toMatchObject({
      type: {kind: 'string'},
      optional: false,
    });
    expect(byName.get('Badge')!.webOnly.map(prop => prop.name)).toContain(
      'icon',
    );
  });

  it('gives Icon a typed icon slot drawn from the shared icon names', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const icon = contracts.find(contract => contract.name === 'Icon');
    expect(icon).toBeDefined();
    expect(icon!.core.icon).toMatchObject({type: {kind: 'icon'}});
    expect(icon!.core.icon.optional).toBe(false);
    expect(Object.keys(icon!.core)).toEqual(['icon', 'color', 'size', 'label']);
    expect(icon!.webOnly.map(prop => prop.name)).toEqual(['xstyle']);

    const swift = generateSwift(contracts);
    expect(swift['Icon.swift']).toContain('public var icon: IconName');
    const iconName = swift['IconName.swift'];
    for (const name of BUILTIN_ICON_NAMES) {
      expect(iconName).toContain(
        `public static let ${name}: IconName = "${name}"`,
      );
    }
    expect(iconName).toContain('ExpressibleByStringLiteral');

    const types = generateTypeScript(contracts);
    expect(types['core.d.ts']).toContain(
      "export type IconName = 'close' | 'chevronDown'",
    );
    expect(types['core.d.ts']).toContain('icon: IconName;');
  });

  it('gives Avatar its named sizes, a press, and a link, and leaves pixel sizes on the web', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const avatar = contracts.find(contract => contract.name === 'Avatar');
    expect(avatar).toBeDefined();
    expect(avatar!.core.size.type).toEqual({
      kind: 'enum',
      values: ['xsm', 'sm', 'md', 'lg', 'xl'],
    });
    expect(Object.entries(avatar!.projections?.size ?? {})).toEqual(
      ['xsm', 'sm', 'md', 'lg', 'xl'].map(size => [size, size]),
    );
    expect(Object.keys(avatar!.core)).toEqual(
      expect.arrayContaining([
        'src',
        'fallbackSrc',
        'name',
        'alt',
        'shape',
        'href',
        'onClick',
      ]),
    );
    // `string | boolean`: words, or on (the name) and off.
    expect(avatar!.core.tooltip?.type).toEqual({kind: 'textOrBoolean'});
    expect(avatar!.webOnly.map(prop => prop.name)).toEqual(
      expect.arrayContaining(['target', 'rel', 'as']),
    );
  });

  it('gives Avatar a status slot and AvatarStatusDot its variants and label', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const avatar = contracts.find(contract => contract.name === 'Avatar');
    expect(avatar!.core.status?.type).toEqual({kind: 'content'});
    const dot = contracts.find(contract => contract.name === 'AvatarStatusDot');
    expect(dot).toBeDefined();
    expect(dot!.core.variant?.type).toEqual({
      kind: 'enum',
      values: ['success', 'neutral', 'error'],
    });
    expect(dot!.core.label?.type).toEqual({kind: 'string'});
    expect(dot!.webOnly.map(prop => prop.name)).toContain('icon');
  });

  it('reports naming and portability errors', () => {
    const bad: ComponentContract = {
      name: 'Bad',
      baseTarget: 'root',
      types: {},
      core: {
        as: {type: {kind: 'string'}},
        style: {type: {kind: 'string'}},
        item: {type: {kind: 'named', name: 'Missing'}},
      },
      platforms: {
        ios: {item: {type: {kind: 'string'}}, var: {type: {kind: 'boolean'}}},
      },
      webOnly: [],
    };
    const rules = checkContract(bad).map(issue => issue.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'name-keyword',
        'name-toolkit',
        'platform-shadows-core',
        'unknown-type',
      ]),
    );
  });

  it('keeps the committed Swift binding in sync with the contracts', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    for (const [name, contents] of Object.entries(generateSwift(contracts))) {
      const committed = fs.readFileSync(
        path.join(APPLE_GENERATED, name),
        'utf8',
      );
      expect(
        committed,
        `${name} is stale; run pnpm -F @astryxdesign/native generate:apple`,
      ).toBe(contents);
    }
  });

  it('exposes each platform only its own props through type-resolution conditions', async () => {
    const {contracts} = await buildContracts(loadCoreDoc);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-native-types-'));
    const pkg = path.join(dir, 'node_modules/@astryxdesign/native');
    fs.mkdirSync(path.join(pkg, 'types'), {recursive: true});
    for (const [name, contents] of Object.entries(
      generateTypeScript(contracts),
    )) {
      fs.writeFileSync(path.join(pkg, 'types', name), contents);
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    );
    const exportsMap = JSON.stringify(
      manifest.exports['./components'],
    ).replaceAll('./dist/types/', './types/');
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/native',
        type: 'module',
        exports: {'./components': JSON.parse(exportsMap)},
      }),
    );
    const usage = (menuStyle: string) =>
      "import type {SelectorProps} from '@astryxdesign/native/components';\n" +
      `export const props: SelectorProps = {label: 'Shipping', options: [], menuStyle: '${menuStyle}'};\n`;

    const errorsFor = (condition: string | null, source: string) => {
      const file = path.join(dir, `${condition ?? 'none'}.ts`);
      fs.writeFileSync(file, source);
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: condition ? [condition] : [],
        types: [],
      });
      return ts
        .getPreEmitDiagnostics(program)
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    };

    expect(errorsFor('ios', usage('pullDown'))).toEqual([]);
    expect(errorsFor('android', usage('bottomSheet'))).toEqual([]);
    expect(errorsFor('android', usage('pullDown')).join('\n')).toContain(
      'pullDown',
    );
    expect(errorsFor('shared', usage('pullDown')).join('\n')).toContain(
      'menuStyle',
    );
    expect(errorsFor(null, usage('pullDown')).join('\n')).toContain(
      'menuStyle',
    );

    const wire = (node: string, action: string) =>
      "import type {AstryxAction, AstryxNode} from '@astryxdesign/native/components';\n" +
      `export const node: AstryxNode = ${node};\n` +
      `export const action: AstryxAction = ${action};\n`;
    const tree =
      "{component: 'VStack', key: 'root', props: {gap: 2, children: [" +
      "{component: 'Switch', key: 'wifi', props: {label: 'Wi-Fi', value: true}, events: ['onChange']}," +
      "{component: 'Selector', key: 'ship', props: {label: 'Shipping', options: [], menuStyle: 'pullDown'}}]}}";
    const toggled =
      "{key: 'wifi', component: 'Switch', event: 'onChange', args: [false]}";
    expect(errorsFor('ios', wire(tree, toggled))).toEqual([]);
    expect(errorsFor('android', wire(tree, toggled)).join('\n')).toContain(
      'pullDown',
    );
    expect(
      errorsFor(
        'ios',
        wire(
          tree,
          "{key: 'wifi', component: 'Switch', event: 'onChange', args: ['off']}",
        ),
      ).length,
    ).toBeGreaterThan(0);
  });
});
