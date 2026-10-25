// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the PR browser accessibility spec runner.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  auditArgs,
  auditedComponents,
  auditPlan,
  changedSinceMergeBase,
  kebab,
  planFor,
  parseRouting,
  selectSpecs,
  specOwners,
} from './a11y-pr-contracts.mjs';

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

  it("lists the branch's own changes and never makes a full clone shallow", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pr-a11y-'));
    const cwd = process.cwd();
    try {
      const origin = path.join(dir, 'origin');
      fs.mkdirSync(origin);
      git(origin, 'init', '-q', '-b', 'main');
      for (const n of ['1', '2', '3']) commit(origin, 'base.txt', n);
      const clone = path.join(dir, 'clone');
      git(dir, 'clone', '-q', origin, clone);
      git(clone, 'checkout', '-qb', 'feature');
      commit(clone, 'feature.txt', 'f');
      git(clone, 'push', '-q', 'origin', 'feature');
      commit(origin, 'later.txt', 'l');
      process.chdir(clone);
      expect(changedSinceMergeBase('main')).toEqual(['feature.txt']);
      expect(changedSinceMergeBase('origin/main')).toEqual(['feature.txt']);
      expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('false');
      expect(changedSinceMergeBase('no-such-ref')).toBeNull();
      expect(changedSinceMergeBase(undefined)).toBeNull();
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, {recursive: true, force: true});
    }
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
    for (const glob of [
      'internal/a11y-spec/src/**/*.chromium.spec.ts',
      'packages/*/src/**/*.a11y.chromium.spec.ts',
      'packages/*/src/**/*.a11y.browser.spec.ts',
    ]) {
      expect(config).toContain(`'${glob}'`);
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
