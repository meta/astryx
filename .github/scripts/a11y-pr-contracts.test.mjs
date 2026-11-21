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
  CHANGED_SPEC_LIMIT,
  changedOnly,
  changedSinceMergeBase,
  DEFAULT_CHECK_BUDGET_MS,
  PLAN_BUDGET_MS,
  DEPENDENT_SHARE_MS,
  dependentSpecs,
  importerGraph,
  renderingFolders,
  valueImports,
  fileSeconds,
  kebab,
  ownedSpecs,
  planDefaultCheck,
  projectedMs,
  RECORDED_TIME_MARGIN,
  STARTUP_MS,
  summaryMarkdown,
  planFor,
  parseRouting,
  IGNORED_RECORD_SEGMENTS,
  isKnowledgeRecord,
  selectSpecs,
  specOwners,
  withinBudget,
} from './a11y-pr-contracts.mjs';
import {
  createRepository,
  importCommits,
} from '../../scripts/lib/git-fixture.mjs';
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

// The default check first runs the browser specs a pull request adds or
// modifies.
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

  it('runs a changed release-only spec on its own pull request', () => {
    expect(run([RELEASE])).toEqual([{file: RELEASE, reason: 'spec changed'}]);
  });

  it('stops the default check at eight minutes, inside the job budget', () => {
    expect(CHANGED_SPEC_LIMIT).toBe(4);
    expect(DEFAULT_CHECK_BUDGET_MS).toBe(8 * 60 * 1000);
    const runner = fs.readFileSync(
      path.join(root, '.github/scripts/a11y-pr-contracts.mjs'),
      'utf8',
    );
    // Only the default check carries the global timeout.
    expect(runner).toMatch(
      /changedOnlyFile != null\s*\?\s*\['--global-timeout', String\(DEFAULT_CHECK_BUDGET_MS\)\]\s*:\s*\[\]/,
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

// The default check then runs each touched component's own scoped and
// release-only specs, inside its budget.
describe('the default check of the touched components', () => {
  const SWITCH =
    'packages/core/src/Switch/__tests__/Switch.a11y.chromium.spec.ts';
  const LISTBOX =
    'packages/core/src/Selector/__tests__/Listbox.a11y.chromium.spec.ts';
  const COMBOBOX_FIELD =
    'packages/core/src/Selector/__tests__/ComboboxField.a11y.chromium.spec.ts';
  const EMPTY_STATE =
    'packages/core/src/Selector/__tests__/EmptyStateAnnouncement.a11y.chromium.spec.ts';
  const SELECTOR_AUDIT =
    'packages/core/src/Selector/__tests__/SelectorAudit.a11y.chromium.spec.ts';
  const specs = [
    spec(SWITCH, ['// @pr-a11y release-only']),
    spec(LISTBOX, ['// @pr-a11y release-only']),
    spec(COMBOBOX_FIELD),
    spec(EMPTY_STATE, ['// @pr-a11y always']),
    spec(SELECTOR_AUDIT, ['// @pr-a11y audit Selector']),
  ];
  const seconds = {
    [SWITCH]: 168.4,
    [LISTBOX]: 325.2,
    [COMBOBOX_FIELD]: 38.2,
    [EMPTY_STATE]: 4,
    'packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts': 478.7,
  };
  const plan = (owned, changed = [], workers = 4) =>
    planDefaultCheck({
      changed: changed.map(file => ({file, reason: 'spec changed'})),
      owned: ownedSpecs({specs, components: owned, changedPaths: []}),
      seconds,
      workers,
    });
  const files = list => list.map(({file}) => file);

  const owns = (components, changedPaths = [], list = specs) =>
    ownedSpecs({specs: list, components, changedPaths});

  it("selects a touched component's own scoped and release-only specs, and nothing else", () => {
    expect(owns(['core/Switch'])).toEqual([
      {file: SWITCH, reason: 'component core/Switch'},
    ]);
    // Not the always spec or the audit spec in the same folder.
    expect(files(owns(['core/Selector']))).toEqual([LISTBOX, COMBOBOX_FIELD]);
    // An untouched component, such as a reverse dependent, owns none.
    expect(owns(['core/Toolbar'])).toEqual([]);
  });

  it('owns a scoped spec whose component scope token names a touched component', () => {
    const pattern = spec(
      'internal/a11y-spec/src/patterns/switch.chromium.spec.ts',
      ['// @pr-a11y scope core/Switch'],
    );
    expect(owns(['core/Switch'], [], [pattern])).toEqual([
      {file: pattern.file, reason: 'component core/Switch'},
    ]);
    expect(owns(['core/Slider'], [], [pattern])).toEqual([]);
  });

  it('owns nothing without a touched component, so a wide change runs only its changed specs', () => {
    expect(owns([], ['packages/core/src/Switch/Switch.tsx'])).toEqual([]);
  });

  it('owns a binding by its folder component, its own name, or a change in its folder', () => {
    const named = spec(
      'packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts',
      ['// @pr-a11y release-only'],
    );
    expect(files(owns(['core/ChatSendButton'], [], [named]))).toEqual([
      named.file,
    ]);
    expect(files(owns(['core/Chat'], [], [named]))).toEqual([named.file]);
    expect(owns(['core/ChatComposer'], [], [named])).toEqual([]);
    expect(
      owns(['core/ChatComposer'], ['packages/core/src/Chat/Chat.tsx'], [named]),
    ).toEqual([
      {file: named.file, reason: 'changed packages/core/src/Chat/Chat.tsx'},
    ]);
    // A changed knowledge record is not a change in the folder.
    expect(
      owns(
        ['core/ChatComposer'],
        ['docs/specs/components/Chat/Chat.spec.md'],
        [named],
      ),
    ).toEqual([]);
  });

  it("owns a scoped spec whose path token names a touched component's folder", () => {
    const slider = spec(
      'internal/a11y-spec/src/patterns/slider.chromium.spec.ts',
      [
        '// @pr-a11y scope ^(internal/a11y-spec/src/patterns/slider|internal/a11y-spec/src/harness|packages/core/src/Slider/)',
      ],
    );
    expect(
      owns(['core/Slider'], ['packages/core/src/Slider/Slider.tsx'], [slider]),
    ).toEqual([
      {
        file: slider.file,
        reason: 'changed packages/core/src/Slider/Slider.tsx',
      },
    ]);
    // A change to the harness the same token names is shared contract code.
    expect(
      owns(
        ['core/Slider'],
        ['internal/a11y-spec/src/harness/chromium.ts'],
        [slider],
      ),
    ).toEqual([]);
  });

  it('never owns a spec through a path token or a shared pattern change', () => {
    const shared = spec(
      'packages/core/src/Selector/__tests__/SelectorReducedMotion.a11y.chromium.spec.ts',
      ['// @pr-a11y scope ^packages/core/src/motion/'],
    );
    expect(
      owns(
        ['core/Switch'],
        ['packages/core/src/motion/reducedMotion.ts'],
        [shared],
      ),
    ).toEqual([]);
    const pattern = spec(
      'internal/a11y-spec/src/patterns/menu.chromium.spec.ts',
    );
    expect(
      owns(
        ['core/Switch'],
        ['internal/a11y-spec/src/patterns/menu.ts'],
        [pattern],
      ),
    ).toEqual([]);
    // A release-only spec is never owned through a component token either.
    const tokened = spec(
      'internal/a11y-spec/src/patterns/switch.chromium.spec.ts',
      ['// @pr-a11y release-only', '// @pr-a11y scope core/Switch'],
    );
    expect(owns(['core/Switch'], [], [tokened])).toEqual([]);
  });

  it('runs every owned file that fits the plan at its recorded time', () => {
    expect(plan(['core/Switch'])).toEqual({
      run: [{file: SWITCH, reason: 'component core/Switch'}],
      notRun: [],
    });
    // Listbox's 325 s, with the margin and startup, passes the 6-minute plan.
    const selector = plan(['core/Selector']);
    expect(files(selector.run)).toEqual([COMBOBOX_FIELD]);
    expect(files(selector.notRun)).toEqual([LISTBOX]);
  });

  it('plans three quarters of the stop, so a slower runner still finishes every file it starts', () => {
    expect(PLAN_BUDGET_MS).toBe(DEFAULT_CHECK_BUDGET_MS * 0.75);
    // One pull request's changed and owned specs, at the times recorded when
    // the plan filled the whole 8 minutes and the stop cut Listbox (7 minutes
    // on that runner). A file with no recorded time has the median then, 17.3 s.
    const recorded = {
      'packages/core/src/Selector/__tests__/SelectorKeyboardInset.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/__tests__/FocusRingOwner.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/DropdownMenu/__tests__/DropdownMenuTooltip.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/Field/__tests__/FieldDisabledForcedColorsFocus.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/Layer/__tests__/BackdropPress.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/Layer/__tests__/LayerBrowserHide.a11y.chromium.spec.ts': 5.3,
      'packages/core/src/Selector/__tests__/ComboboxField.a11y.chromium.spec.ts': 38.2,
      'packages/core/src/Selector/__tests__/Listbox.a11y.chromium.spec.ts': 325.2,
      'packages/core/src/Selector/__tests__/Selector.a11y.chromium.spec.ts': 1.7,
      'packages/core/src/Selector/__tests__/Selector.combobox.a11y.chromium.spec.ts': 12.3,
      'packages/core/src/Selector/__tests__/SelectorListboxName.a11y.chromium.spec.ts': 17.3,
      'packages/core/src/Selector/__tests__/SelectorReducedMotion.a11y.chromium.spec.ts': 17.3,
    };
    const changedAndOwned = Object.keys(recorded);
    const {run, notRun} = planDefaultCheck({
      changed: [{file: changedAndOwned[0], reason: 'spec changed'}],
      owned: changedAndOwned.slice(1).map(file => ({
        file,
        reason: 'changed packages/core/src/Selector/Selector.test.tsx',
      })),
      seconds: recorded,
      workers: 4,
    });
    const msOf = file => recorded[file] * 1000 * RECORDED_TIME_MARGIN;
    expect(STARTUP_MS + projectedMs(files(run), msOf, 4)).toBeLessThanOrEqual(
      PLAN_BUDGET_MS,
    );
    expect(files(notRun)).toContain(
      'packages/core/src/Selector/__tests__/Listbox.a11y.chromium.spec.ts',
    );
    expect(
      notRun.find(({file}) => file.endsWith('Listbox.a11y.chromium.spec.ts'))
        .reason,
    ).toContain('6-minute plan');
  });

  it('reports a file that does not fit as not run, with the label that runs it', () => {
    // On one worker, in path order: ComboboxField fits, Listbox after it does
    // not, Switch after ComboboxField does.
    const {run, notRun} = plan(['core/Selector', 'core/Switch'], [], 1);
    expect(files(run)).toEqual([COMBOBOX_FIELD, SWITCH]);
    expect(files(notRun)).toEqual([LISTBOX]);
    expect(notRun[0].reason).toContain('component core/Selector');
    expect(notRun[0].reason).toContain('ci:run-a11y');
    expect(notRun[0].reason).toContain('6-minute plan');
    // On four workers the others run side by side; Listbox alone passes the plan.
    expect(files(plan(['core/Selector', 'core/Switch']).notRun)).toEqual([
      LISTBOX,
    ]);
  });

  it('never starts a file that the recorded time says the stop would cut', () => {
    const textInput = spec(
      'packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts',
      ['// @pr-a11y release-only'],
    );
    const {run, notRun} = planDefaultCheck({
      changed: [],
      owned: owns(['core/TextInput'], [], [textInput]),
      seconds,
      workers: 4,
    });
    expect(run).toEqual([]);
    expect(notRun[0].reason).toContain('expected 479 s');
    expect(STARTUP_MS + 478.7 * 1000 * RECORDED_TIME_MARGIN).toBeGreaterThan(
      DEFAULT_CHECK_BUDGET_MS,
    );
  });

  it('runs changed specs first and counts them against the plan, without running a file twice', () => {
    const later =
      'packages/core/src/Switch/__tests__/SwitchLater.a11y.chromium.spec.ts';
    const check = workers =>
      planDefaultCheck({
        changed: [{file: SWITCH, reason: 'spec changed'}],
        owned: [
          {file: SWITCH, reason: 'component core/Switch'},
          {file: later, reason: 'component core/Switch'},
        ],
        seconds: {...seconds, [later]: 120},
        workers,
      });
    expect(check(4)).toEqual({
      run: [
        {file: SWITCH, reason: 'spec changed'},
        {file: later, reason: 'component core/Switch'},
      ],
      notRun: [],
    });
    // On one worker, the later file after the changed Switch passes the
    // plan: 30 + (168.4 + 120) * 1.25 s is more than 6 minutes.
    const {run, notRun} = check(1);
    expect(run).toEqual([{file: SWITCH, reason: 'spec changed'}]);
    expect(files(notRun)).toEqual([later]);
  });

  it('reports a changed spec that does not fit as not run, never starts it', () => {
    const tokenizer =
      'packages/core/src/Tokenizer/__tests__/TokenizerEndLane.a11y.chromium.spec.ts';
    const {run, notRun} = planDefaultCheck({
      changed: [
        {file: SWITCH, reason: 'spec changed'},
        {file: tokenizer, reason: 'spec changed'},
      ],
      owned: [],
      seconds: {...seconds, [tokenizer]: 551.8},
      workers: 4,
    });
    expect(run).toEqual([{file: SWITCH, reason: 'spec changed'}]);
    expect(notRun).toEqual([
      {
        file: tokenizer,
        reason: expect.stringMatching(
          /^spec changed; its expected 552 s does not fit .*ci:run-a11y/,
        ),
      },
    ]);
  });

  it('expects the median recorded time for a file that has none', () => {
    const fresh = spec(
      'packages/core/src/Switch/__tests__/SwitchFresh.a11y.chromium.spec.ts',
      ['// @pr-a11y release-only'],
    );
    const {notRun} = planDefaultCheck({
      changed: [],
      owned: owns(['core/Switch'], [], [fresh]),
      seconds,
      workers: 4,
      budgetMs: STARTUP_MS,
    });
    expect(notRun[0].reason).toContain('expected 168 s');
  });

  it('projects whole files in path order onto the first free worker', () => {
    const ms = {a: 4, b: 1, c: 1, d: 3};
    expect(projectedMs(['d', 'c', 'b', 'a'], file => ms[file], 2)).toBe(5);
    expect(projectedMs(['a', 'b', 'c', 'd'], file => ms[file], 1)).toBe(9);
    expect(projectedMs([], file => ms[file], 4)).toBe(0);
  });

  it('reads recorded seconds per file, not per test', () => {
    expect(
      fileSeconds({
        seconds: {
          [SWITCH]: 168.4,
          [`${SWITCH} \u203A switch \u203A presses`]: 12,
        },
      }),
    ).toEqual({[SWITCH]: 168.4});
    expect(fileSeconds(undefined)).toEqual({});
  });

  it('summarizes what ran and what did not, never as passed', () => {
    const summary = summaryMarkdown({
      components: ['core/Switch'],
      selected: [{file: SWITCH, reason: 'component core/Switch'}],
      notRun: [{file: LISTBOX, reason: 'does not fit'}],
    });
    expect(summary).toContain('`core/Switch`');
    expect(summary).toContain(`- \`${SWITCH}\` (component core/Switch)`);
    expect(summary).toContain('Not run: 1 spec file(s)');
    expect(summary).toContain('did not pass or fail here');
    expect(
      summaryMarkdown({components: [], selected: [], notRun: []}),
    ).toContain('No accessibility contract to run.');
  });

  it('refuses owners without the changed-file list, so no owned contract is dropped silently', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-'));
    const specsFile = path.join(dir, 'specs.txt');
    fs.writeFileSync(specsFile, '');
    const run = args => {
      try {
        execFileSync(
          process.execPath,
          [path.join(root, '.github/scripts/a11y-pr-contracts.mjs'), ...args],
          {cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
        );
        return {status: 0, output: ''};
      } catch (error) {
        return {status: error.status, output: String(error.stderr)};
      }
    };
    try {
      for (const args of [
        ['--changed-only', specsFile, '--owned-by', 'core/ChatLayout'],
        [
          '--changed-only',
          specsFile,
          '--changed-files',
          '',
          '--owned-by',
          'core/ChatLayout',
        ],
      ]) {
        const result = run(args);
        expect(result.status).not.toBe(0);
        expect(result.output).toContain(
          '--owned-by needs --changed-files with the list of changed paths',
        );
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('is wired into the runner: owners, durations and workers reach the plan', () => {
    const runner = fs.readFileSync(
      path.join(root, '.github/scripts/a11y-pr-contracts.mjs'),
      'utf8',
    );
    expect(runner).toContain("flagValue(argv, '--owned-by')");
    // The folder-change rule reads every changed path, not the spec list.
    expect(runner).toContain("flagValue(argv, '--changed-files')");
    expect(runner).toContain(
      'changedPaths: readLines(changedFilesFile) ?? changedPaths',
    );
    expect(runner).toContain('seconds: readDurations(root, policySha)');
    expect(runner).toContain('workers: contractWorkers()');
  });
});

describe('the folders that render a touched component (spec:AST-030 FR12)', () => {
  const write = (root, file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  // #7910's shape: Spinner changes; TextInput renders it, CommandPalette
  // renders TextInput, a Lab component imports Spinner from Core's root, and
  // a shared file passes the reach on, file by file.
  const repo = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'render-graph-'));
    const files = {
      'packages/core/src/index.ts':
        "export * from './Spinner';\nexport * from './Button';\n",
      'packages/core/src/Spinner/index.ts':
        "export {Spinner} from './Spinner';\n",
      'packages/core/src/Spinner/Spinner.tsx': 'export function Spinner() {}\n',
      'packages/core/src/Button/index.ts': "export {Button} from './Button';\n",
      'packages/core/src/Button/Button.tsx': 'export function Button() {}\n',
      'packages/core/src/TextInput/TextInput.tsx':
        "import {Spinner} from '../Spinner/Spinner';\n",
      'packages/core/src/CommandPalette/CommandPaletteInput.tsx':
        "import {TextInput} from '../TextInput/TextInput';\n",
      // One shared file renders Spinner; its neighbour does not.
      'packages/core/src/internal/loading.ts':
        "import {Spinner} from '../Spinner/Spinner';\n",
      'packages/core/src/internal/mergeProps.ts':
        'export function mergeProps() {}\n',
      'packages/core/src/Banner/Banner.tsx':
        "import {loading} from '../internal/loading';\n",
      'packages/core/src/Divider/Divider.tsx':
        "import {mergeProps} from '../internal/mergeProps';\n",
      // A type-only import puts no code on the page.
      'packages/core/src/internal/groupItems.ts':
        "import type {SpinnerSize} from '../Spinner/Spinner';\nimport {type SpinnerTone} from '../Spinner/Spinner';\n",
      'packages/core/src/Menu/Menu.tsx':
        "import {groupItems} from '../internal/groupItems';\n",
      'packages/core/src/Avatar/__tests__/Avatar.test.tsx':
        "import {Spinner} from '../../Spinner/Spinner';\n",
      'packages/core/src/Avatar/Avatar.stories.tsx':
        "import {Spinner} from '../Spinner/Spinner';\n",
      'packages/lab/src/Schedule/shared.tsx':
        "import {Button, Spinner as Busy} from '@astryxdesign/core';\n",
      'packages/lab/src/Rating/Rating.tsx':
        "import {Button} from '@astryxdesign/core';\n",
      // A lazy import is an edge; a barrel's names reach only their own files.
      'packages/core/src/Tooltip/Tooltip.tsx':
        "const Busy = lazy(() => import('../Spinner/Spinner'));\n",
      'packages/core/src/hooks/index.ts':
        "export {useAnnounce} from './useAnnounce';\nexport {useSpin} from './useSpin';\n",
      'packages/core/src/hooks/useAnnounce.ts':
        'export function useAnnounce() {}\n',
      'packages/core/src/hooks/useSpin.ts':
        "import {Spinner} from '../Spinner/Spinner';\nexport function useSpin() {}\n",
      'packages/core/src/Kbd/Kbd.tsx':
        "import {useAnnounce} from '../hooks';\n",
      'packages/core/src/Meter/Meter.tsx':
        "import {useSpin} from '../hooks';\n",
    };
    for (const [file, text] of Object.entries(files)) write(root, file, text);
    return root;
  };

  it('lists every folder that renders a touched one, nearest first, never a shared folder, a test or a type-only import', () => {
    const root = repo();
    try {
      expect(renderingFolders(importerGraph(root), ['core/Spinner'])).toEqual([
        {folder: 'core/Banner', depth: 1},
        {folder: 'core/Meter', depth: 1},
        {folder: 'core/TextInput', depth: 1},
        {folder: 'core/Tooltip', depth: 1},
        {folder: 'lab/Schedule', depth: 1},
        {folder: 'core/CommandPalette', depth: 2},
      ]);
      // Nothing renders an untouched leaf.
      expect(
        renderingFolders(importerGraph(root), ['core/CommandPalette']),
      ).toEqual([]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('reads value imports and re-exports, never type-only ones', () => {
    expect(
      valueImports(
        "import type {A} from './a';\nimport {type B} from './b';\nimport {type C, D} from './c';\nexport {E} from './e';\nexport type {F} from './f';\nimport G from './g';\nimport './h';\nconst I = lazy(() => import('./i'));",
      ),
    ).toEqual([
      {specifier: './c', names: ['D']},
      {specifier: './e', names: ['E']},
      {specifier: './g', names: []},
      {specifier: './h', names: []},
      {specifier: './i', names: []},
    ]);
  });

  it("selects the rendering folders' scoped and release-only specs, nearest first, leaving out what is planned", () => {
    const at = (folder, name, lines = []) =>
      spec(`packages/${folder}/__tests__/${name}.a11y.chromium.spec.ts`, lines);
    const specs = [
      at('core/src/CommandPalette', 'CommandPalettePending'),
      at('core/src/CommandPalette', 'CommandPalette', [
        '// @pr-a11y audit CommandPalette',
      ]),
      at('core/src/TextInput', 'TextInput', ['// @pr-a11y release-only']),
      at('core/src/TextInput', 'TextInputAlways', ['// @pr-a11y always']),
      at('core/src/Spinner', 'SpinnerMotion'),
    ];
    const rendering = [
      {folder: 'core/TextInput', depth: 1},
      {folder: 'core/CommandPalette', depth: 2},
    ];
    expect(dependentSpecs(specs, rendering, new Set())).toEqual([
      {
        file: 'packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts',
        reason: 'renders a touched component',
      },
      {
        file: 'packages/core/src/CommandPalette/__tests__/CommandPalettePending.a11y.chromium.spec.ts',
        reason: 'renders a touched component (2 folders away)',
      },
    ]);
    expect(
      dependentSpecs(
        specs,
        rendering,
        new Set([
          'packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts',
        ]),
      ),
    ).toHaveLength(1);
  });

  it("runs the dependents' specs after the owned ones, in the time left, and reports the rest as not run", () => {
    const own =
      'packages/core/src/Spinner/__tests__/SpinnerMotion.a11y.chromium.spec.ts';
    const near =
      'packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts';
    const far = 'packages/core/src/Aaa/__tests__/Far.a11y.chromium.spec.ts';
    const {run, notRun} = planDefaultCheck({
      changed: [],
      owned: [{file: own, reason: 'component core/Spinner'}],
      // Given nearest first: the far one is not sorted ahead by its path.
      dependents: [
        {file: near, reason: 'renders a touched component'},
        {file: far, reason: 'renders a touched component (3 folders away)'},
      ],
      seconds: {[own]: 60, [near]: 40, [far]: 400},
      workers: 1,
    });
    expect(run.map(({file}) => file)).toEqual([own, near]);
    expect(notRun.map(({file}) => file)).toEqual([far]);
    expect(notRun[0].reason).toContain(
      'renders a touched component (3 folders away)',
    );
    expect(notRun[0].reason).toContain('add ci:run-a11y to run it');
  });

  it('gives the dependents at most their one-minute share, and reports the rest as not run', () => {
    const own =
      'packages/core/src/Spinner/__tests__/SpinnerMotion.a11y.chromium.spec.ts';
    const deps = ['A', 'B', 'C'].map(name => ({
      file: `packages/core/src/${name}/__tests__/${name}.a11y.chromium.spec.ts`,
      reason: 'renders a touched component',
    }));
    // 40 s each with the 1.25 margin is 50 s: one fits 60 s, two do not.
    const {run, notRun} = planDefaultCheck({
      changed: [],
      owned: [{file: own, reason: 'component core/Spinner'}],
      dependents: deps,
      seconds: {
        [own]: 60,
        ...Object.fromEntries(deps.map(({file}) => [file, 40])),
      },
      workers: 1,
    });
    expect(run.map(({file}) => file)).toEqual([own, deps[0].file]);
    expect(notRun.map(({file}) => file)).toEqual([deps[1].file, deps[2].file]);
    expect(notRun[0].reason).toContain(
      '1-minute share for folders that render a touched component',
    );
    expect(DEPENDENT_SHARE_MS).toBe(60 * 1000);
  });

  it('says in the summary how many folders render a touched component', () => {
    expect(
      summaryMarkdown({
        components: ['core/Spinner'],
        selected: [],
        notRun: [],
        rendering: [{folder: 'core/TextInput', depth: 1}],
      }),
    ).toContain('Folders that render a touched component: 1');
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

  it("runs the folder's scoped and release-only specs when its folder changes", () => {
    expect(
      pr(all, {changedPaths: ['packages/core/src/Chat/ChatLayout.tsx']}),
    ).toEqual([always.file, scoped.file, releaseOnly.file]);
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
    ).toEqual([always.file, scoped.file, releaseOnly.file]);
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
        releaseOnly.file,
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

  it('runs a release-only spec on a pull request only for its own component', () => {
    expect(
      pr([releaseOnly], {
        changedPaths: null,
        components: ['core/ChatLayout'],
      }),
    ).toEqual([]);
    expect(pr([releaseOnly], {components: ['core/ChatLayout']})).toEqual([
      releaseOnly.file,
    ]);
    expect(
      pr([releaseOnly], {changedPaths: ['packages/core/src/Chat/Chat.tsx']}),
    ).toEqual([releaseOnly.file]);
    expect(pr([releaseOnly], {changedPaths: [releaseOnly.file]})).toEqual([
      releaseOnly.file,
    ]);
    expect(pr([releaseOnly], {components: ['core/Selector']})).toEqual([]);
    // A scope token never selects it.
    const tokened = spec(
      'packages/core/src/Chat/__tests__/ChatLayout.a11y.chromium.spec.ts',
      ['// @pr-a11y release-only', '// @pr-a11y scope core/Selector ^apps/x'],
    );
    expect(
      pr([tokened], {components: ['core/Selector'], changedPaths: ['apps/x']}),
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
  // The origin's main has three commits, and its feature branch adds one
  // file. A full clone sits on that branch, and main moves on after the clone.
  // Built once, and fast-import writes the commits: five git launches in all.
  const cwd = process.cwd();
  let dir = '';
  let clone = '';
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pr-a11y-'));
    const origin = path.join(dir, 'origin');
    createRepository(origin, [
      {ref: 'refs/heads/main', message: '1', files: {'base.txt': '1'}},
      {ref: 'refs/heads/main', message: '2', files: {'base.txt': '2'}},
      {
        ref: 'refs/heads/main',
        name: '3',
        message: '3',
        files: {'base.txt': '3'},
      },
      {
        ref: 'refs/heads/feature',
        parent: '3',
        message: 'f',
        files: {'feature.txt': 'f'},
      },
    ]);
    clone = path.join(dir, 'clone');
    git(dir, 'clone', '-q', origin, clone);
    git(clone, 'checkout', '-q', 'feature');
    importCommits(origin, [
      {
        ref: 'refs/heads/main',
        parent: 'main',
        message: 'l',
        files: {'later.txt': 'l'},
      },
    ]);
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

  it('runs the reorder-grip pinch spec only for the grips it renders', () => {
    const file =
      'packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts';
    const routing = parseRouting(
      fs.readFileSync(path.join(root, file), 'utf8'),
    );
    const selects = changedPaths =>
      selectSpecs({
        specs: [{file, routing}],
        isPullRequest: true,
        changedPaths,
        components: [],
        title: '',
      }).length > 0;
    for (const changed of [
      'packages/lab/src/ListInput/ListInput.tsx',
      'packages/lab/src/TransferList/TransferList.tsx',
      'packages/core/src/List/listReorderEngine.tsx',
      'packages/core/src/internal/reorder.ts',
      'packages/core/src/reorderable/createReorderable.ts',
      'packages/core/src/gestures/GestureHost.ts',
      'packages/core/src/gestures/LongPressGestureRecognizer.ts',
      'packages/core/src/motion/uikit/reorder.ts',
      'apps/storybook/stories/TransferListA11y.stories.tsx',
      'apps/storybook/stories/ListInput.stories.tsx',
    ]) {
      expect(selects([changed]), changed).toBe(true);
    }
    for (const changed of [
      'packages/lab/src/Tokenizer/Tokenizer.tsx',
      'packages/core/src/Drawer/Drawer.tsx',
      'packages/core/src/hooks/useScrollableArea.ts',
      'apps/storybook/stories/SideNav.stories.tsx',
    ]) {
      expect(selects([changed]), changed).toBe(false);
    }
  });

  it('gives every spec valid routing lines', () => {
    for (const file of files) {
      expect(
        () => parseRouting(fs.readFileSync(path.join(root, file), 'utf8')),
        file,
      ).not.toThrow();
    }
  });

  it("owns a component folder's contracts for a change in that folder", () => {
    // A folder of several components: an edit to one of them names only that
    // owner, so the folder's hook and surface specs are owned by the change.
    const specs = files.map(file => ({
      file,
      routing: parseRouting(fs.readFileSync(path.join(root, file), 'utf8')),
    }));
    const owned = ownedSpecs({
      specs,
      components: ['core/ChatLayout'],
      changedPaths: ['packages/core/src/Chat/ChatLayout.tsx'],
    }).map(({file}) => file);
    for (const file of [
      'packages/core/src/Chat/__tests__/ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts',
      'packages/core/src/Chat/__tests__/useChatStreamScroll.a11y.chromium.spec.ts',
    ]) {
      expect(owned, file).toContain(file);
    }
    expect(
      ownedSpecs({
        specs,
        components: ['core/ChatLayout'],
        changedPaths: [],
      }).map(({file}) => file),
    ).not.toContain(
      'packages/core/src/Chat/__tests__/useChatStreamScroll.a11y.chromium.spec.ts',
    );
    // Audit bindings in the folder still wait for their audit pull request.
    expect(owned).not.toContain(
      'packages/core/src/Chat/__tests__/ChatMessageList.a11y.chromium.spec.ts',
    );
    // A pattern contract whose path token names the touched folder.
    expect(
      ownedSpecs({
        specs,
        components: ['core/Slider'],
        changedPaths: ['packages/core/src/Slider/Slider.tsx'],
      }).map(({file}) => file),
    ).toContain('internal/a11y-spec/src/patterns/slider.chromium.spec.ts');
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
