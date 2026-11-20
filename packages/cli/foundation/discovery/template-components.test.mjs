// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {componentsInSource, parsedComponents} from './template-adapter.mjs';
import {storedKey} from '../doc-compiler/stored-docs.mjs';
import {parsedSpecifiers} from './template-needs.mjs';
import {templateComponentsText} from '../../scripts/generate-template-components.mjs';

// The file is written at `prepack`, so a checkout has none. Its text is read
// here in memory: writing it into the tree would change what other suites,
// running alongside, read.
/** @type {Record<string, string[]>} */
const stored = JSON.parse(templateComponentsText());

describe('stored template component lists', () => {
  it('hold what parsing returns for every shipped template source', () => {
    const dir = path.join(CLI_ROOT, 'assets', 'templates', 'pages');
    let checked = 0;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name, 'page.tsx');
      if (!fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, 'utf-8');
      expect(stored[storedKey(source)], name).toEqual(parsedComponents(source));
      // And the module specifiers it imports, as build's setup notes read them.
      expect(stored[`imports:${storedKey(source)}`], name).toEqual(
        parsedSpecifiers(source),
      );
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
    expect(stored[storedKey(source)]).toEqual(parsedComponents(source));
    expect(componentsInSource(source)).toEqual(parsedComponents(source));
  });

  it('parse a source that is not shipped, such as an integration template', () => {
    const source =
      "import {Card as Panel} from '@astryxdesign/core';\nfunction Local() { return null; }\nexport default () => <Panel><Local /><Badge /></Panel>;\n";
    expect(stored[storedKey(source)]).toBeUndefined();
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
