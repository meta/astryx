// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every icon a bundled template or block imports is declared in its
 * descriptor's `icons` with the icon definition it draws, so a project's icon
 * set replaces it (AST-084 FR9). The CLI knows no icon library; only this
 * test names the libraries the bundled templates happen to import, to find
 * their icon imports. No icon is exempt. Two different icons in one template
 * never share a definition: a set draws one icon per definition, so they
 * would draw the same.
 */

import * as fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {requireNatively} from '../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../foundation/discovery/template-adapter.mjs')} */
const {
  discoverCoreTemplates,
} = require('../foundation/discovery/template-adapter.mjs');
/** @type {typeof import('../foundation/discovery/template-icons.mjs')} */
const {
  sharedTemplateMeanings,
  undeclaredTemplateIcons,
} = require('../foundation/discovery/template-icons.mjs');
/** @type {typeof import('../foundation/discovery/icon-definition-discovery.mjs')} */
const {
  astryxDefinitionsByName,
} = require('../foundation/discovery/icon-definition-discovery.mjs');

/** The icon libraries the bundled templates import. */
const ICON_MODULE_RE =
  /^(?:@heroicons\/react\/(?:16|20|24)\/(?:outline|solid)|lucide-react)$/u;

/** @param {string} source @returns {string[]} imported icon names */
function iconImports(source) {
  /** @type {string[]} */
  const names = [];
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gu,
  )) {
    if (!ICON_MODULE_RE.test(match[2])) continue;
    for (const part of match[1].replace(/\/\/[^\n]*/gu, '').split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/u)[0]
        .trim();
      if (name && !name.startsWith('type ')) names.push(name);
    }
  }
  return names;
}

describe('bundled template icon declarations', () => {
  it('declare every imported icon with an Astryx icon definition, and nothing else', async () => {
    const definitions = astryxDefinitionsByName();
    /** @type {string[]} */
    const undeclared = [];
    /** @type {string[]} */
    const problems = [];
    for (const template of await discoverCoreTemplates()) {
      const imported = iconImports(fs.readFileSync(template.filePath, 'utf-8'));
      const declared = template.icons ?? {};
      for (const name of imported) {
        if (Object.hasOwn(declared, name)) continue;
        undeclared.push(`${template.type}/${template.dirName}: ${name}`);
      }
      for (const [name, definition] of Object.entries(declared)) {
        if (!imported.includes(name)) {
          problems.push(
            `${template.type}/${template.dirName} declares ${name}, which it does not import`,
          );
        }
        if (!definitions.has(definition)) {
          problems.push(
            `${template.type}/${template.dirName}: ${name} names "${definition}", which is not an Astryx icon definition`,
          );
        }
      }
    }
    expect(undeclared).toEqual([]);
    expect(problems).toEqual([]);
  }, 60_000);

  it('give two different icons in one template two different definitions', async () => {
    /** @type {string[]} */
    const shared = [];
    for (const template of await discoverCoreTemplates()) {
      for (const {definition, keys} of sharedTemplateMeanings(
        template.icons ?? {},
      )) {
        shared.push(
          `${template.type}/${template.dirName}: ${keys.join(', ')} all declare "${definition}"`,
        );
      }
    }
    expect(shared).toEqual([]);
  }, 60_000);

  it('pass the template_icon_undeclared check that integration check runs', async () => {
    const templates = (await discoverCoreTemplates()).map(template => ({
      id: `${template.type}/${template.dirName}`,
      source: fs.readFileSync(template.filePath, 'utf-8'),
      declared: template.icons ?? {},
    }));
    expect(undeclaredTemplateIcons(templates)).toEqual({
      undeclared: [],
      unchecked: [],
    });
  }, 60_000);
});
