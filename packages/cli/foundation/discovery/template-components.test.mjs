// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {
  componentsInSource,
  parsedComponents,
  sourceKey,
  TEMPLATE_COMPONENTS_FILE,
} from './template-adapter.mjs';
import {templateComponentsText} from '../../scripts/generate-template-components.mjs';

// The file is written at `prepack`, so a checkout has none: write it for
// these tests (componentsInSource reads it once per process) and remove it.
const written = !fs.existsSync(TEMPLATE_COMPONENTS_FILE);
/** @type {Record<string, string[]>} */
let stored = {};
beforeAll(() => {
  if (written)
    fs.writeFileSync(TEMPLATE_COMPONENTS_FILE, templateComponentsText());
  stored = JSON.parse(fs.readFileSync(TEMPLATE_COMPONENTS_FILE, 'utf-8'));
});
afterAll(() => {
  if (written) fs.rmSync(TEMPLATE_COMPONENTS_FILE, {force: true});
});

describe('stored template component lists', () => {
  it('hold what parsing returns for every shipped template source', () => {
    const dir = path.join(CLI_ROOT, 'assets', 'templates', 'pages');
    let checked = 0;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name, 'page.tsx');
      if (!fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, 'utf-8');
      expect(stored[sourceKey(source)], name).toEqual(parsedComponents(source));
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('answer a shipped source with what parsing it returns', () => {
    const file = path.join(
      CLI_ROOT,
      'assets',
      'templates',
      'pages',
      'settings',
      'page.tsx',
    );
    const source = fs.readFileSync(file, 'utf-8');
    expect(stored[sourceKey(source)]).toEqual(parsedComponents(source));
    expect(componentsInSource(source)).toEqual(parsedComponents(source));
  });

  it('parse a source that is not shipped, such as an integration template', () => {
    const source =
      "import {Card as Panel} from '@astryxdesign/core';\nfunction Local() { return null; }\nexport default () => <Panel><Local /><Badge /></Panel>;\n";
    expect(stored[sourceKey(source)]).toBeUndefined();
    expect(componentsInSource(source)).toEqual(['Badge', 'Card']);
  });

  it('give each caller its own list', () => {
    const file = path.join(
      CLI_ROOT,
      'assets',
      'templates',
      'pages',
      'settings',
      'page.tsx',
    );
    const source = fs.readFileSync(file, 'utf-8');
    componentsInSource(source).push('Changed');
    expect(componentsInSource(source)).toEqual(parsedComponents(source));
  });
});
