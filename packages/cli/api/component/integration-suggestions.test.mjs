// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The suggestions for an unknown component name in a project with an
 * integration: integration components are matched by the same rule as Core
 * components, and only Core components resolve by a close match.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./component.mjs')} */
const {component} = require('./component.mjs');

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/**
 * Write an integration component: its doc and its same-stem source.
 * @param {string} dir
 * @param {string} name
 * @param {Record<string, unknown>} fields
 */
function writeComponent(dir, name, fields) {
  fs.writeFileSync(
    path.join(dir, `${name}.doc.mjs`),
    `export default ${JSON.stringify({type: 'component', name, props: [], ...fields}, null, 2)};\n`,
  );
  fs.writeFileSync(
    path.join(dir, `${name}.tsx`),
    `export function ${name}() { return null; }\n`,
  );
}

function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  const components = path.join(pkgDir, 'components');
  fs.mkdirSync(components, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  writeComponent(components, 'ZorbletCard', {
    keywords: ['quandle'],
    usage: {description: 'A card for one zorblet.'},
  });
  writeComponent(components, 'ZorbletField', {
    keywords: ['text input', 'number'],
  });
  writeComponent(components, 'ZorbletCopier', {
    keywords: ['copy button'],
  });
  writeComponent(components, 'ZorbletWarden', {
    keywords: ['focus-trap'],
  });
  writeComponent(components, 'AcmeGadgetPanel', {
    usage: {description: 'A panel of gadgets.'},
  });
}

/**
 * The names suggested for `name`, which must name no component.
 * @param {string} name
 * @returns {Promise<string[]>}
 */
async function suggested(name) {
  const error = await component(name, {cwd: tmpDir}).catch(e => e);
  expect(error?.code).toBe('ERR_UNKNOWN_COMPONENT');
  return (error.suggestions ?? []).map(
    (/** @type {{name: string}} */ s) => s.name,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(REPO_ROOT, '.astryx-component-integration-suggestions-'),
  );
  scaffold();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('suggestions for an unknown component name', () => {
  it(
    'suggest an integration component first for a typo of its name, and every suggestion reads',
    async () => {
      for (const typo of ['ZorbletCrd', 'ZorbeltCard', 'ZorbletCardd']) {
        const names = await suggested(typo);
        expect(names[0]).toBe('ZorbletCard');
        expect(names.length).toBeLessThanOrEqual(5);
        for (const name of names) {
          const read = /** @type {any} */ (
            await component(name, {cwd: tmpDir})
          );
          expect(read.type).toBe('component.detail');
        }
      }
    },
    SLOW,
  );

  it(
    "suggest an integration component for its name without the package's prefix",
    async () => {
      expect((await suggested('GadgetPanel'))[0]).toBe('AcmeGadgetPanel');
    },
    SLOW,
  );

  it(
    "match an integration doc's keywords, but resolve only a Core component",
    async () => {
      expect(await suggested('quandle')).toContain('ZorbletCard');
    },
    SLOW,
  );

  it(
    "keep the Core component first for a slip of its name typed as words, above an integration doc's keyword",
    async () => {
      for (const typo of ['text inptu', 'text-inpu', 'Text Inputt']) {
        expect((await suggested(typo))[0]).toBe('TextInput');
      }
      expect((await suggested('number-inpu'))[0]).toBe('NumberInput');
    },
    SLOW,
  );

  it(
    'place a hook keyword hint after an integration component that declares the same keyword',
    async () => {
      const names = await suggested('copy button');
      const component = names.indexOf('ZorbletCopier');
      const hook = names.findIndex(n => n.startsWith('astryx hook '));
      expect(component).toBeGreaterThanOrEqual(0);
      expect(hook).toBeGreaterThan(component);
    },
    SLOW,
  );

  it(
    'keep an integration component that declares the typed name ahead of a folded hook hint',
    async () => {
      const names = await suggested('FocusTrap');
      const component = names.indexOf('ZorbletWarden');
      const hook = names.indexOf('astryx hook useFocusTrap');
      expect(component).toBeGreaterThanOrEqual(0);
      expect(hook === -1 || hook > component).toBe(true);
    },
    SLOW,
  );

  it(
    'lead with the Core components that declare the typed name, not a folded hook hint',
    async () => {
      const names = await suggested('Combobox');
      expect(names[0]).toBe('Typeahead');
      expect(names).not.toContain('astryx hook useCombobox');
    },
    SLOW,
  );

  it(
    'keep the Core component first for a typo of a Core name',
    async () => {
      expect((await suggested('Buton'))[0]).toBe('Button');
    },
    SLOW,
  );
});
