// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the module size budgets.
 * @input Fixture modules, budgets, and the committed budget file
 * @output The measurement method, warn/enforce verdicts, and fail-closed errors
 * @position Regression tests for `.github/scripts/module-size.mjs`
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {bundleModule, checkBudgets, measureAdapter} from './module-size.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'module-size.mjs');
const REPO = path.resolve(HERE, '../..');

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-size-'));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  write(
    'src/widget/useWidget.ts',
    [
      "import {useState} from 'react';",
      "import {jsx} from 'react/jsx-runtime';",
      "import {createRoot} from 'react-dom/client';",
      "import {insideHelperValue} from './inside';",
      "import {outsideValue} from '../outside';",
      '',
      '// This long explanatory comment must not reach the minified output.',
      'export function useWidget(initialWidgetValue: number) {',
      '  const [currentWidgetValue] = useState(initialWidgetValue);',
      '  return [currentWidgetValue + insideHelperValue() + outsideValue(), jsx, createRoot];',
      '}',
      '',
    ].join('\n'),
  );
  write(
    'src/widget/inside.ts',
    "export const insideHelperValue = () => 'inside-marker';\n",
  );
  write(
    'src/outside.ts',
    "export const outsideValue = () => 'outside-marker';\n",
  );
  write(
    'src/big/big.ts',
    `export const big = ${JSON.stringify(
      Array.from({length: 400}, (_, i) => `row-${i}-${(i * 7919) % 1000}`),
    )};\n`,
  );
});

afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

/** A host that wires an adapter, which uses an engine. */
function writeAdapterFixture() {
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  write(
    'lib/engine/engine.ts',
    "export function windowRange(count: number) {\n  return ['engine-marker', count * 2, count + 7];\n}\n",
  );
  write(
    'lib/adapter/useAdapter.ts',
    [
      "import {useMemo} from 'react';",
      "import {windowRange} from '../engine/engine';",
      'export function useAdapter(rows: string[]) {',
      '  return useMemo(',
      "    () => ({range: windowRange(rows.length), label: 'adapter-marker-' + rows.join('|')}),",
      '    [rows],',
      '  );',
      '}',
      '',
    ].join('\n'),
  );
  write('lib/adapter/index.ts', "export {useAdapter} from './useAdapter';\n");
  write(
    'lib/host/Host.ts',
    [
      "import {useAdapter} from '../adapter';",
      'export function Host(rows: string[]) {',
      '  const plan = useAdapter(rows);',
      "  return ['host-marker', rows.length, plan];",
      '}',
      '',
    ].join('\n'),
  );
}

const adapterEntry = {
  name: 'fixture adapter',
  role: 'adapter',
  host: {entries: ['lib/host/Host.ts'], scope: 'lib'},
  adapter: ['lib/adapter/index.ts', 'lib/adapter/useAdapter.ts'],
  engine: {entries: ['lib/engine/engine.ts'], scope: 'lib/engine'},
};

const widget = {
  name: 'widget adapter',
  entries: ['src/widget/useWidget.ts'],
  scope: 'src/widget',
};
const big = {name: 'big engine', entries: ['src/big/big.ts'], scope: 'src/big'};

describe('measurement', () => {
  it('bundles ESM, minified, with React and outside code external, and gzips at level 9', async () => {
    const {code, minBytes, gzipBytes} = await bundleModule({root, ...widget});
    expect(minBytes).toBe(Buffer.byteLength(code));
    expect(code).not.toContain('long explanatory comment');
    expect(code).not.toContain('currentWidgetValue');
    expect(code).toMatch(/from\s*"react"/);
    expect(code).toMatch(/from\s*"react\/jsx-runtime"/);
    expect(code).toMatch(/from\s*"react-dom\/client"/);
    expect(code).toMatch(/from\s*"\.\.\/outside"/);
    expect(code).toContain('inside-marker');
    expect(code).not.toContain('outside-marker');
    expect(code).toMatch(/export\s*\{/);
    const gzip = execFileSync('gzip', ['-9', '-n', '-c'], {input: code});
    expect(gzipBytes).toBe(gzip.length);
  });
});

describe('adapter measurement', () => {
  it('stubs the adapter out of its host, and the stubbed host keeps no adapter or engine code', async () => {
    writeAdapterFixture();
    const without = await bundleModule({
      root,
      entries: ['lib/host/Host.ts'],
      scope: 'lib',
      stub: adapterEntry.adapter,
    });
    expect(without.code).toContain('host-marker');
    expect(without.code).not.toContain('adapter-marker');
    expect(without.code).not.toContain('engine-marker');
  });

  it('is the host with the adapter, minus the host without it, minus the engine', async () => {
    writeAdapterFixture();
    const result = await measureAdapter({root, ...adapterEntry});
    const host = await bundleModule({root, ...adapterEntry.host});
    const without = await bundleModule({
      root,
      ...adapterEntry.host,
      stub: adapterEntry.adapter,
    });
    const engine = await bundleModule({root, ...adapterEntry.engine});
    expect(result.minBytes).toBe(
      host.minBytes - without.minBytes - engine.minBytes,
    );
    expect(result.gzipBytes).toBe(
      host.gzipBytes - without.gzipBytes - engine.gzipBytes,
    );
    // The difference is about the adapter's own code, bundled alone.
    const alone = await bundleModule({
      root,
      entries: ['lib/adapter/useAdapter.ts'],
      scope: 'lib/adapter',
    });
    expect(Math.abs(result.minBytes - alone.minBytes)).toBeLessThan(80);
  });

  it('checks an adapter against its budget by that difference', async () => {
    writeAdapterFixture();
    const result = await checkBudgets({
      root,
      config: {modules: [{...adapterEntry, budgetBytes: 1}]},
    });
    expect(result.modules[0].role).toBe('adapter');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('fixture adapter');
  });

  it('fails closed on a missing adapter or host path', async () => {
    writeAdapterFixture();
    await expect(
      measureAdapter({root, ...adapterEntry, adapter: ['lib/adapter/gone.ts']}),
    ).rejects.toThrow(/lib\/adapter\/gone\.ts/);
    await expect(
      measureAdapter({
        root,
        ...adapterEntry,
        host: {entries: ['lib/host/Gone.ts'], scope: 'lib'},
      }),
    ).rejects.toThrow(/lib\/host\/Gone\.ts/);
  });
});

describe('budgets', () => {
  it('is silent under budget', async () => {
    const result = await checkBudgets({
      root,
      config: {modules: [{...widget, budgetBytes: 100000, enforce: true}]},
    });
    expect(result.warnings).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.modules[0].over).toBe(false);
  });

  it('warns over budget, naming the module, its size and budget', async () => {
    const result = await checkBudgets({
      root,
      config: {modules: [{...big, budgetBytes: 100}]},
    });
    const [{gzipBytes}] = result.modules;
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('big engine');
    expect(result.warnings[0]).toContain(`${gzipBytes} B`);
    expect(result.warnings[0]).toContain('100 B');
  });

  it('fails over budget when the entry enforces its budget', async () => {
    const result = await checkBudgets({
      root,
      config: {modules: [{...big, budgetBytes: 100, enforce: true}]},
    });
    expect(result.warnings).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('big engine');
  });

  it('fails closed on a missing module path', async () => {
    await expect(
      checkBudgets({
        root,
        config: {
          modules: [
            {...widget, entries: ['src/widget/gone.ts'], budgetBytes: 1},
          ],
        },
      }),
    ).rejects.toThrow(/src\/widget\/gone\.ts/);
    await expect(
      checkBudgets({
        root,
        config: {modules: [{...widget, scope: 'src/nowhere', budgetBytes: 1}]},
      }),
    ).rejects.toThrow(/src\/nowhere/);
  });
});

describe('command line', () => {
  const run = (config, extra = []) => {
    const file = path.join(root, `config-${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify(config));
    return spawnSync(
      process.execPath,
      [SCRIPT, '--config', file, '--root', root, ...extra],
      {encoding: 'utf8'},
    );
  };

  it('prints a GitHub warning and exits 0 when an advisory budget is exceeded', () => {
    const out = run({version: 1, modules: [{...big, budgetBytes: 100}]});
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(
      /::warning title=Module size over budget::big engine/,
    );
  });

  it('exits 1 when an enforced budget is exceeded', () => {
    const out = run({
      version: 1,
      modules: [{...big, budgetBytes: 100, enforce: true}],
    });
    expect(out.status).toBe(1);
    expect(out.stdout).toMatch(
      /::error title=Module size over budget::big engine/,
    );
  });

  it('exits 2 on a missing module path or config', () => {
    expect(
      run({
        version: 1,
        modules: [{...widget, entries: ['nope.ts'], budgetBytes: 1}],
      }).status,
    ).toBe(2);
    const missing = spawnSync(
      process.execPath,
      [SCRIPT, '--config', path.join(root, 'none.json')],
      {encoding: 'utf8'},
    );
    expect(missing.status).toBe(2);
  });
});

describe('committed budgets', () => {
  it('names an engine and adapters that exist, each with a budget and an enforce switch', () => {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(REPO, '.github/module-size-budgets.json'),
        'utf8',
      ),
    );
    expect(config.version).toBe(1);
    const roles = config.modules.map(m => m.role);
    expect(roles).toContain('engine');
    expect(roles).toContain('adapter');
    const exists = file =>
      expect(fs.existsSync(path.join(REPO, file)), file).toBe(true);
    for (const m of config.modules) {
      expect(typeof m.budgetBytes).toBe('number');
      expect(typeof m.enforce).toBe('boolean');
      const parts =
        m.role === 'adapter' ? [m.host, m.engine, {entries: m.adapter}] : [m];
      for (const part of parts) {
        part.entries.forEach(exists);
        if (part.scope) exists(part.scope);
      }
    }
  });
});
