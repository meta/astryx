// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {componentsInSource, parsedComponents} from './template-adapter.mjs';
import {storedKey} from '../doc-compiler/stored-docs.mjs';
import {parsedSpecifiers} from './template-needs.mjs';
import {fillTemplatePlaceholders} from './template-placeholders.mjs';
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
    let filledChecked = 0;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name, 'page.tsx');
      if (!fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, 'utf-8');
      expect(stored[storedKey(source)], name).toEqual(parsedComponents(source));
      // And the module specifiers it imports, as build's setup notes read them.
      expect(stored[`imports:${storedKey(source)}`], name).toEqual(
        parsedSpecifiers(source),
      );
      // And those of its filled copy, which build's setup notes read when the
      // template draws icons by meaning.
      const {source: filled} = fillTemplatePlaceholders(source);
      if (filled !== source) {
        expect(stored[`imports:${storedKey(filled)}`], name).toEqual(
          parsedSpecifiers(filled),
        );
        filledChecked++;
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    expect(filledChecked).toBeGreaterThan(0);
  });

  it("hold the imports of each shipped block template's filled copy", () => {
    /** @type {string[]} */
    const files = [];
    const walk = (/** @type {string} */ dir) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith('.tsx')) files.push(file);
      }
    };
    walk(path.join(CLI_ROOT, 'assets', 'templates', 'blocks'));
    let filledChecked = 0;
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const {source: filled} = fillTemplatePlaceholders(source);
      if (filled === source) continue;
      expect(stored[`imports:${storedKey(filled)}`], file).toEqual(
        parsedSpecifiers(filled),
      );
      filledChecked++;
    }
    expect(filledChecked).toBeGreaterThan(0);
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
