// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createShadcnPrecompiledDeclaration,
  shadcnJavaScriptTarget,
  shadcnPrecompiledDeclarationTarget,
  transformShadcnJavaScriptSource,
} from '../../../authoring/shadcn/source-variants.mjs';
import {
  createRegistryReceipt,
  registryReceiptTarget,
  serializeRegistryReceipt,
} from '../../../authoring/shadcn/receipt.mjs';
import {
  discoverRegistryReceipts,
  reconcileRegistryCompositions,
} from './registry.mjs';
import {upgrade} from '../upgrade.mjs';
import {logger} from '../../logger.mjs';

const ITEM = {
  name: 'example-button-basic',
  path: 'examples/button/basic',
  aliases: [],
  kind: 'example',
};
const SOURCE_TARGET = 'components/astryx/examples/ButtonBasic.tsx';
const REGISTRY_PATH = 'registry/example-button-basic/ButtonBasic.tsx';
const RECEIPT_TARGET = registryReceiptTarget(SOURCE_TARGET, ITEM.name);
const JAVASCRIPT_TARGET = shadcnJavaScriptTarget(SOURCE_TARGET);

function javascriptVariant(content) {
  return {
    format: 'javascript',
    target: JAVASCRIPT_TARGET,
    content: transformShadcnJavaScriptSource(content),
  };
}

let project;
let root;

function receipt(content, overrides = {}) {
  const target = overrides.target ?? SOURCE_TARGET;
  const registryPath = overrides.registryPath ?? REGISTRY_PATH;
  const item = overrides.item ?? ITEM;
  const receiptTarget =
    overrides.receiptTarget ?? registryReceiptTarget(target, item.name);
  return createRegistryReceipt({
    item,
    sourceVersion: overrides.version ?? '0.5.0',
    receiptTarget,
    files: [
      {
        id: 'primary',
        target,
        registryPath,
        content,
        variants: overrides.variants ?? [],
      },
    ],
  });
}

function seed({
  base,
  current = base,
  receiptValue = receipt(base),
  sourceTarget = SOURCE_TARGET,
  receiptTarget = RECEIPT_TARGET,
}) {
  const sourcePath = path.join(root, sourceTarget);
  const receiptPath = path.join(root, receiptTarget);
  fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  if (current !== null) fs.writeFileSync(sourcePath, current, 'utf8');
  fs.writeFileSync(
    receiptPath,
    typeof receiptValue === 'string'
      ? receiptValue
      : serializeRegistryReceipt(receiptValue),
    'utf8',
  );
  return {sourcePath, receiptPath};
}

function remote(latest, overrides = {}) {
  const itemIdentity = overrides.item ?? ITEM;
  const target = overrides.target ?? SOURCE_TARGET;
  const registryPath = overrides.registryPath ?? REGISTRY_PATH;
  const receiptBaseTarget = registryReceiptTarget(target, itemIdentity.name);
  const receiptFiles = [
    {
      id: 'primary',
      target,
      registryPath,
      content: latest,
      variants: overrides.variants ?? [],
    },
    ...(overrides.extraFiles ?? []),
  ];
  const nextReceipt = createRegistryReceipt({
    item: itemIdentity,
    sourceVersion: overrides.version ?? '0.6.0',
    receiptTarget: receiptBaseTarget,
    files: receiptFiles,
  });
  const item = {
    name: nextReceipt.item.name,
    type: nextReceipt.item.kind === 'page' ? 'registry:page' : 'registry:block',
    files: [
      ...receiptFiles.map(file => ({
        path: file.registryPath,
        type: file.id === 'types' ? 'registry:file' : 'registry:block',
        target: file.target,
        content:
          file.id === 'primary'
            ? (overrides.sourceContent ?? file.content)
            : file.content,
      })),
      {
        path: `registry/${itemIdentity.name}/astryx-receipt.json`,
        type: 'registry:file',
        target: overrides.receiptTarget ?? receiptBaseTarget,
        content: serializeRegistryReceipt(nextReceipt),
      },
    ],
  };
  return vi.fn(
    async () => new globalThis.Response(JSON.stringify(item), {status: 200}),
  );
}

async function reconcile(options = {}, context = {}) {
  return reconcileRegistryCompositions(
    {path: 'src', ...options},
    {cwd: project, registryOrigin: 'https://registry.example.test', ...context},
  );
}

beforeEach(() => {
  project = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-composition-upgrade-'),
  );
  root = path.join(project, 'src');
  fs.mkdirSync(root, {recursive: true});
});

afterEach(() => {
  fs.rmSync(project, {recursive: true, force: true});
});

describe('registry composition upgrades', () => {
  it('discovers only JSON receipts inside .astryx directories', () => {
    const {receiptPath} = seed({base: 'base\n'});
    fs.writeFileSync(
      path.join(path.dirname(receiptPath), 'notes.txt'),
      'ignore',
    );
    fs.mkdirSync(path.join(root, 'node_modules', 'x', '.astryx'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, 'node_modules', 'x', '.astryx', 'ignored.json'),
      '{}',
    );

    expect(discoverRegistryReceipts(root)).toEqual([receiptPath]);
  });

  it('bounds concurrent registry fetches', async () => {
    const remoteItems = new Map();
    for (let index = 0; index < 12; index++) {
      const item = {
        name: `example-test-${index}`,
        path: `examples/test/item-${index}`,
        aliases: [],
        kind: 'example',
      };
      const sourceTarget = `components/astryx/examples/Test${index}.tsx`;
      const registryPath = `registry/${item.name}/Test${index}.tsx`;
      const receiptTarget = registryReceiptTarget(sourceTarget, item.name);
      const installed = createRegistryReceipt({
        item,
        sourceVersion: '0.5.0',
        receiptTarget,
        files: [
          {
            id: 'primary',
            target: sourceTarget,
            registryPath,
            content: 'old\n',
          },
        ],
      });
      const latest = createRegistryReceipt({
        item,
        sourceVersion: '0.6.0',
        receiptTarget,
        files: [
          {
            id: 'primary',
            target: sourceTarget,
            registryPath,
            content: 'new\n',
          },
        ],
      });
      const sourcePath = path.join(root, sourceTarget);
      const receiptPath = path.join(root, receiptTarget);
      fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
      fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
      fs.writeFileSync(sourcePath, 'old\n');
      fs.writeFileSync(receiptPath, serializeRegistryReceipt(installed));
      remoteItems.set(
        `/${item.path}.json`,
        JSON.stringify({
          name: item.name,
          type: 'registry:block',
          files: [
            {
              path: registryPath,
              type: 'registry:block',
              target: sourceTarget,
              content: 'new\n',
            },
            {
              path: `registry/${item.name}/astryx-receipt.json`,
              type: 'registry:file',
              target: receiptTarget,
              content: serializeRegistryReceipt(latest),
            },
          ],
        }),
      );
    }

    let active = 0;
    let maximum = 0;
    const fetchImpl = vi.fn(async url => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      const body = remoteItems.get(new URL(url).pathname);
      return new globalThis.Response(body ?? 'not found', {
        status: body ? 200 : 404,
      });
    });
    const result = await reconcile({}, {fetchImpl});

    expect(result.summary).toMatchObject({found: 12, wouldUpdate: 12});
    expect(maximum).toBe(8);
  });

  it('reports a current pristine source without writing', async () => {
    const {sourcePath, receiptPath} = seed({base: 'same\n'});
    const before = fs.readFileSync(receiptPath, 'utf8');
    const result = await reconcile(
      {},
      {fetchImpl: remote('same\n', {version: '0.5.0'})},
    );

    expect(result.summary).toMatchObject({
      applied: false,
      found: 1,
      current: 1,
      conflicts: 0,
      failed: 0,
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('same\n');
    expect(fs.readFileSync(receiptPath, 'utf8')).toBe(before);
  });

  it('refuses source from a different Astryx release', async () => {
    const {sourcePath} = seed({base: 'old\n'});
    const result = await reconcile(
      {apply: true},
      {fetchImpl: remote('new\n'), expectedVersion: '0.5.0'},
    );

    expect(result.summary).toMatchObject({ok: false, failed: 1, updated: 0});
    expect(result.summary.items[0].message).toMatch(/project has 0\.5\.0/);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
  });

  it('accepts canary source for an installed canary release', async () => {
    const {sourcePath} = seed({base: 'old\n'});
    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote('new\n', {version: 'canary'}),
        expectedVersion: '0.6.0-canary.42',
      },
    );

    expect(result.summary).toMatchObject({ok: true, updated: 1});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('new\n');
  });

  it('previews a pristine update without writing', async () => {
    const {sourcePath, receiptPath} = seed({base: 'old\n'});
    const before = fs.readFileSync(receiptPath, 'utf8');
    const result = await reconcile({}, {fetchImpl: remote('new\n')});

    expect(result.summary).toMatchObject({
      found: 1,
      wouldUpdate: 1,
      updated: 0,
    });
    expect(result.summary.items[0].action).toBe('would-update');
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
    expect(fs.readFileSync(receiptPath, 'utf8')).toBe(before);
  });

  it('updates a pristine source and advances its receipt', async () => {
    const {sourcePath, receiptPath} = seed({base: 'old\n'});
    fs.writeFileSync(`${sourcePath}.astryx-conflict`, 'stale\n');
    const result = await reconcile({apply: true}, {fetchImpl: remote('new\n')});

    expect(result.summary).toMatchObject({
      applied: true,
      found: 1,
      wouldUpdate: 0,
      updated: 1,
      conflicts: 0,
      items: [{action: 'updated'}],
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('new\n');
    expect(fs.existsSync(`${sourcePath}.astryx-conflict`)).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(receiptPath, 'utf8')).source.version,
    ).toBe('0.6.0');
  });

  it('updates the JavaScript install variant selected by stock ShadCN', async () => {
    const base = "export const value: string = 'old';\n";
    const latest = "export const value: string = 'new';\n";
    const installedReceipt = receipt(base, {
      variants: [javascriptVariant(base)],
    });
    const sourcePath = path.join(root, JAVASCRIPT_TARGET);
    const receiptPath = path.join(root, RECEIPT_TARGET);
    fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
    fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
    fs.writeFileSync(sourcePath, transformShadcnJavaScriptSource(base), 'utf8');
    fs.writeFileSync(
      receiptPath,
      serializeRegistryReceipt(installedReceipt),
      'utf8',
    );

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          variants: [javascriptVariant(latest)],
        }),
      },
    );

    expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      transformShadcnJavaScriptSource(latest),
    );
    expect(fs.existsSync(path.join(root, SOURCE_TARGET))).toBe(false);
    const nextReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(nextReceipt.schemaVersion).toBe(2);
    expect(nextReceipt.files[0].variants[0].registryTarget).toBe(
      JAVASCRIPT_TARGET,
    );
  });

  it('treats printer-only JavaScript drift as pristine', async () => {
    const base = "export const value: string = 'old';\n";
    const latest = "export const value: string = 'new';\n";
    const installedReceipt = receipt(base, {
      variants: [javascriptVariant(base)],
    });
    const sourcePath = path.join(root, JAVASCRIPT_TARGET);
    const receiptPath = path.join(root, RECEIPT_TARGET);
    fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
    fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
    fs.writeFileSync(sourcePath, 'export   const value = "old";\n', 'utf8');
    fs.writeFileSync(
      receiptPath,
      serializeRegistryReceipt(installedReceipt),
      'utf8',
    );

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          variants: [javascriptVariant(latest)],
        }),
      },
    );

    expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      transformShadcnJavaScriptSource(latest),
    );
  });

  it('three-way merges edits in a JavaScript install variant', async () => {
    const base =
      "const title: string = 'title';\n" +
      "const body: string = 'body';\n" +
      "const spacer: string = 'spacer';\n" +
      "const footer: string = 'footer';\n" +
      'export {title, body, spacer, footer};\n';
    const latest = base.replace("'footer'", "'new footer'");
    const current = transformShadcnJavaScriptSource(base).replace(
      "'title'",
      "'custom title'",
    );
    const sourcePath = path.join(root, JAVASCRIPT_TARGET);
    const receiptPath = path.join(root, RECEIPT_TARGET);
    fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
    fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
    fs.writeFileSync(sourcePath, current, 'utf8');
    fs.writeFileSync(
      receiptPath,
      serializeRegistryReceipt(
        receipt(base, {variants: [javascriptVariant(base)]}),
      ),
      'utf8',
    );

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          variants: [javascriptVariant(latest)],
        }),
      },
    );

    expect(result.summary).toMatchObject({merged: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      transformShadcnJavaScriptSource(latest).replace(
        "'title'",
        "'custom title'",
      ),
    );
  });

  it('repairs a version 1 JavaScript install on its first upgrade', async () => {
    const base = "export const value: string = 'old';\n";
    const latest = "export const value: string = 'new';\n";
    const currentReceipt = receipt(base);
    const {variants: _variants, ...legacyFile} = currentReceipt.files[0];
    const legacyReceipt = {
      ...currentReceipt,
      schemaVersion: 1,
      files: [legacyFile],
    };
    const sourcePath = path.join(root, JAVASCRIPT_TARGET);
    const receiptPath = path.join(root, RECEIPT_TARGET);
    fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
    fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
    fs.writeFileSync(sourcePath, transformShadcnJavaScriptSource(base), 'utf8');
    fs.writeFileSync(
      receiptPath,
      serializeRegistryReceipt(legacyReceipt),
      'utf8',
    );

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          variants: [javascriptVariant(latest)],
        }),
      },
    );

    expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      transformShadcnJavaScriptSource(latest),
    );
    expect(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).schemaVersion).toBe(
      2,
    );
  });

  it('adds a strict TypeScript declaration while upgrading legacy precompiled JSX', async () => {
    const target = 'components/astryx/examples/CompiledExample.jsx';
    const registryPath = 'registry/example-button-basic/CompiledExample.jsx';
    const receiptTarget = registryReceiptTarget(target, ITEM.name);
    const base =
      "export default function CompiledExample() { return 'old'; }\n";
    const latest =
      "export default function CompiledExample() { return 'new'; }\n";
    const currentReceipt = receipt(base, {target, registryPath, receiptTarget});
    const {variants: _variants, ...legacyFile} = currentReceipt.files[0];
    const legacyReceipt = {
      ...currentReceipt,
      schemaVersion: 1,
      files: [legacyFile],
    };
    const {sourcePath, receiptPath} = seed({
      base,
      receiptValue: legacyReceipt,
      sourceTarget: target,
      receiptTarget,
    });
    const typesTarget = shadcnPrecompiledDeclarationTarget(target);
    const typesContent = createShadcnPrecompiledDeclaration(target);

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          target,
          registryPath,
          extraFiles: [
            {
              id: 'types',
              target: typesTarget,
              registryPath: 'registry/example-button-basic/astryx-types.d.mts',
              content: typesContent,
              variants: [],
            },
          ],
        }),
      },
    );

    expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(latest);
    expect(fs.readFileSync(path.join(root, typesTarget), 'utf8')).toBe(
      typesContent,
    );
    expect(result.writtenFiles).toContain(path.join(root, typesTarget));
    const nextReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(nextReceipt.schemaVersion).toBe(2);
    expect(nextReceipt.files.map(file => file.id)).toEqual([
      'primary',
      'types',
    ]);
  });

  it('reports an unreadable generated declaration target without aborting the run', async () => {
    const target = 'components/astryx/examples/CompiledExample.jsx';
    const registryPath = 'registry/example-button-basic/CompiledExample.jsx';
    const receiptTarget = registryReceiptTarget(target, ITEM.name);
    const base =
      "export default function CompiledExample() { return 'old'; }\n";
    const currentReceipt = receipt(base, {target, registryPath, receiptTarget});
    const {variants: _variants, ...legacyFile} = currentReceipt.files[0];
    seed({
      base,
      receiptValue: {...currentReceipt, schemaVersion: 1, files: [legacyFile]},
      sourceTarget: target,
      receiptTarget,
    });
    const typesTarget = shadcnPrecompiledDeclarationTarget(target);
    fs.mkdirSync(path.join(root, typesTarget), {recursive: true});

    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(base, {
          target,
          registryPath,
          extraFiles: [
            {
              id: 'types',
              target: typesTarget,
              registryPath: 'registry/example-button-basic/astryx-types.d.mts',
              content: createShadcnPrecompiledDeclaration(target),
              variants: [],
            },
          ],
        }),
      },
    );

    expect(result.summary).toMatchObject({invalid: 1, conflicts: 1, failed: 0});
    expect(fs.lstatSync(path.join(root, typesTarget)).isDirectory()).toBe(true);
  });

  it('rolls back source when the receipt write fails', async () => {
    if (process.platform === 'win32') return;
    const {sourcePath, receiptPath} = seed({base: 'old\n'});
    const receiptDir = path.dirname(receiptPath);
    fs.chmodSync(receiptDir, 0o500);
    try {
      const result = await reconcile(
        {apply: true},
        {fetchImpl: remote('new\n')},
      );

      expect(result.summary).toMatchObject({
        ok: false,
        updated: 0,
        failed: 1,
        items: [{action: 'write-error'}],
      });
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
      expect(
        JSON.parse(fs.readFileSync(receiptPath, 'utf8')).source.version,
      ).toBe('0.5.0');
    } finally {
      fs.chmodSync(receiptDir, 0o700);
    }
  });

  it('preserves CRLF when updating a pristine source', async () => {
    const {sourcePath} = seed({
      base: 'first\nsecond\n',
      current: 'first\r\nsecond\r\n',
    });
    const result = await reconcile(
      {apply: true},
      {fetchImpl: remote('first\nupdated\n')},
    );

    expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('first\r\nupdated\r\n');
  });

  it('three-way merges non-overlapping user and upstream edits', async () => {
    const base = 'title\nbody\nfooter\n';
    const current = 'custom title\nbody\nfooter\n';
    const latest = 'title\nbody\nnew footer\n';
    const {sourcePath} = seed({base, current});
    const result = await reconcile({apply: true}, {fetchImpl: remote(latest)});

    expect(result.summary).toMatchObject({
      merged: 1,
      conflicts: 0,
      items: [{action: 'merged'}],
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      'custom title\nbody\nnew footer\n',
    );
  });

  it('preserves CRLF when three-way merging', async () => {
    const base = 'title\nbody\nfooter\n';
    const current = 'custom title\r\nbody\r\nfooter\r\n';
    const latest = 'title\nbody\nnew footer\n';
    const {sourcePath} = seed({base, current});
    const result = await reconcile({apply: true}, {fetchImpl: remote(latest)});

    expect(result.summary).toMatchObject({merged: 1, conflicts: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      'custom title\r\nbody\r\nnew footer\r\n',
    );
  });

  it('leaves edited source and receipt untouched on conflict', async () => {
    const base = 'value = 1\n';
    const current = 'value = local\n';
    const latest = 'value = upstream\n';
    const {sourcePath, receiptPath} = seed({base, current});
    const beforeReceipt = fs.readFileSync(receiptPath, 'utf8');
    const result = await reconcile({apply: true}, {fetchImpl: remote(latest)});
    const conflictPath = `${sourcePath}.astryx-conflict`;

    expect(result.summary).toMatchObject({conflicts: 1, updated: 0, merged: 0});
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(current);
    expect(fs.readFileSync(receiptPath, 'utf8')).toBe(beforeReceipt);
    expect(fs.readFileSync(conflictPath, 'utf8')).toContain(
      '<<<<<<< current project',
    );
    expect(fs.readFileSync(conflictPath, 'utf8')).toContain(
      '>>>>>>> latest 0.6.0',
    );
  });

  it('does not recreate a deleted or moved source', async () => {
    const {sourcePath} = seed({base: 'old\n', current: null});
    const result = await reconcile({apply: true}, {fetchImpl: remote('new\n')});

    expect(result.summary).toMatchObject({missing: 1, conflicts: 1});
    expect(fs.existsSync(sourcePath)).toBe(false);
  });

  it('does not replace a symbolic-link source', async () => {
    if (process.platform === 'win32') return;
    const {sourcePath} = seed({base: 'old\n'});
    const linkedPath = path.join(root, 'linked.tsx');
    fs.writeFileSync(linkedPath, 'linked\n', 'utf8');
    fs.rmSync(sourcePath);
    fs.symlinkSync(linkedPath, sourcePath);

    const result = await reconcile({apply: true}, {fetchImpl: remote('new\n')});

    expect(result.summary).toMatchObject({invalid: 1, conflicts: 1});
    expect(fs.lstatSync(sourcePath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(linkedPath, 'utf8')).toBe('linked\n');
  });

  it('accepts an installed route that became an alias', async () => {
    seed({base: 'old\n'});
    const fetchImpl = remote('new\n', {
      item: {
        ...ITEM,
        path: 'examples/button/new-basic',
        aliases: [ITEM.path],
      },
    });
    const result = await reconcile({apply: true}, {fetchImpl});

    expect(result.summary.updated).toBe(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://registry.example.test/examples/button/basic.json',
    );
  });

  it('refuses an upstream source-set change', async () => {
    const {sourcePath} = seed({base: 'old\n'});
    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote('new\n', {
          extraFiles: [
            {
              id: 'secondary',
              target: 'components/astryx/examples/Helper.ts',
              registryPath: 'registry/example-button-basic/Helper.ts',
              content: 'export const helper = true;\n',
            },
          ],
        }),
      },
    );

    expect(result.summary).toMatchObject({conflicts: 1, updated: 0});
    expect(result.summary.items[0].message).toMatch(/source set/);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
  });

  it('rejects a corrupt installed base before fetching or writing', async () => {
    const value = receipt('base\n');
    value.files[0].sha256 = '0'.repeat(64);
    const {sourcePath} = seed({base: 'base\n', receiptValue: value});
    const fetchImpl = remote('new\n');
    const result = await reconcile({apply: true}, {fetchImpl});

    expect(result.summary).toMatchObject({invalid: 1, failed: 0});
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('base\n');
  });

  it('rejects a receipt target that escapes the source root', async () => {
    const value = receipt('base\n');
    value.files[0].target = '../../../outside.tsx';
    const outside = path.join(project, 'outside.tsx');
    seed({base: 'base\n', receiptValue: value});
    const result = await reconcile({apply: true}, {fetchImpl: remote('new\n')});

    expect(result.summary.invalid).toBe(1);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('rejects an oversized registry item before reading its body', async () => {
    seed({base: 'old\n'});
    const fetchImpl = vi.fn(
      async () =>
        new globalThis.Response('{}', {
          status: 200,
          headers: {'content-length': String(16 * 1024 * 1024 + 1)},
        }),
    );
    const result = await reconcile({apply: true}, {fetchImpl});

    expect(result.summary.failed).toBe(1);
    expect(result.summary.items[0].message).toMatch(/exceeds/);
  });

  it('rejects a remote receipt installed under the wrong target', async () => {
    const {sourcePath} = seed({base: 'old\n'});
    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote('new\n', {
          receiptTarget: 'components/astryx/.astryx/wrong.json',
        }),
      },
    );

    expect(result.summary.failed).toBe(1);
    expect(result.summary.items[0].message).toMatch(/misplaced/);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
  });

  it('rejects a remote JavaScript variant that disagrees with canonical source', async () => {
    const base = "export const value: string = 'old';\n";
    const latest = "export const value: string = 'new';\n";
    const {sourcePath} = seed({base});
    const result = await reconcile(
      {apply: true},
      {
        fetchImpl: remote(latest, {
          variants: [
            javascriptVariant("export const value: string = 'tampered';\n"),
          ],
        }),
      },
    );

    expect(result.summary.failed).toBe(1);
    expect(result.summary.items[0].message).toMatch(
      /invalid javascript variant/,
    );
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(base);
  });

  it('rejects a remote receipt that disagrees with shipped source', async () => {
    const {sourcePath} = seed({base: 'old\n'});
    const result = await reconcile(
      {apply: true},
      {fetchImpl: remote('new\n', {sourceContent: 'tampered\n'})},
    );

    expect(result.summary.failed).toBe(1);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
  });
});

describe('copied-composition paths name files from the folder the command ran in', () => {
  it('below the project root, and from the scanned source folder at the root', async () => {
    const {sourcePath} = seed({
      base: 'value = 1\n',
      current: 'value = local\n',
    });
    const fetchImpl = remote('value = upstream\n');
    const origin = path.join(project, 'apps', 'web');

    const [atRoot] = (await reconcile({}, {fetchImpl})).summary.items[0].files;
    const [below] = (await reconcile({}, {fetchImpl, origin})).summary.items[0]
      .files;

    expect(atRoot).toMatchObject({
      path: SOURCE_TARGET,
      conflictFile: `${SOURCE_TARGET}.astryx-conflict`,
    });
    expect(below).toMatchObject({
      path: `../../src/${SOURCE_TARGET}`,
      conflictFile: `../../src/${SOURCE_TARGET}.astryx-conflict`,
    });
    expect(path.resolve(origin, below.path)).toBe(sourcePath);
  });

  it('for an invalid receipt too', async () => {
    const value = receipt('base\n');
    value.files[0].sha256 = '0'.repeat(64);
    seed({base: 'base\n', receiptValue: value});
    const fetchImpl = remote('new\n');
    const origin = path.join(project, 'docs');

    const [atRoot] = (await reconcile({}, {fetchImpl})).summary.items;
    const [below] = (await reconcile({}, {fetchImpl, origin})).summary.items;

    expect(atRoot.message).toContain(`Invalid receipt ${RECEIPT_TARGET}:`);
    expect(below.message).toContain(
      `Invalid receipt ../src/${RECEIPT_TARGET}:`,
    );
  });

  it('through upgrade(), with --registry and in a run, which name the project root', async () => {
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: {'@astryxdesign/core': '0.6.0'},
      }),
    );
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.6.0'}),
    );
    const frontend = path.join(project, 'frontend');
    fs.mkdirSync(frontend);
    seed({base: 'old\n'});
    vi.stubGlobal('fetch', remote('new\n'));
    const log = vi.spyOn(logger, 'log');
    try {
      const registry = await upgrade({registry: true}, {cwd: frontend});
      const run = await upgrade({from: '0.6.0'}, {cwd: frontend});
      const atRoot = await upgrade({registry: true}, {cwd: project});

      expect(registry.data.items[0].files[0].path).toBe(
        `../src/${SOURCE_TARGET}`,
      );
      expect(run.data.registryCompositions.items[0].files[0].path).toBe(
        `../src/${SOURCE_TARGET}`,
      );
      expect(atRoot.data.items[0].files[0].path).toBe(SOURCE_TARGET);
      expect(
        log.mock.calls.filter(([line]) =>
          String(line).startsWith('Project root:'),
        ),
      ).toEqual([['Project root: ..'], ['Project root: ..']]);
    } finally {
      vi.unstubAllGlobals();
      log.mockRestore();
    }
  });
});
