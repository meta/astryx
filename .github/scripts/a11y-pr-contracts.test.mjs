// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the PR browser accessibility spec runner.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  auditArgs,
  auditedComponents,
  auditPlan,
  CHANGED_SPEC_BUDGET_MS,
  CHANGED_SPEC_LIMIT,
  changedOnly,
  changedSinceMergeBase,
  kebab,
  planFor,
  parseRouting,
  IGNORED_RECORD_SEGMENTS,
  isKnowledgeRecord,
  selectSpecs,
  specOwners,
  withinBudget,
} from './a11y-pr-contracts.mjs';
import {
  A11Y_SPEC_GLOBS,
  WEBKIT_A11Y_SPEC_GLOBS,
  isA11ySpecFile,
} from './lib/a11y-spec-files.mjs';

const root = path.resolve(import.meta.dirname, '../..');

const spec = (file, lines = []) => ({
  file,
  routing: parseRouting(['// Copyright', ...lines, ''].join('\n')),
});

const pr = (specs, overrides = {}) =>
  selectSpecs({
    specs,
    isPullRequest: true,
    changedPaths: [],
    components: [],
    title: '',
    ...overrides,
  }).map(({file}) => file);

const BINDING =
  'packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts';

// spec:AST-030 FR12: the default touched-components check runs the browser
// specs a pull request adds or modifies, and only those.
describe('changedOnly (the default check runs changed specs)', () => {
  const NEW_SPEC =
    'packages/core/src/Radio/__tests__/RadioKeyboard.a11y.chromium.spec.ts';
  const ALWAYS =
    'packages/core/src/__tests__/DisabledFocus.a11y.chromium.spec.ts';
  const RELEASE =
    'packages/core/src/Table/__tests__/TableFull.a11y.chromium.spec.ts';
  const AUDIT =
    'packages/core/src/Drawer/__tests__/DrawerAudit.a11y.chromium.spec.ts';
  const specs = [
    spec(NEW_SPEC),
    spec(ALWAYS, ['// @pr-a11y always']),
    spec(RELEASE, ['// @pr-a11y release-only']),
    spec(AUDIT, ['// @pr-a11y audit Drawer']),
    spec(BINDING),
  ];
  const run = changed =>
    changedOnly(
      selectSpecs({
        specs,
        isPullRequest: true,
        changedPaths: changed,
        components: [],
        title: '',
      }),
      changed,
    );

  it('selects a spec the pull request adds, which no label-free run reached before', () => {
    expect(run([NEW_SPEC])).toEqual([{file: NEW_SPEC, reason: 'spec changed'}]);
  });

  it('runs a changed always-spec too, but never an unchanged one', () => {
    expect(run([NEW_SPEC]).map(({file}) => file)).not.toContain(ALWAYS);
    expect(run([ALWAYS])).toEqual([{file: ALWAYS, reason: 'spec changed'}]);
  });

  it('leaves a changed release-only spec to the release check', () => {
    expect(run([RELEASE])).toEqual([]);
  });

  it('stops the changed-only run at eight minutes, inside the job budget', () => {
    expect(CHANGED_SPEC_LIMIT).toBe(4);
    expect(CHANGED_SPEC_BUDGET_MS).toBe(8 * 60 * 1000);
    const runner = fs.readFileSync(
      path.join(root, '.github/scripts/a11y-pr-contracts.mjs'),
      'utf8',
    );
    // Only the changed-only run carries the global timeout.
    expect(runner).toMatch(
      /changedOnlyFile != null\s*\?\s*\['--global-timeout', String\(CHANGED_SPEC_BUDGET_MS\)\]\s*:\s*\[\]/,
    );
  });

  it('leaves a changed audit spec to its own component-audit pull request', () => {
    expect(run([AUDIT])).toEqual([]);
  });

  it('runs at most the budget of files, in path order, and reports the rest as not run', () => {
    const files = Array.from(
      {length: CHANGED_SPEC_LIMIT + 2},
      (_, i) => `packages/core/src/C${i}/__tests__/C${i}.a11y.chromium.spec.ts`,
    );
    const {run: ran, notRun} = withinBudget(
      [...files].reverse().map(file => ({file, reason: 'spec changed'})),
    );
    expect(ran.map(({file}) => file)).toEqual(
      [...files].sort().slice(0, CHANGED_SPEC_LIMIT),
    );
    expect(notRun).toHaveLength(2);
    expect(notRun[0].reason).toContain('ci:run-a11y');
  });

  it('widens to nothing else: a changed component folder selects no spec', () => {
    expect(run(['packages/core/src/Chat/ChatSendButton.tsx'])).toEqual([]);
  });
});

describe('a11y-spec-files (one spec list for Playwright and the touched check)', () => {
  it('is the list playwright.config.ts runs', () => {
    const config = fs.readFileSync(
      path.join(root, 'playwright.config.ts'),
      'utf8',
    );
    expect(config).toContain('testMatch: [...A11Y_SPEC_GLOBS]');
    expect(config).toContain('testMatch: [...WEBKIT_A11Y_SPEC_GLOBS]');
    expect(A11Y_SPEC_GLOBS).toEqual(
      expect.arrayContaining([...WEBKIT_A11Y_SPEC_GLOBS]),
    );
  });

  it('matches each kind of browser accessibility spec and nothing else', () => {
    expect(isA11ySpecFile(BINDING)).toBe(true);
    expect(
      isA11ySpecFile(
        'packages/core/src/Dialog/DialogSecondDocument.a11y.browser.spec.ts',
      ),
    ).toBe(true);
    expect(
      isA11ySpecFile('internal/a11y-spec/src/patterns/menu.chromium.spec.ts'),
    ).toBe(true);
    expect(isA11ySpecFile('packages/core/src/Chat/ChatSendButton.tsx')).toBe(
      false,
    );
    expect(
      isA11ySpecFile(
        'packages/core/src/Chat/__tests__/ChatSendButton.a11y.test.tsx',
      ),
    ).toBe(false);
    expect(
      isA11ySpecFile(
        'internal/interaction-harness/src/harness.interaction.browser.spec.ts',
      ),
    ).toBe(false);
  });
});

describe('parseRouting', () => {
  it('defaults to scoped with no tokens', () => {
    expect(parseRouting('// Copyright\nimport x;\n')).toEqual({
      mode: 'scoped',
      scope: [],
      audits: [],
    });
  });

  it('reads line and block comment forms', () => {
    expect(parseRouting('// @pr-a11y always\n').mode).toBe('always');
    expect(parseRouting(' * @pr-a11y release-only\n').mode).toBe(
      'release-only',
    );
    expect(
      parseRouting('// @pr-a11y audit CheckboxList, CheckboxListItem\n'),
    ).toEqual({
      mode: 'audit',
      scope: [],
      audits: ['CheckboxList', 'CheckboxListItem'],
    });
    expect(
      parseRouting('// @pr-a11y scope core/Selector richtext/* ^apps/x\n')
        .scope,
    ).toEqual(['core/Selector', 'richtext/*', '^apps/x']);
  });

  it.each([
    ['an unknown key', '// @pr-a11y sometimes'],
    ['two modes', '// @pr-a11y always\n// @pr-a11y release-only'],
    ['an empty scope', '// @pr-a11y scope'],
    ['a bare word scope token', '// @pr-a11y scope Selector'],
    ['an invalid regular expression', '// @pr-a11y scope ^(oops'],
    ['an audit without names', '// @pr-a11y audit'],
    ['a value on always', '// @pr-a11y always yes'],
  ])('rejects %s', (_, source) => {
    expect(() => parseRouting(source)).toThrow();
  });
});

describe('specOwners', () => {
  it('owns a binding by its folder and its own name', () => {
    expect(specOwners(BINDING)).toEqual({
      prefixes: ['packages/core/src/Chat/'],
      components: ['core/Chat', 'core/ChatSendButton'],
    });
  });

  it('strips an Audit suffix from the named component', () => {
    expect(
      specOwners(
        'packages/core/src/Drawer/__tests__/DrawerHeaderAudit.a11y.chromium.spec.ts',
      ).components,
    ).toContain('core/DrawerHeader');
  });

  it('gives a package-level spec no folder', () => {
    expect(
      specOwners('packages/core/src/__tests__/CardPress.a11y.chromium.spec.ts'),
    ).toEqual({prefixes: [], components: ['core/CardPress']});
  });

  it('owns an a11y-spec pattern by its own stem', () => {
    expect(
      specOwners(
        'internal/a11y-spec/src/patterns/toggle-button.chromium.spec.ts',
      ).prefixes,
    ).toEqual(['internal/a11y-spec/src/patterns/toggle-button.']);
  });

  it("does not let one pattern's stem claim another's files", () => {
    const menu = spec('internal/a11y-spec/src/patterns/menu.chromium.spec.ts');
    expect(
      pr([menu], {
        changedPaths: ['internal/a11y-spec/src/patterns/menu-button.ts'],
      }),
    ).toEqual([]);
    expect(
      pr([menu], {
        changedPaths: ['internal/a11y-spec/src/patterns/menu.fixtures.ts'],
      }),
    ).toEqual([menu.file]);
  });
});

describe('selectSpecs', () => {
  const always = spec('packages/core/src/__tests__/A.a11y.chromium.spec.ts', [
    '// @pr-a11y always',
  ]);
  const scoped = spec(BINDING);
  const audit = spec(
    'packages/core/src/Chat/__tests__/ChatMessageList.a11y.chromium.spec.ts',
    ['// @pr-a11y audit ChatMessageList'],
  );
  const releaseOnly = spec(
    'packages/core/src/Chat/__tests__/ChatLayout.a11y.chromium.spec.ts',
    ['// @pr-a11y release-only'],
  );
  const tokens = spec(
    'internal/a11y-spec/src/patterns/combobox.chromium.spec.ts',
    [
      '// @pr-a11y scope core/Selector richtext/* ^apps/storybook/stories/Combo',
    ],
  );
  const all = [always, scoped, audit, releaseOnly, tokens];

  it('runs only always-on specs when nothing is in scope', () => {
    expect(pr(all)).toEqual([always.file]);
  });

  it('runs only always-on specs outside a pull request', () => {
    expect(
      pr(all, {
        isPullRequest: false,
        changedPaths: null,
        title: '[Component Audit] ChatMessageList: x',
      }),
    ).toEqual([always.file]);
  });

  it('runs a scoped spec when its folder changes', () => {
    expect(
      pr(all, {changedPaths: ['packages/core/src/Chat/ChatLayout.tsx']}),
    ).toEqual([always.file, scoped.file]);
  });

  it('does not run a scoped spec for a sibling folder sharing its prefix', () => {
    expect(
      pr(all, {changedPaths: ['packages/core/src/ChatFoo/x.tsx']}),
    ).toEqual([always.file]);
  });

  it('runs a scoped spec when it changes itself', () => {
    expect(pr([scoped], {changedPaths: [scoped.file]})).toEqual([scoped.file]);
  });

  it('runs a scoped spec for its named component in scope', () => {
    expect(pr([scoped], {components: ['core/ChatSendButton']})).toEqual([
      scoped.file,
    ]);
    expect(pr([scoped], {components: ['core/ChatSendButtons']})).toEqual([]);
  });

  it('honours component, wildcard, and path scope tokens', () => {
    expect(pr([tokens], {components: ['core/Selector']})).toEqual([
      tokens.file,
    ]);
    expect(pr([tokens], {components: ['richtext/RichTextEditor']})).toEqual([
      tokens.file,
    ]);
    expect(
      pr([tokens], {changedPaths: ['apps/storybook/stories/ComboboxA11y.tsx']}),
    ).toEqual([tokens.file]);
    expect(pr([tokens], {components: ['core/MultiSelector']})).toEqual([]);
    expect(
      pr([tokens], {changedPaths: ['x/apps/storybook/stories/Combo.tsx']}),
    ).toEqual([]);
  });

  it('runs no spec for a changed knowledge record alone', () => {
    const record = 'docs/specs/components/Chat/ChatLayout.spec.md';
    expect(pr(all, {changedPaths: [record]})).toEqual([always.file]);
    const pattern = spec(
      'internal/a11y-spec/src/patterns/accordion.chromium.spec.ts',
      ['// @pr-a11y scope ^packages/core/src/Collapsible/'],
    );
    expect(
      pr([pattern], {
        changedPaths: ['docs/specs/components/Collapsible/Collapsible.spec.md'],
      }),
    ).toEqual([]);
    // Code beside the record still selects the spec.
    expect(
      pr(all, {
        changedPaths: [record, 'packages/core/src/Chat/ChatLayout.tsx'],
      }),
    ).toEqual([always.file, scoped.file]);
  });

  it('still runs a spec for a fixture, test, or generated .spec.md', () => {
    for (const file of [
      'packages/core/src/Chat/__fixtures__/ChatLayout.spec.md',
      'packages/core/src/Chat/__tests__/ChatLayout.spec.md',
      'packages/core/src/Chat/ChatLayout.generated.spec.md',
    ]) {
      expect(pr(all, {changedPaths: [file]}), file).toEqual([
        always.file,
        scoped.file,
      ]);
    }
  });

  it('runs every scoped spec when the changed files are unknown', () => {
    expect(pr(all, {changedPaths: null})).toEqual([
      always.file,
      scoped.file,
      tokens.file,
    ]);
  });

  it('runs an audit spec only for its audit title', () => {
    expect(
      pr([audit], {
        changedPaths: [audit.file],
        components: ['core/ChatMessageList'],
      }),
    ).toEqual([]);
    expect(
      pr([audit], {title: '[Component Audit] ChatMessageList: fix'}),
    ).toEqual([audit.file]);
    expect(
      pr([audit], {title: '[Component Audit] ChatMessageLists: fix'}),
    ).toEqual([]);
    expect(
      pr([audit], {title: 'fix: [Component Audit] ChatMessageList:'}),
    ).toEqual([]);
    // GitHub's startsWith, which the per-audit steps used, ignores case.
    expect(
      pr([audit], {title: '[component audit] chatmessagelist: fix'}),
    ).toEqual([audit.file]);
  });

  it('never runs a release-only spec on a pull request', () => {
    expect(
      pr([releaseOnly], {
        changedPaths: null,
        components: ['core/ChatLayout'],
      }),
    ).toEqual([]);
  });

  it('names the reason for every selection', () => {
    const [selected] = selectSpecs({
      specs: [scoped],
      isPullRequest: true,
      changedPaths: ['packages/core/src/Chat/Chat.tsx'],
      components: [],
      title: '',
    });
    expect(selected.reason).toBe('changed packages/core/src/Chat/Chat.tsx');
  });
});

describe('auditedComponents', () => {
  it('reads the audited component from a component-audit title', () => {
    expect(
      auditedComponents('[Component Audit] DateInput: busy fields'),
    ).toEqual(['DateInput']);
    expect(auditedComponents('fix(DateInput): busy')).toEqual([]);
  });
});

describe('component audit axe pass', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, '.github/a11y-audit-axe.json'), 'utf8'),
  );

  it('kebab-cases component names', () => {
    expect(kebab('DropdownMenuRadioGroup')).toBe('dropdown-menu-radio-group');
    expect(kebab('Drawer')).toBe('drawer');
  });

  it('audits the named component by default and requires its receipts', () => {
    const plan = auditPlan('CommandPaletteFooter', {});
    expect(plan).toEqual({
      components: ['CommandPaletteFooter'],
      stories: [],
      readySelector: null,
      env: {},
      reportFile: 'pr-a11y-evidence/command-palette-footer-a11y-report.json',
      evidence: 'command-palette-footer-audit-evidence',
    });
    expect(auditArgs(plan)).toEqual([
      '.github/scripts/accessibility-audit.js',
      '--storybook-dir',
      'apps/storybook/dist',
      '--output',
      'pr-a11y-evidence/command-palette-footer-a11y-report.json',
      '--components',
      'CommandPaletteFooter',
      '--baseline',
      '.github/a11y-baseline.json',
      '--fail-on-new',
    ]);
  });

  // The open dialog or menu is the state these audits grade; without the
  // readiness wait, axe would scan the trigger's first frame.
  it.each([
    ['DateInput', '[role="dialog"]', ['core-dateinput--open-calendar-audit']],
    ['ContextMenuItem', '[role="menu"]', []],
    ['DropdownMenuGroup', '[role="menu"]', []],
    ['DropdownMenuDivider', '[role="menu"]', []],
    ['DropdownMenuItem', '[role="menu"]', []],
  ])(
    'holds the %s audit until its open state is ready',
    (name, ready, stories) => {
      const args = auditArgs(auditPlan(name, config));
      expect(args[args.indexOf('--ready-selector') + 1]).toBe(ready);
      if (stories.length) {
        expect(args[args.indexOf('--stories') + 1]).toBe(stories.join(','));
      }
    },
  );

  it('keeps the audits that differ from the default', () => {
    expect(auditPlan('CheckboxListItem', config).components).toEqual([
      'CheckboxList',
      'CheckboxListItem',
    ]);
    expect(auditPlan('ChatTokenizedText', config).env).toEqual({
      ASTRYX_AUDIT_BASELINE_HEAD: 'a7c6c7ecdf6b422df331124e8f6fc6d33cf1bd63',
    });
    expect(auditPlan('DropdownMenuSubMenu', config).evidence).toBe(
      'dropdown-menu-submenu-audit-evidence',
    );
    expect(auditPlan('ContextMenuItem', config).evidence).toBeNull();
  });

  it('plans an axe pass only for a configured or spec-named audit', () => {
    const named = [
      spec(
        'packages/core/src/Drawer/__tests__/DrawerAudit.a11y.chromium.spec.ts',
        ['// @pr-a11y audit Drawer'],
      ),
    ];
    expect(planFor('Drawer', named, {})?.components).toEqual(['Drawer']);
    expect(planFor('ContextMenuItem', [], config)?.readySelector).toBe(
      '[role="menu"]',
    );
    // A name with no audit spec and no entry may have no owned Storybook
    // route; axe would refuse it and fail the job.
    expect(planFor('DialogHeader', named, config)).toBeNull();
    // A title in another case resolves to the configured name.
    expect(planFor('dateinput', [], config)?.readySelector).toBe(
      '[role="dialog"]',
    );
    expect(planFor('drawer', named, {})?.components).toEqual(['Drawer']);
    expect(planFor(undefined, named, config)).toBeNull();
  });

  it('rejects an unknown key', () => {
    expect(() => auditPlan('X', {X: {readyselector: 'a'}})).toThrow();
  });

  it('names only components that have an audit route', () => {
    for (const name of Object.keys(config).filter(key => key !== '$comment')) {
      expect(() => auditPlan(name, config), name).not.toThrow();
      expect(name).toMatch(/^[A-Z]\w*$/);
    }
  });
});

describe('changedSinceMergeBase', () => {
  const git = (cwd, ...args) =>
    execFileSync('git', args, {cwd, encoding: 'utf8', stdio: 'pipe'}).trim();
  const commit = (cwd, file, text) => {
    fs.writeFileSync(path.join(cwd, file), text);
    git(cwd, 'add', file);
    git(
      cwd,
      '-c',
      'user.email=a@b',
      '-c',
      'user.name=a',
      'commit',
      '-qm',
      text,
    );
  };

  // An origin whose main has three commits, and a full clone whose feature
  // branch adds one file; main then moves on. Built once: each lookup below
  // gets its own test budget, since every git call is a process of its own.
  const cwd = process.cwd();
  let dir = '';
  let clone = '';
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pr-a11y-'));
    const origin = path.join(dir, 'origin');
    fs.mkdirSync(origin);
    git(origin, 'init', '-q', '-b', 'main');
    for (const n of ['1', '2', '3']) commit(origin, 'base.txt', n);
    clone = path.join(dir, 'clone');
    git(dir, 'clone', '-q', origin, clone);
    git(clone, 'checkout', '-qb', 'feature');
    commit(clone, 'feature.txt', 'f');
    git(clone, 'push', '-q', 'origin', 'feature');
    commit(origin, 'later.txt', 'l');
  });
  afterAll(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });
  beforeEach(() => {
    process.chdir(clone);
  });
  afterEach(() => {
    process.chdir(cwd);
  });

  it("lists the branch's own changes against a local base", () => {
    expect(changedSinceMergeBase('main')).toEqual(['feature.txt']);
  });

  it('lists them against the remote base, and never makes a full clone shallow', () => {
    expect(changedSinceMergeBase('origin/main')).toEqual(['feature.txt']);
    expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('false');
  });

  it('lists nothing for a base it cannot find, or no base', () => {
    expect(changedSinceMergeBase('no-such-ref')).toBeNull();
    expect(changedSinceMergeBase(undefined)).toBeNull();
  });
});

describe('repository specs', () => {
  // Every file the playwright.config.ts globs match, found by walking the
  // same roots (git pathspec `**` misses files directly under src/).
  const walk = dir =>
    fs
      .readdirSync(path.join(root, dir), {withFileTypes: true})
      .flatMap(entry => {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          return ['node_modules', 'dist'].includes(entry.name)
            ? []
            : walk(relative);
        }
        return [relative];
      });
  const packageRoots = fs
    .readdirSync(path.join(root, 'packages'))
    .map(name => `packages/${name}/src`)
    .filter(dir => fs.existsSync(path.join(root, dir)));
  const files = [
    ...walk('internal/a11y-spec/src').filter(f =>
      f.endsWith('.chromium.spec.ts'),
    ),
    ...packageRoots
      .flatMap(walk)
      .filter(f => /\.a11y\.(chromium|browser)\.spec\.ts$/.test(f)),
  ];

  it('matches the globs playwright.config.ts collects', () => {
    const config = fs.readFileSync(
      path.join(root, 'playwright.config.ts'),
      'utf8',
    );
    expect(config).toContain('testMatch: [...A11Y_SPEC_GLOBS]');
    for (const glob of [
      'internal/a11y-spec/src/**/*.chromium.spec.ts',
      'packages/*/src/**/*.a11y.chromium.spec.ts',
      'packages/*/src/**/*.a11y.browser.spec.ts',
    ]) {
      expect(A11Y_SPEC_GLOBS).toContain(glob);
    }
    expect(files.length).toBeGreaterThan(100);
  });

  it('gives every spec valid routing lines', () => {
    for (const file of files) {
      expect(
        () => parseRouting(fs.readFileSync(path.join(root, file), 'utf8')),
        file,
      ).not.toThrow();
    }
  });
});

describe('isKnowledgeRecord', () => {
  it('skips the same folders as the knowledge record discovery', async () => {
    const {IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS} =
      await import('./knowledge-paths.cjs');
    expect([...IGNORED_RECORD_SEGMENTS].sort()).toEqual(
      [...IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS].sort(),
    );
  });

  it('treats a component record as a record and its fixtures as not', () => {
    expect(
      isKnowledgeRecord('docs/specs/components/Chat/ChatLayout.spec.md'),
    ).toBe(true);
    expect(
      isKnowledgeRecord('packages/core/src/Chat/.hidden/ChatLayout.spec.md'),
    ).toBe(false);
    expect(
      isKnowledgeRecord('packages/core/src/Collapsible/.Collapsible.spec.md'),
    ).toBe(false);
    expect(isKnowledgeRecord('packages/core/src/Chat/ChatLayout.tsx')).toBe(
      false,
    );
  });
});
