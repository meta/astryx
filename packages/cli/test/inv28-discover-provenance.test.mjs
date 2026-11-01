// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file INV28 provenance test for discover responses. In its own file because
 * the Project.load mock that discover needs would interfere with the theme
 * tests in inv28-package-provenance.test.mjs, which use the real Project.load
 * through runCli.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ACME = '@acme/widgets';

const projectLoadMock = vi.fn();
vi.mock('../foundation/config/project.mjs', async importOriginal => ({
  ...(await importOriginal()),
  Project: {load: (/** @type {unknown[]} */ ...args) => projectLoadMock(...args)},
}));
const {discover} = await import('../api/discover/discover.mjs');

vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

describe('INV28: discover names the package', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-inv28-disc-'));
    const intDir = path.join(tmp, 'node_modules', '@acme', 'widgets');
    const compDir = path.join(intDir, 'components');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({name: 'proj', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmp, 'astryx.config.mjs'),
      `export default {integrations: ['@acme/widgets']};\n`,
    );
    fs.writeFileSync(
      path.join(intDir, 'package.json'),
      JSON.stringify({name: ACME, version: '2.0.0'}),
    );
    fs.writeFileSync(
      path.join(intDir, 'astryx.integration.mjs'),
      `export default {components: './components'};\n`,
    );
    fs.writeFileSync(
      path.join(compDir, 'Widget.doc.mjs'),
      "export default {\n  type: 'component',\n  name: 'Widget',\n" +
        "  usage: {description: 'A widget.'},\n" +
        "  props: [{name: 'size', type: 'number', description: 'Size.'}],\n};\n",
    );
    fs.writeFileSync(
      path.join(compDir, 'Widget.tsx'),
      'export function Widget() { return null; }\n',
    );
    projectLoadMock.mockReset();
    projectLoadMock.mockResolvedValue({
      cwd: tmp,
      integrations: [ACME],
      loadedIntegrations: [
        {
          name: ACME,
          version: '2.0.0',
          components: compDir,
          templates: undefined,
          codemods: undefined,
          __packageDir: intDir,
        },
      ],
    });
  });

  afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
  });

  it('discover.list entries each carry package', async () => {
    const res = /** @type {any} */ (await discover());
    expect(res.type).toBe('discover.list');
    expect(res.package).toBeUndefined();
    expect(res.data.length).toBeGreaterThan(0);
    for (const entry of res.data) {
      expect(entry.package, entry.name).toBe(entry.name);
    }
  });

  it('discover.detail names the package in the envelope', async () => {
    const res = /** @type {any} */ (await discover(ACME));
    expect(res.type).toBe('discover.detail');
    expect(res.package).toBe(ACME);
  });

  it('discover.detail.doc names the package in the envelope', async () => {
    const res = /** @type {any} */ (await discover(`${ACME}/Widget`));
    expect(res.type).toBe('discover.detail.doc');
    expect(res.package).toBe(ACME);
  });

  it('discover.search matches each carry package', async () => {
    const res = /** @type {any} */ (await discover('Widget'));
    expect(res.type).toBe('discover.search');
    expect(res.package).toBeUndefined();
    for (const m of res.data.matches) {
      expect(m.package, m.component).toEqual(expect.any(String));
    }
  });
});
