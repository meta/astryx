// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` names each setting the browser does not show
 * as written: one a later shorthand of its own block resets, one a more
 * specific rule of the theme it extends beats on a variant, and one whose
 * order against such a rule decides what shows where both hold. Each is a
 * warning at its line with the change that makes it show, and a
 * `settingIssues` entry; the output is the same. A longhand refining the
 * theme's own shorthand, and a state the theme sets on purpose, are not
 * reported.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild, themeBuildFamily} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {settingEffectIssues} from './setting-effects.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-setting-effects-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries(FIXTURE_LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
};

/** @param {string} file */
async function build(file) {
  /** @type {string[]} */
  const lines = [];
  const silent = logger.silent;
  const {warn, log} = logger;
  logger.setSilent(false);
  logger.warn = (/** @type {string} */ l) => lines.push(l);
  logger.log = () => {};
  try {
    const result = /** @type {any} */ (await themeBuild(file, {}, {cwd: dir}));
    return {result, text: lines.join('\n')};
  } finally {
    logger.warn = warn;
    logger.log = log;
    logger.setSilent(silent);
  }
}

const BASE = `import {defineTheme} from '@astryxdesign/core/theme';
export const baseTheme = defineTheme({
  name: 'base',
  components: {
    button: {'variant:primary': {backgroundColor: '#0000ff'}},
  },
});
`;

describe('a setting the browser does not show as written', () => {
  it('is a shorthand reset of its own block, named at its line with the reorder', async () => {
    write(
      'themes/t/t.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 't',
  components: {
    tab: {
      selected: {
        borderTopColor: '#dddddd',
        border: '1px solid transparent',
      },
    },
  },
});
`,
    );
    const {result, text} = await build('themes/t/t.theme.ts');
    const issues = result.data.settingIssues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'hidden',
      part: 'tab',
      key: 'selected',
      property: 'border-top-color',
      path: ['components', 'tab', 'selected', 'borderTopColor'],
      line: 7,
      by: {property: 'border', from: 'theme'},
    });
    expect(issues[0].fix).toBe(
      'write borderTopColor after border in components.tab.selected, or give its value in border',
    );
    expect(text).toContain(
      'components.tab.selected.borderTopColor (#dddddd) never shows',
    );
    expect(result.data.warnings.join('\n')).toContain(
      `Fix: ${issues[0].fix}.`,
    );
    // The output is the same: the build still writes the setting.
    expect(
      fs.readFileSync(path.join(dir, result.data.outputs.css), 'utf8'),
    ).toContain('border-top-color: #dddddd');
    // A check names it too, writing nothing.
    const check = /** @type {any} */ (
      await themeBuild('themes/t/t.theme.ts', {check: true}, {cwd: dir})
    );
    expect(check.data.upToDate).toBe(true);
    expect(check.data.settingIssues).toEqual(issues);
  });

  it('is a plain setting a more specific rule of the extended theme beats on a variant', async () => {
    write('themes/base/base.theme.ts', BASE);
    write(
      'themes/t/t.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/base.theme';
export default defineTheme({
  name: 't',
  extends: baseTheme,
  components: {
    button: {base: {backgroundColor: '#ff0000'}},
  },
});
`,
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'loses',
        part: 'button',
        key: 'base',
        property: 'background-color',
        line: 7,
        by: expect.objectContaining({
          key: 'variant:primary',
          from: 'extended',
        }),
        fix: 'set backgroundColor in components.button["variant:primary"] too: that rule wins there',
      }),
    ]);
  });

  it('is a state whose order against an extended variant decides where both hold', async () => {
    write('themes/base/base.theme.ts', BASE);
    write(
      'themes/t/t.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/base.theme';
export default defineTheme({
  name: 't',
  extends: baseTheme,
  components: {
    button: {base: {':hover': {backgroundColor: '#ff0000'}}},
  },
});
`,
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'collides',
        wins: true,
        state: expect.stringMatching(/^:hover/),
        by: expect.objectContaining({key: 'variant:primary'}),
        fix: expect.stringMatching(
          /^set backgroundColor in components\.button\["variant:primary"\]\[":hover/,
        ),
      }),
    ]);
  });

  it('is not a longhand refining its own shorthand, nor a variant the theme sets on purpose', async () => {
    write(
      'themes/t/t.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 't',
  components: {
    button: {
      base: {
        border: '1px solid #cccccc',
        borderBottomColor: '#bbbbbb',
        background: 'linear-gradient(#ffffff, #e6e6e6)',
        backgroundRepeat: 'no-repeat',
      },
      'variant:primary': {borderColor: '#0000ff'},
    },
  },
});
`,
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([]);
  });

  it("is the theme's own state where its own variant wins on the same element", async () => {
    write(
      'themes/t/t.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 't',
  components: {
    button: {
      base: {':hover': {borderColor: '#999999'}},
      'variant:primary': {borderColor: '#0000ff'},
    },
  },
});
`,
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'collides',
        wins: false,
        property: 'border-color',
        by: expect.objectContaining({key: 'variant:primary', from: 'theme'}),
        fix: 'set borderColor in components.button["variant:primary"][":hover"], so one rule says what shows when both hold',
      }),
    ]);
  });
});

/**
 * A reader of which declarations the theme writes: those of these values.
 * @param {string[]} values
 */
const writes = values => (/** @type {{value: string}} */ at) =>
  values.includes(at.value) ? {path: ['components'], layer: 0} : null;

/**
 * A theme of these part styles, built; its setting issues.
 * @param {string} components - the `components` field, as source
 * @param {string} [head] - lines before the theme (imports)
 * @param {string} [more] - fields after `components`
 */
async function issuesOf(components, head = '', more = '') {
  write(
    'themes/t/t.theme.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';\n${head}export default defineTheme({\n  name: 't',\n  ${more}components: ${components},\n});\n`,
  );
  const {result} = await build('themes/t/t.theme.ts');
  return /** @type {any[]} */ (result.data.settingIssues);
}

describe('the fix each issue names', () => {
  it('clears a shorthand reset: the longhand written after the shorthand shows', async () => {
    expect(
      await issuesOf(
        "{tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}",
      ),
    ).toHaveLength(1);
    expect(
      await issuesOf(
        "{tab: {selected: {border: '1px solid transparent', borderTopColor: '#dddddd'}}}",
      ),
    ).toEqual([]);
  });

  it("clears a plain setting a base theme's variant beats: set on that variant too", async () => {
    write('themes/base/base.theme.ts', BASE);
    const head = "import {baseTheme} from '../base/base.theme';\n";
    const more = 'extends: baseTheme,\n  ';
    expect(
      await issuesOf("{button: {base: {backgroundColor: '#ff0000'}}}", head, more),
    ).toHaveLength(1);
    expect(
      await issuesOf(
        "{button: {base: {backgroundColor: '#ff0000'}, 'variant:primary': {backgroundColor: '#ff0000'}}}",
        head,
        more,
      ),
    ).toEqual([]);
  });

  it('clears a state the order decides: set it where both hold', async () => {
    write('themes/base/base.theme.ts', BASE);
    const head = "import {baseTheme} from '../base/base.theme';\n";
    const more = 'extends: baseTheme,\n  ';
    const [issue] = await issuesOf(
      "{button: {base: {':hover': {backgroundColor: '#ff0000'}}}}",
      head,
      more,
    );
    expect(issue.kind).toBe('collides');
    expect(
      await issuesOf(
        "{button: {base: {':hover': {backgroundColor: '#ff0000'}}, 'variant:primary': {':hover': {backgroundColor: '#ff0000'}}}}",
        head,
        more,
      ),
    ).toEqual([]);
  });
});

describe('the rule that wins', () => {
  it('is the later block of two keys that build one rule, by its value', async () => {
    const issues = await issuesOf(
      "{tab: {selected: {borderTopColor: '#aaaaaa'}, 'selected:selected': {borderTopColor: '#bbbbbb'}}}",
    );
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'hidden',
        value: '#aaaaaa',
        path: ['components', 'tab', 'selected', 'borderTopColor'],
        by: expect.objectContaining({
          value: '#bbbbbb',
          path: ['components', 'tab', 'selected:selected', 'borderTopColor'],
        }),
        fix: 'components.tab["selected:selected"] builds the same rule as components.tab.selected, later, and sets borderTopColor again: write them as one block, with the borderTopColor you want',
      }),
    ]);
  });

  it("is never a pseudo-element's for its element, nor one pseudo-element's for another", async () => {
    expect(
      await issuesOf(
        "{button: {base: {color: 'blue', '::before': {color: 'red'}, '::after': {color: 'green'}}}}",
      ),
    ).toEqual([]);
  });

  it('is named on a --family build, at the member that writes the setting', async () => {
    write(
      'themes/f.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const fTheme = defineTheme({name: 'f', components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}});\nexport default fTheme;\n`,
    );
    write(
      'themes/g.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {fTheme} from './f.mjs';\nexport const gTheme = defineTheme({extends: fTheme, name: 'g'});\nexport default gTheme;\n`,
    );
    const r = /** @type {any} */ (
      await themeBuildFamily(
        ['themes/f.mjs', 'themes/g.mjs'],
        {familyKey: 'fg'},
        {cwd: dir},
      )
    );
    expect(r.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'hidden',
        property: 'border-top-color',
        file: 'themes/f.mjs',
      }),
    ]);
  });
});

describe('where the fix and the line point', () => {
  it("never counts a runtime state's own look against a resting setting", async () => {
    write(
      'themes/base/base.theme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const baseTheme = defineTheme({name: 'base', components: {tab: {selected: {backgroundColor: '#0000ff'}, base: {':hover': {backgroundColor: '#00ff00'}}}}});\n`,
    );
    expect(
      await issuesOf(
        "{tab: {base: {backgroundColor: '#ff0000'}}}",
        "import {baseTheme} from '../base/base.theme';\n",
        'extends: baseTheme,\n  ',
      ),
    ).toEqual([]);
  });

  it('clears a loss of a one-mode setting once the variant sets it in that mode, as its fix says', async () => {
    write('themes/base/base.theme.ts', BASE);
    const head = "import {baseTheme} from '../base/base.theme';\n";
    const more = 'extends: baseTheme,\n  ';
    const [issue] = await issuesOf(
      "{button: {base: {'@light': {backgroundColor: '#ff0000'}}}}",
      head,
      more,
    );
    expect(issue.kind).toBe('loses');
    expect(issue.fix).toBe(
      'set backgroundColor in components.button["variant:primary"]["@light"] too: that rule wins there',
    );
    expect(
      await issuesOf(
        "{button: {base: {'@light': {backgroundColor: '#ff0000'}}, 'variant:primary': {'@light': {backgroundColor: '#ff0000'}}}}",
        head,
        more,
      ),
    ).toEqual([]);
  });

  it('names each of two settings alike but for their color mode or their pseudo-element', async () => {
    const issues = await issuesOf(
      "{tab: {selected: {'@light': {borderTopColor: '#dddddd'}, '@dark': {borderTopColor: '#dddddd'}}, 'selected:selected': {border: '1px solid transparent'}}}",
    );
    expect(issues.map(i => i.path.join('.'))).toEqual(
      expect.arrayContaining([
        'components.tab.selected.@light.borderTopColor',
        'components.tab.selected.@dark.borderTopColor',
      ]),
    );
  });

  it('reads a base theme the same file defines as the theme it extends, not the theme', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const baseTheme = defineTheme({name: 'base', components: {button: {'variant:primary': {backgroundColor: '#0000ff'}}}});",
        'export default defineTheme({',
        "  name: 't',",
        '  extends: baseTheme,',
        "  components: {button: {base: {backgroundColor: '#ff0000'}}},",
        '});',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'loses',
        line: 6,
        by: expect.objectContaining({from: 'extended', key: 'variant:primary'}),
      }),
    ]);
  });

  it("reads a helper's own object as the theme's, never as a theme it extends", async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const withParts = (t: any) => ({...t, components: {...t.components, tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}, button: {...t.components.button, 'variant:primary': {backgroundColor: '#0000ff'}}}});",
        'export default defineTheme(',
        "  withParts({name: 't', components: {button: {base: {backgroundColor: '#ff0000'}}}}),",
        ');',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({kind: 'hidden', part: 'tab', line: 2}),
    ]);
  });

  it('names a setting of a local theme it extends from another file at that file and line', async () => {
    write(
      'themes/base/base.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        'export const baseTheme = defineTheme({',
        "  name: 'base',",
        "  components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}},",
        '});',
        '',
      ].join('\n'),
    );
    const issues = await issuesOf(
      "{button: {base: {color: '#111111'}}}",
      "import {baseTheme} from '../base/base.theme';\n",
      'extends: baseTheme,\n  ',
    );
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'hidden',
        line: 4,
        file: 'themes/base/base.theme.ts',
      }),
    ]);
  });

  it("checks a same-file base theme's own settings, at its line", async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const baseTheme = defineTheme({name: 'base', components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}});",
        "export default defineTheme({name: 't', extends: baseTheme});",
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({kind: 'hidden', line: 2}),
    ]);
  });

  it('reads a theme that spreads a base before its own name as the theme, as the last name wins', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const baseTheme = {name: 'base', components: {}};",
        'export default defineTheme({',
        '  ...baseTheme,',
        "  name: 't',",
        "  components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}},",
        '});',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({kind: 'hidden', line: 6}),
    ]);
  });

  it('finds a same-file base through extends, so a helper that computes the name keeps the theme its own', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const baseTheme = defineTheme({name: 'base', components: {button: {'variant:primary': {backgroundColor: '#0000ff'}}}});",
        'const dark = (t: any) => ({...t, name: `${t.name}-dark`});',
        'export default defineTheme(',
        "  dark({name: 't', extends: baseTheme, components: {button: {base: {backgroundColor: '#ff0000'}}}}),",
        ');',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'loses',
        line: 5,
        by: expect.objectContaining({from: 'extended', key: 'variant:primary'}),
      }),
    ]);
  });

  it('reads a base an extended file defines and extends, at its line in that file', async () => {
    write(
      'themes/base/base.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const coreBase = defineTheme({name: 'core', components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}});",
        "export const baseTheme = defineTheme({name: 'base', extends: coreBase});",
        '',
      ].join('\n'),
    );
    expect(
      await issuesOf(
        "{button: {base: {color: '#111111'}}}",
        "import {baseTheme} from '../base/base.theme';\n",
        'extends: baseTheme,\n  ',
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'hidden',
        line: 2,
        file: 'themes/base/base.theme.ts',
      }),
    ]);
  });

  it('never reads the built theme as a base because another theme of the file extends it', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        "const light = defineTheme({name: 't', components: {tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}}}});",
        "export const dark = defineTheme({name: 't-dark', extends: light, components: {tab: {selected: {color: '#eeeeee'}}}});",
        'export default light;',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({
        kind: 'hidden',
        line: 2,
        by: expect.objectContaining({from: 'theme'}),
      }),
    ]);
  });

  it('keeps the color mode of a one-mode setting in its fix', async () => {
    const [issue] = await issuesOf(
      "{tab: {selected: {'@light': {borderTopColor: '#dddddd'}}, 'selected:selected': {border: '1px solid transparent'}}}",
    );
    expect(issue.fix).toBe(
      'set borderTopColor in components.tab["selected:selected"]["@light"] instead: that rule wins everywhere this one reaches',
    );
  });

  it('reads an :active setting once, as :active, never as the press copy Core writes', async () => {
    write('themes/base/base.theme.ts', BASE);
    const issues = await issuesOf(
      "{button: {base: {':active': {backgroundColor: '#ff0000'}}}}",
      "import {baseTheme} from '../base/base.theme';\n",
      'extends: baseTheme,\n  ',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toBe(
      'set backgroundColor in components.button["variant:primary"][":active"], so one rule says what shows when both hold',
    );
  });

  it('names the line under components, never one of onDark that ends with the same keys', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        'export default defineTheme({',
        "  name: 't',",
        "  onDark: {components: {tab: {selected: {borderTopColor: '#111111'}}}},",
        '  components: {',
        "    tab: {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}},",
        '  },',
        '});',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({kind: 'hidden', value: '#dddddd', line: 6}),
    ]);
  });

  it('follows components given through a call, a const of the module or a spread', async () => {
    write(
      'themes/t/t.theme.ts',
      [
        "import {defineTheme} from '@astryxdesign/core/theme';",
        'const withFill = <T,>(parts: T): T => parts;',
        "const tab = {selected: {borderTopColor: '#dddddd', border: '1px solid transparent'}};",
        'export default defineTheme({',
        "  name: 't',",
        '  components: withFill({...{tab}}),',
        '});',
        '',
      ].join('\n'),
    );
    const {result} = await build('themes/t/t.theme.ts');
    expect(result.data.settingIssues).toEqual([
      expect.objectContaining({kind: 'hidden', value: '#dddddd', line: 3}),
    ]);
  });
});

describe('the rule reader', () => {
  it('reads a gradient shorthand after its own repeat as hiding the repeat', () => {
    const own = [
      '  .astryx-button:hover { background-repeat: repeat-x; background: linear-gradient(#fff, #eee); }',
    ];
    expect(
      settingEffectIssues(own, writes(['repeat-x', 'linear-gradient(#fff, #eee)'])).map(
        i => [i.property, i.kind, i.by.property],
      ),
    ).toEqual([['background-repeat', 'hidden', 'background']]);
  });

  it('never compares rules of the two color modes', () => {
    const own = [
      '  :is(.astryx-card):where(:scope[data-theme="dark"] *) { background-color: blue; }',
    ];
    const extended = [
      '  :is(.astryx-card):where(:scope[data-theme="light"] *) { background-color: green; }',
    ];
    expect(settingEffectIssues([...extended, ...own], writes(['blue']))).toEqual(
      [],
    );
  });

  it('compares a color-mode rule with a rule of no mode', () => {
    const extended = [
      '  :is(.astryx-card):where(:scope[data-theme="dark"] *) { background-color: blue; }',
    ];
    const own = ['  .astryx-card { background-color: red; }'];
    expect(
      settingEffectIssues([...own, ...extended], writes(['red'])).map(i => [
        i.value,
        i.kind,
        i.by.value,
      ]),
    ).toEqual([['red', 'loses', 'blue']]);
  });

  it("never reports Core's private variables, its own plumbing", () => {
    const own = [
      '  .astryx-card { --astryx-card-padding-block: initial; --astryx-card-padding-block: 30px; }',
    ];
    expect(settingEffectIssues(own, writes(['initial', '30px']))).toEqual([]);
  });

  it("keeps a hover rule apart from a disabled one by Core's hover guard", () => {
    const extended = [
      '  .astryx-button:is(:disabled,[aria-disabled="true"]) { color: gray; }',
    ];
    const own = [
      '  .astryx-button:hover:where(:not(:disabled,[aria-disabled="true"])) { color: red; }',
    ];
    expect(settingEffectIssues([...extended, ...own], writes(['red']))).toEqual(
      [],
    );
  });
});
