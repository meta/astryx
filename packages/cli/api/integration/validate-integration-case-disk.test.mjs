// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A component doc whose file name differs from its source only in
 * letter case, on a case-insensitive disk (macOS, Windows), where discovery
 * still pairs the two: a warning naming the rename, not an error. The disk is
 * simulated by finding the doc's source case-insensitively.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock(
  '../../foundation/discovery/component-discovery.mjs',
  async importOriginal => {
    const original =
      /** @type {typeof import('../../foundation/discovery/component-discovery.mjs')} */ (
        await importOriginal()
      );
    return {
      ...original,
      /** @param {string} docPath */
      integrationSourceForDoc: docPath => {
        const dir = path.dirname(docPath);
        const want = `${path
          .basename(docPath)
          .replace(/\.doc\.(ts|mjs|js)$/u, '')}.tsx`.toLowerCase();
        const found = fs
          .readdirSync(dir)
          .find(name => name.toLowerCase() === want);
        return found ? path.join(dir, found) : null;
      },
    };
  },
);

const {validateIntegration} = await import('./validate-integration.mjs');

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-case-disk-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('a doc whose name differs from its source only in case, on a case-insensitive disk', () => {
  it('lists source_without_component_doc with the rename, without an issue', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {components: './components'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'components'));
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'Acmewidget.doc.mjs'),
      "export default {type: 'component', name: 'AcmeWidget', displayName: 'AcmeWidget', usage: {description: 'A widget.'}, props: []};\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'AcmeWidget.tsx'),
      'export function AcmeWidget() { return null; }\n',
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    expect(data.issues).toEqual([]);
    // The component has no example template; that note is tested elsewhere.
    expect(
      (data.notes ?? []).filter(
        note => note.code !== 'component_without_example',
      ),
    ).toEqual([
      {
        code: 'source_without_component_doc',
        next: true,
        message:
          'Component doc "Acmewidget.doc.mjs" and its source "AcmeWidget.tsx" differ only in letter case. They pair on a case-insensitive disk (macOS, Windows) but not on Linux, where CI and most installs run, so there the component is missing. Fix: rename Acmewidget.doc.mjs to AcmeWidget.doc.mjs.',
      },
    ]);
  });

  it('lists a hidden doc that pairs with its source, without an issue', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {components: './components'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'components'));
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'Acmewidget.doc.mjs'),
      "export default {type: 'component',\n  hidden: true,\n  name: 'AcmeWidget', displayName: 'AcmeWidget', usage: {description: 'A widget.'}, props: []};\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'AcmeWidget.tsx'),
      'export function AcmeWidget() { return null; }\n',
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    expect(data.issues).toEqual([]);
    // The component has no example template; that note is tested elsewhere.
    expect(
      (data.notes ?? []).filter(
        note => note.code !== 'component_without_example',
      ),
    ).toEqual([
      {
        code: 'source_without_component_doc',
        next: true,
        message:
          'Hidden component doc "Acmewidget.doc.mjs" and its source "AcmeWidget.tsx" differ only in letter case. They pair on a case-insensitive disk (macOS, Windows) but not on Linux, where CI and most installs run. Fix: rename Acmewidget.doc.mjs to AcmeWidget.doc.mjs.',
      },
    ]);
  });
});
