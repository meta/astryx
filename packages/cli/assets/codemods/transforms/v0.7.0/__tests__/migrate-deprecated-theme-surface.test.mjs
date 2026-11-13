// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import jscodeshift from 'jscodeshift';
import manifest from '../index.mjs';
import transform, {
  DEPRECATED_THEME_TARGETS,
} from '../migrate-deprecated-theme-surface.mjs';

const j = jscodeshift.withParser('tsx');
const api = {jscodeshift: j, stats: () => {}, report: () => {}};

const IMPORT = "import {defineTheme} from '@astryxdesign/core/theme';\n";

function apply(source, filePath = 'theme.ts') {
  return transform({source, path: filePath}, api) ?? source;
}

/** A proven theme: an object passed to Astryx's imported defineTheme(). */
function defined(components) {
  return `${IMPORT}export default defineTheme({name: 'brand', components: ${components}});`;
}

const THEME_DOC = `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {
  type: 'theme',
  name: 'brand',
  displayName: 'Brand',
  description: 'A brand theme.',
  maintained: false,
};
`;

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/** Write `files` into a fresh directory and return its path. */
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-surface-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const EXPECTED_TARGETS = {
  'base-table': 'table',
  checkbox: 'checkbox-indicator',
  codeblock: 'code-block',
  'codeblock-copy-button': 'code-block-copy-button',
  'codeblock-header': 'code-block-header',
  'codeblock-title': 'code-block-title',
  'date-input-clear-icon': 'input-clear-icon',
  'date-range-input-clear-icon': 'input-clear-icon',
  hovercard: 'hover-card',
  'multi-selector-clear-icon': 'input-clear-icon',
  navicon: 'nav-icon',
  'popover-surface': 'popover',
  progressbar: 'progress-bar',
  'progressbar-fill': 'progress-bar-fill',
  'progressbar-mark': 'progress-bar-mark',
  'progressbar-track': 'progress-bar-track',
  radio: 'radio-indicator',
  'radio-dot': 'radio-indicator-dot',
  'selector-clear-icon': 'input-clear-icon',
  statusdot: 'status-dot',
  textarea: 'text-area',
};

describe('migrate-deprecated-theme-surface', () => {
  it('is staged as a required next-release code codemod', () => {
    const entry = manifest.find(
      candidate => candidate.name === 'migrate-deprecated-theme-surface',
    );
    expect(entry).toBeDefined();
    expect(entry?.optional).not.toBe(true);
    expect(entry?.meta.fileExtensions).toContain('.css');
    expect(entry?.meta.fileExtensions).toContain('.ts');
  });

  it('owns the complete approved 21-target mapping', () => {
    expect(DEPRECATED_THEME_TARGETS).toEqual(EXPECTED_TARGETS);
    expect(Object.keys(DEPRECATED_THEME_TARGETS)).toHaveLength(21);
  });

  it.each(Object.entries(EXPECTED_TARGETS))(
    'renames static target key %s to %s inside a components map',
    (oldKey, newKey) => {
      const output = apply(
        defined(`{${JSON.stringify(oldKey)}: {base: {color: 'red'}}}`),
      );

      expect(output).not.toContain(`${JSON.stringify(oldKey)}:`);
      expect(output).toContain(`'${newKey}':`);
    },
  );

  it('renames root, mode, and adaptation component maps', () => {
    const output = apply(`${IMPORT}const theme = defineTheme({
  components: {progressbar: {base: {color: 'red'}}},
  onDark: {components: {'statusdot': {base: {color: 'white'}}}},
  adaptations: {rules: [{value: {components: {'popover-surface': {base: {padding: 8}}}}}]},
});`);

    expect(output).toContain("'progress-bar':");
    expect(output).toContain("'status-dot':");
    expect(output).toContain("'popover':");
    expect(output).not.toMatch(/(?:progressbar|statusdot|popover-surface)\s*:/);
  });

  it('renames a statically declared components variable used by defineTheme', () => {
    const output =
      apply(`${IMPORT}const components = {textarea: {base: {color: 'red'}}};
export const theme = defineTheme({name: 'brand', components});`);
    expect(output).toContain("'text-area':");
  });

  it('does not rewrite an unrelated object property named components', () => {
    const input = `const registry = {components: {checkbox: Checkbox}};`;
    expect(apply(input)).toBe(input);
  });

  it('does not rewrite a default-exported application component registry', () => {
    for (const input of [
      `export default {components: {checkbox: Checkbox, textarea: TextArea}};`,
      `export default {name: 'app', components: {checkbox: Checkbox}};`,
      `const theme = {components: {checkbox: {base: {color: 'red'}}}};`,
    ]) {
      expect(apply(input)).toBe(input);
    }
  });

  it('does not rewrite a look-alike theme object from another library', () => {
    const input = `export const muiTheme = {
  name: 'brand',
  components: {checkbox: {root: {color: 'red'}}, radio: {root: {}}, textarea: {root: {}}},
};`;
    expect(apply(input, 'src/muiTheme.ts')).toBe(input);
  });

  it('does not take a file-level Astryx import as proof for a look-alike object', () => {
    const input = `import {Button} from '@astryxdesign/core';
export const editorTheme = {name: 'editor', components: {textarea: {root: {}}}};`;
    expect(apply(input, 'src/editorTheme.ts')).toBe(input);
  });

  it('renames a direct theme object in a source its theme descriptor declares', () => {
    const dir = folder({'brandTheme.doc.mjs': THEME_DOC});
    const output = apply(
      `export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};`,
      path.join(dir, 'brandTheme.ts'),
    );
    expect(output).toContain("'nav-icon':");
    expect(output).not.toMatch(/navicon\s*:/);
  });

  it('renames only the declared theme binding in a described theme source', () => {
    const dir = folder({'brandTheme.doc.mjs': THEME_DOC});
    const output = apply(
      `export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};
export const otherLibraryTheme = {
  name: 'other',
  components: {checkbox: {root: {}}, textarea: {root: {}}},
};`,
      path.join(dir, 'brandTheme.ts'),
    );
    expect(output).toContain("'nav-icon':");
    expect(output).toContain(
      'components: {checkbox: {root: {}}, textarea: {root: {}}}',
    );
    expect(output).not.toContain('checkbox-indicator');
    expect(output).not.toContain('text-area');
  });

  it('follows a local binding exported under the descriptor name', () => {
    const dir = folder({'brandTheme.doc.mjs': THEME_DOC});
    const output = apply(
      `const theme = {name: 'brand', components: {navicon: {base: {}}}} as const;
export {theme as brandTheme};`,
      path.join(dir, 'brandTheme.ts'),
    );
    expect(output).toContain("'nav-icon':");
  });

  it('does not treat an unexported or nested same-named object as the declared theme', () => {
    const dir = folder({'brandTheme.doc.mjs': THEME_DOC});
    for (const input of [
      `const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};`,
      `export function make() {
  const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};
  return brandTheme;
}`,
    ]) {
      expect(apply(input, path.join(dir, 'brandTheme.ts'))).toBe(input);
    }
  });

  it('does not treat a descriptor for another stem or kind as theme proof', () => {
    const input = `export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};`;
    const otherStem = folder({'otherTheme.doc.mjs': THEME_DOC});
    expect(apply(input, path.join(otherStem, 'brandTheme.ts'))).toBe(input);
    const otherKind = folder({
      'brandTheme.doc.mjs': 'export default {name: "brand", props: []};\n',
    });
    expect(apply(input, path.join(otherKind, 'brandTheme.ts'))).toBe(input);
  });

  it('does not treat a defineTheme from another library as an Astryx theme', () => {
    const input = `import {defineTheme} from 'other-ui';
export default defineTheme({components: {checkbox: {base: {color: 'red'}}}});`;
    expect(apply(input)).toBe(input);
  });

  it.each([
    [
      'named defineTheme',
      `import {defineTheme} from '@astryxdesign/core';
function unrelated(defineTheme) {
  return defineTheme({name: 'fake', components: {checkbox: {root: {}}}});
}`,
    ],
    [
      'aliased defineTheme',
      `import {defineTheme as makeTheme} from '@astryxdesign/core';
function unrelated() {
  const makeTheme = otherLibrary.createTheme;
  return makeTheme({name: 'fake', components: {checkbox: {root: {}}}});
}`,
    ],
    [
      'namespace defineTheme',
      `import * as Astryx from '@astryxdesign/core';
function unrelated(Astryx) {
  return Astryx.defineTheme({name: 'fake', components: {checkbox: {root: {}}}});
}`,
    ],
  ])('does not treat a shadowed %s as an Astryx call', (_name, input) => {
    expect(apply(input)).toBe(input);
  });

  it.each([
    [
      'an aliased defineTheme import',
      `import {defineTheme as makeTheme} from '@astryxdesign/core';
export default makeTheme({name: 'brand', components: {navicon: {base: {}}}});`,
    ],
    [
      'a namespace defineTheme call',
      `import * as astryx from '@astryxdesign/core/theme';
export default astryx.defineTheme({components: {navicon: {base: {}}}});`,
    ],
    [
      'a satisfies-typed theme object',
      `import type {DefineThemeInput} from '@astryxdesign/core';
export default {components: {navicon: {base: {}}}} satisfies DefineThemeInput;`,
    ],
    [
      'an as-typed theme object',
      `import type {DefineThemeInput} from '@astryxdesign/core';
export default ({components: {navicon: {base: {}}}}) as DefineThemeInput;`,
    ],
    [
      'an annotated theme variable',
      `import type {DefineThemeInput} from '@astryxdesign/core';
const brand: DefineThemeInput = {name: 'brand', components: {navicon: {base: {}}}};`,
    ],
  ])('recognizes %s', (_name, input) => {
    const output = apply(input);
    expect(output).toContain("'nav-icon':");
    expect(output).not.toMatch(/navicon\s*:/);
  });

  it.each([
    [
      'a locally redeclared named type',
      `import type {DefineThemeInput} from '@astryxdesign/core';
function unrelated() {
  type DefineThemeInput = OtherTheme;
  return {name: 'fake', components: {checkbox: {root: {}}}} satisfies DefineThemeInput;
}`,
    ],
    [
      'an aliased type shadowed by a type parameter',
      `import type {DefineThemeInput as Theme} from '@astryxdesign/core';
function unrelated<Theme>(value: unknown) {
  const theme: Theme = {name: 'fake', components: {checkbox: {root: {}}}};
  return theme;
}`,
    ],
    [
      'a namespace shadowed by a type parameter',
      `import type * as Astryx from '@astryxdesign/core';
function unrelated<Astryx>() {
  return {name: 'fake', components: {checkbox: {root: {}}}} satisfies Astryx.DefineThemeInput;
}`,
    ],
    [
      'a namespace shadowed by a local namespace',
      `import * as Astryx from '@astryxdesign/core';
function unrelated() {
  namespace Astryx { export type DefineThemeInput = OtherTheme; }
  return ({name: 'fake', components: {checkbox: {root: {}}}}) as Astryx.DefineThemeInput;
}`,
    ],
  ])('does not treat %s as an Astryx theme type', (_name, input) => {
    expect(apply(input)).toBe(input);
  });

  it('still recognizes an unshadowed theme type inside a function', () => {
    const output =
      apply(`import type {DefineThemeInput} from '@astryxdesign/core';
function makeTheme<T>() {
  return {components: {navicon: {base: {}}}} satisfies DefineThemeInput;
}`);
    expect(output).toContain("'nav-icon':");
  });

  it('renames a clear-icon alias with a TODO naming the owner scope it loses', () => {
    const output = apply(
      defined(`{'selector-clear-icon': {base: {color: 'red'}}}`),
    );
    expect(output).toContain("'input-clear-icon':");
    expect(output).toContain(
      'TODO(astryx upgrade): `selector-clear-icon` became `input-clear-icon`',
    );
    expect(output).toContain(
      '.astryx-input-clear-icon:where(.astryx-selector *)',
    );
  });

  it('flags two clear-icon aliases that collapse onto the shared target', () => {
    const output = apply(
      defined(`{
  'selector-clear-icon': {base: {color: 'red'}},
  'date-input-clear-icon': {base: {color: 'blue'}},
}`),
    );
    expect(output).toContain("'input-clear-icon':");
    expect(output).toContain(
      'merge deprecated theme target `date-input-clear-icon` into `input-clear-icon`',
    );
    expect(output).toContain("'date-input-clear-icon':");
  });

  it('uses lexical scope when a theme components variable shadows a registry', () => {
    const input = `${IMPORT}const components = {checkbox: Checkbox};
function makeTheme() {
  const components = {textarea: {base: {color: 'red'}}};
  return defineTheme({components});
}`;
    const output = apply(input);
    expect(output).toContain('const components = {checkbox: Checkbox};');
    expect(output).toContain("'text-area':");
  });

  it('does not rename matching keys outside a components map or dynamic keys', () => {
    const input = `const labels = {progressbar: 'Progress'};
const oldTarget = 'progressbar';
const theme = {name: 'brand', components: {[oldTarget]: {base: {color: 'red'}}}};`;
    expect(apply(input)).toBe(input);
  });

  it('flags a static old/new collision instead of silently dropping either rule', () => {
    const input = `${IMPORT}const theme = defineTheme({name: 'brand', components: {
  progressbar: {base: {color: 'red'}},
  'progress-bar': {base: {backgroundColor: 'blue'}},
}});`;
    const output = apply(input);
    expect(output).toContain('TODO(astryx upgrade)');
    expect(output).toContain('merge deprecated theme target `progressbar`');
    expect(output).toContain('progressbar:');
    expect(output).toContain("'progress-bar':");
    expect(apply(output)).toBe(output);
  });

  it('renames every removed target class in CSS selectors', () => {
    const input = Object.keys(EXPECTED_TARGETS)
      .map(key => `.astryx-${key} { color: red; }`)
      .join('\n');
    const output = apply(input, 'theme.css');

    for (const [oldKey, newKey] of Object.entries(EXPECTED_TARGETS)) {
      expect(output).not.toMatch(
        new RegExp(
          `\\.astryx-${oldKey.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?![a-z0-9-])`,
        ),
      );
      expect(output).toContain(`.astryx-${newKey}`);
    }
  });

  it('replaces target-qualified bare classes with reflected data selectors', () => {
    const output = apply(
      `.astryx-button.primary.sm:hover { color: red; }
.astryx-heading.level-2 { margin: 0; }
.astryx-switch.checked { opacity: 1; }
.astryx-grid.center { place-content: center; }`,
      'theme.css',
    );

    expect(output).toContain(
      '.astryx-button:is([data-variant="primary"]):is([data-size="sm"]):hover',
    );
    expect(output).toContain('.astryx-heading:is([data-level="2"])');
    expect(output).toContain('.astryx-switch:is([data-checked="checked"])');
    expect(output).toContain(
      '.astryx-grid:is([data-align="center"],[data-justify="center"])',
    );
    expect(output).not.toMatch(
      /\.(?:primary|sm|level-2|checked|center)(?![a-z0-9_-])/,
    );
  });

  it('canonicalizes aliases before emitting data-attribute selectors', () => {
    const output = apply(
      '.astryx-progressbar.success > .astryx-progressbar-mark.fill {}',
      'theme.css',
    );
    expect(output).toContain(
      '.astryx-progress-bar:is([data-variant="success"])',
    );
    expect(output).toContain(
      '.astryx-progress-bar-mark:is([data-placement="fill"])',
    );
    expect(output).not.toContain('astryx-progressbar');
    expect(output).not.toMatch(/\.(?:success|fill)(?![a-z0-9_-])/);
  });

  it('finishes selectors produced by the 0.6 compatibility codemod', () => {
    const output = apply(
      '.astryx-button:is(.primary,[data-variant="primary"]) {}',
      'theme.css',
    );
    expect(output).toContain('.astryx-button:is([data-variant="primary"])');
    expect(output).not.toContain('.primary');
  });

  it('keeps the owner scope of clear-icon aliases in CSS without adding specificity', () => {
    const output = apply(
      `.astryx-selector-clear-icon:hover { color: red; }
.astryx-date-range-input-clear-icon { color: blue; }`,
      'theme.css',
    );
    expect(output).toContain(
      '.astryx-input-clear-icon:where(.astryx-selector *):hover',
    );
    expect(output).toContain(
      '.astryx-input-clear-icon:where(.astryx-date-range-input *)',
    );
    expect(output).not.toMatch(/-clear-icon(?!:where)/);
  });

  it('migrates bare classes that first shipped after 0.5.4', () => {
    const output = apply('.astryx-heading.bold { color: red; }', 'theme.css');
    expect(output).toContain('.astryx-heading:is([data-weight="bold"])');
    expect(output).not.toMatch(/\.bold(?![a-z0-9_-])/);
  });

  it('flags a known bare class that has no 0.6 meaning on its target', () => {
    const input = '.astryx-button.checked { color: red; }';
    const output = apply(input, 'theme.css');
    expect(output).toContain(
      'TODO(astryx upgrade): Astryx 0.7 no longer emits',
    );
    expect(output).toContain('.checked had no known 0.6 meaning');
    expect(output).toContain('.astryx-button.checked');
    expect(apply(output, 'theme.css')).toBe(output);
  });

  it('maps only the column values MetadataList emitted, not app classes', () => {
    const output = apply(
      `.astryx-metadata-list.app-compact-list { gap: 4px; }
.astryx-metadata-list.columns-3, .astryx-metadata-list.multi { gap: 8px; }`,
      'theme.css',
    );
    expect(output).toContain('.astryx-metadata-list.app-compact-list');
    expect(output).not.toContain('data-columns="app-compact-list"');
    expect(output).toContain('.astryx-metadata-list:is([data-columns="3"])');
    expect(output).not.toContain('data-columns="columns-3"');
    expect(output).toContain(
      '.astryx-metadata-list:is([data-columns="multi"])',
    );
  });

  it('leaves unqualified and unknown consumer classes unchanged', () => {
    const input = `.primary { color: red; }
.astryx-button.brand { color: blue; }`;
    expect(apply(input, 'theme.css')).toBe(input);
  });

  it('does not remove a data-selector union from a different selector compound', () => {
    const output = apply(
      '.astryx-button.primary .consumer:is(.primary,[data-custom="x"]) {}',
      'theme.css',
    );
    expect(output).toContain('.astryx-button:is([data-variant="primary"])');
    expect(output).toContain('.consumer:is(.primary,[data-custom="x"])');
  });

  it('never rewrites CSS examples in JavaScript strings', () => {
    const input = `const selector = '.astryx-progressbar.success';`;
    expect(apply(input)).toBe(input);
  });

  it('is byte-idempotent after JavaScript and CSS migration', () => {
    const js = defined(
      `{statusdot: {base: {color: 'red'}}, 'selector-clear-icon': {base: {color: 'red'}}}`,
    );
    const css = '.astryx-textarea.sm {}';
    const jsOnce = apply(js);
    const cssOnce = apply(css, 'theme.css');
    expect(apply(jsOnce)).toBe(jsOnce);
    expect(apply(cssOnce, 'theme.css')).toBe(cssOnce);
  });
});
