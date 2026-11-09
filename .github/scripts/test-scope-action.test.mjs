// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Behavior of the per-job scope step (.github/actions/test-scope).
 *
 * Every job that owns tests decides its own scope with this step; there is no
 * separate scope job. These cases run the action's real script, as
 * actions/github-script runs it, against a stubbed GitHub API that serves the
 * repository's real classifier files as the base's trusted policy. Anything
 * the step cannot decide must put everything in scope (spec:AST-030 FR3, FR4).
 */

import fs from 'node:fs';
import os from 'node:os';
import {createRequire} from 'node:module';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const action = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/actions/test-scope/action.yml'),
    'utf8',
  ),
);
const scriptStep = action.runs.steps.find(step =>
  step.uses?.startsWith('actions/github-script@'),
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const requireFromHere = createRequire(import.meta.url);

const BASE_SHA = 'b'.repeat(40);
const HEAD_SHA = 'h'.repeat(40);
const INTERACTION_PATHS =
  '^(internal/interaction-harness/|internal/a11y-spec/|playwright\\.interaction\\.config\\.ts$|packages/[^/]+/src/|packages/themes/[^/]+/src/|apps/storybook/|\\.github/workflows/ci\\.yml$|package\\.json$|pnpm-lock\\.yaml$|\\.github/actions/test-scope/)';
const CLASSIFIER_FILES = new Set([
  '.github/scripts/change-scope.cjs',
  '.github/scripts/knowledge-paths.cjs',
  'scripts/component-packages.cjs',
]);
const AUDIT_FILE = '.github/scripts/component-audit-scope.cjs';
const OFFICIAL_PACKAGES = 'packages/cli/assets/discover/official-packages.json';

function pullRequestContext(baseRef = 'main') {
  return {
    eventName: 'pull_request',
    repo: {owner: 'o', repo: 'r'},
    payload: {
      pull_request: {
        number: 7,
        base: {ref: baseRef, sha: BASE_SHA},
        head: {sha: HEAD_SHA},
      },
    },
  };
}

/**
 * Runs the action script. `files` is GitHub's file list (or an Error to
 * throw); `headFiles` are the paths present at the PR head; `missingBase`
 * removes classifier files from the base.
 */
async function decide({
  context = pullRequestContext(),
  files = [],
  inputs = {},
  headFiles = [],
  headError,
  missingBase = [],
  baseOverrides = {},
  truncated = [],
  policyError,
} = {}) {
  const outputs = {};
  const messages = {info: [], warning: [], notice: [], failed: []};
  const contentCalls = [];
  const core = {
    setOutput: (key, value) => {
      outputs[key] = value;
    },
    info: message => messages.info.push(message),
    warning: message => messages.warning.push(message),
    notice: message => messages.notice.push(message),
    setFailed: message => messages.failed.push(message),
  };
  const notFound = () => Object.assign(new Error('Not Found'), {status: 404});
  const policyText = file => {
    if (missingBase.includes(file)) return null;
    if (file in baseOverrides) return baseOverrides[file];
    return fs.readFileSync(path.join(root, file), 'utf8');
  };
  const graphqlCalls = [];
  const github = {
    // The trusted policy: one aliased Blob per `<sha>:<path>` expression.
    graphql: async (query, variables) => {
      graphqlCalls.push({query, variables});
      if (policyError) throw policyError;
      const repository = {};
      for (const [key, expression] of Object.entries(variables)) {
        if (!/^f\d+$/.test(key)) continue;
        const [ref, file] = [expression.slice(0, 40), expression.slice(41)];
        contentCalls.push({file, ref});
        const known =
          CLASSIFIER_FILES.has(file) ||
          file === AUDIT_FILE ||
          file === OFFICIAL_PACKAGES;
        const text = ref === BASE_SHA && known ? policyText(file) : null;
        repository[key] =
          text == null ? null : {text, isTruncated: truncated.includes(file)};
      }
      return {repository};
    },
    paginate: async () => {
      if (files instanceof Error) throw files;
      return files;
    },
    rest: {
      pulls: {listFiles: () => {}},
      repos: {
        getContent: async ({path: file, ref}) => {
          contentCalls.push({file, ref, rest: true});
          if (ref === HEAD_SHA && headError) {
            throw Object.assign(new Error('Server Error'), {status: headError});
          }
          if (ref === HEAD_SHA && headFiles.includes(file)) {
            return {data: {content: ''}};
          }
          throw notFound();
        },
      },
    },
  };
  const env = {
    SCOPE_PATHS: inputs.paths ?? '',
    SCOPE_OUTSIDE_PR: inputs['outside-pull-request'] ?? 'run',
    SCOPE_HEAD_FILE: inputs['requires-head-file'] ?? '',
    SCOPE_COMPONENT_AUDIT: inputs['component-audit'] ?? 'false',
    SCOPE_LAB_ONLY_SPECS: inputs['lab-only-specs'] ?? '',
  };
  const saved = {...process.env};
  Object.assign(process.env, env);
  try {
    await new AsyncFunction(
      'require',
      'github',
      'context',
      'core',
      scriptStep.with.script,
    )(requireFromHere, github, context, core);
  } finally {
    for (const key of Object.keys(env)) {
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
    }
  }
  return {outputs, messages, contentCalls, graphqlCalls};
}

const changed = (...names) =>
  names.map(filename => ({filename, status: 'modified'}));

describe('per-job scope step', () => {
  it('is one github-script step that retries server errors', () => {
    expect(action.runs.using).toBe('composite');
    expect(scriptStep.with.retries).toBeGreaterThanOrEqual(1);
    expect(Object.keys(action.outputs).sort()).toEqual(
      [
        'applies',
        'head_file_present',
        'changed_files_path',
        'decided',
        'docsite_only',
        'force_full_component_audits',
        'full_suite',
        'has_components',
        'has_rtl_components',
        'has_rtl_harness',
        'lab_only',
        'lab_specs_path',
        'release_bump',
        'spec_only',
        'tooling_only',
        'touches',
        'truncated',
        'vitest_full_suite',
      ].sort(),
    );
  });

  it('puts everything in scope outside a pull request', async () => {
    const context = {eventName: 'merge_group', repo: {owner: 'o', repo: 'r'}};
    const {outputs} = await decide({context});
    expect(outputs).toMatchObject({
      spec_only: 'false',
      docsite_only: 'false',
      tooling_only: 'false',
      full_suite: 'true',
      applies: 'true',
    });
    const skipped = await decide({
      context,
      inputs: {'outside-pull-request': 'skip'},
    });
    expect(skipped.outputs.applies).toBe('false');
  });

  it('keeps a generated release-branch pull request on the narrow bump lane', async () => {
    const {outputs} = await decide({
      context: pullRequestContext('release/v1.2.3'),
      files: changed(
        '.changeset/frozen.md',
        'packages/core/CHANGELOG.md',
        'packages/core/package.json',
      ),
    });
    expect(outputs).toMatchObject({
      release_bump: 'true',
      spec_only: 'true',
      tooling_only: 'true',
      applies: 'false',
    });
  });

  it('runs every lane for a release-branch test-repair candidate', async () => {
    const {outputs} = await decide({
      context: pullRequestContext('release/v1.2.3'),
      files: changed(
        'packages/core/src/BottomSheet/__tests__/BottomSheetRelease.a11y.chromium.spec.ts',
      ),
      inputs: {'component-audit': 'true'},
    });
    expect(outputs).toMatchObject({
      release_bump: 'true',
      spec_only: 'false',
      tooling_only: 'false',
      full_suite: 'true',
      vitest_full_suite: 'true',
      has_components: 'true',
      force_full_component_audits: 'true',
      applies: 'true',
    });
    expect(fs.readFileSync(outputs.changed_files_path, 'utf8')).toBe(
      'packages/core/src/BottomSheet/__tests__/BottomSheetRelease.a11y.chromium.spec.ts\n',
    );
  });

  it.each([
    ['an empty file list', []],
    ['an API failure', new Error('unavailable')],
    [
      'a truncated file list',
      Array.from({length: 3000}, (_, index) => ({
        filename: `packages/core/src/Test${index}.test.ts`,
        status: 'modified',
      })),
    ],
  ])('runs every lane when release scope has %s', async (_, files) => {
    const {outputs} = await decide({
      context: pullRequestContext('release/v1.2.3'),
      files,
      inputs: {'component-audit': 'true'},
    });
    expect(outputs).toMatchObject({
      release_bump: 'true',
      decided: 'false',
      full_suite: 'true',
      vitest_full_suite: 'true',
      force_full_component_audits: 'true',
      applies: 'true',
    });
  });

  it('classifies the PR file list with the classifier read from the base commit', async () => {
    const {outputs, contentCalls} = await decide({
      files: changed('packages/core/src/Button/Button.tsx'),
      inputs: {paths: INTERACTION_PATHS},
    });
    expect(outputs).toMatchObject({
      spec_only: 'false',
      docsite_only: 'false',
      tooling_only: 'false',
      release_bump: 'false',
      touches: 'true',
      applies: 'true',
    });
    expect(
      contentCalls.filter(call => CLASSIFIER_FILES.has(call.file)),
    ).toEqual([...CLASSIFIER_FILES].map(file => ({file, ref: BASE_SHA})));
  });

  it('reads the trusted policy in one GraphQL query and no REST call', async () => {
    const {graphqlCalls, contentCalls} = await decide({
      files: changed('packages/core/src/Button/Button.tsx'),
      inputs: {'component-audit': 'true'},
    });
    expect(graphqlCalls).toHaveLength(1);
    expect(graphqlCalls[0].variables).toEqual({
      owner: 'o',
      repo: 'r',
      f0: `${BASE_SHA}:.github/scripts/change-scope.cjs`,
      f1: `${BASE_SHA}:.github/scripts/knowledge-paths.cjs`,
      f2: `${BASE_SHA}:scripts/component-packages.cjs`,
      f3: `${BASE_SHA}:${AUDIT_FILE}`,
      f4: `${BASE_SHA}:${OFFICIAL_PACKAGES}`,
    });
    expect(contentCalls.filter(call => call.rest)).toEqual([]);
  });

  it.each([
    ['the query fails', {policyError: new Error('Something went wrong')}],
    [
      'a policy file is truncated',
      {truncated: ['.github/scripts/change-scope.cjs']},
    ],
  ])('puts everything in scope when %s', async (_, options) => {
    const {outputs, messages} = await decide({
      files: changed('docs/specs/AST-999-example/spec.md'),
      ...options,
    });
    expect(outputs).toMatchObject({
      spec_only: 'false',
      full_suite: 'true',
      decided: 'false',
    });
    expect(messages.warning).toEqual([
      expect.stringMatching(
        /^Scope could not be decided \(.+\); everything is in scope\.$/,
      ),
    ]);
  });

  it('does not apply when no changed path is in the declared scope', async () => {
    const {outputs} = await decide({
      files: changed('packages/cli/assets/codemods/registry.json'),
      inputs: {paths: INTERACTION_PATHS},
    });
    expect(outputs).toMatchObject({touches: 'false', applies: 'false'});
  });

  it('matches the old name of a rename', async () => {
    const {outputs} = await decide({
      files: [
        {
          filename: 'packages/cli/assets/moved.ts',
          previous_filename: 'internal/interaction-harness/moved.ts',
          status: 'renamed',
        },
      ],
      inputs: {paths: INTERACTION_PATHS},
    });
    expect(outputs.touches).toBe('true');
  });

  it('does not apply on a specialized lane even when a path matches', async () => {
    const {outputs} = await decide({
      files: changed('docs/specs/AST-030/spec.md'),
    });
    expect(outputs).toMatchObject({spec_only: 'true', applies: 'false'});
  });

  it('does not apply on the Lab-only lane, and reports it (spec:AST-030 FR26)', async () => {
    const {outputs} = await decide({
      files: changed('packages/lab/src/Tour/Tour.tsx', '.changeset/tour.md'),
      inputs: {paths: INTERACTION_PATHS},
    });
    expect(outputs).toMatchObject({
      lab_only: 'true',
      applies: 'false',
      spec_only: 'false',
    });
    const mixed = await decide({
      files: changed(
        'packages/lab/src/Tour/Tour.tsx',
        'packages/core/src/Button/Button.tsx',
      ),
    });
    expect(mixed.outputs).toMatchObject({lab_only: 'false', applies: 'true'});
  });

  it('still runs a changed interaction spec on the Lab-only lane, alone (spec:AST-030 FR26)', async () => {
    const spec =
      'packages/lab/src/NavigationStack/__tests__/NavigationStack.interaction.browser.spec.ts';
    const inputs = {
      paths: INTERACTION_PATHS,
      'lab-only-specs': '\\.interaction\\.browser\\.spec\\.ts$',
      'requires-head-file': 'playwright.interaction.config.ts',
    };
    const headFiles = ['playwright.interaction.config.ts'];
    const {outputs} = await decide({files: changed(spec), inputs, headFiles});
    expect(outputs).toMatchObject({lab_only: 'true', applies: 'true'});
    expect(fs.readFileSync(outputs.lab_specs_path, 'utf8')).toBe(`${spec}\n`);
    // Lab source beside the spec adds nothing: only the spec runs.
    const both = await decide({
      files: changed(
        'packages/lab/src/NavigationStack/NavigationStack.tsx',
        spec,
      ),
      inputs,
      headFiles,
    });
    expect(both.outputs.applies).toBe('true');
    expect(fs.readFileSync(both.outputs.lab_specs_path, 'utf8')).toBe(
      `${spec}\n`,
    );
    // Lab source alone runs none.
    const source = await decide({
      files: changed('packages/lab/src/NavigationStack/NavigationStack.tsx'),
      inputs,
      headFiles,
    });
    expect(source.outputs).toMatchObject({
      lab_only: 'true',
      applies: 'false',
      lab_specs_path: '',
    });
    // A deleted spec has nothing to run.
    const removed = await decide({
      files: [{filename: spec, status: 'removed'}],
      inputs,
      headFiles,
    });
    expect(removed.outputs).toMatchObject({
      applies: 'false',
      lab_specs_path: '',
    });
    // A head cut before the interaction config still skips.
    const old = await decide({files: changed(spec), inputs});
    expect(old.outputs.applies).toBe('false');
  });

  it('reports no Lab-only lane when the base classifier predates it', async () => {
    const old = fs
      .readFileSync(path.join(root, '.github/scripts/change-scope.cjs'), 'utf8')
      .replace('\\nlab_only=${result.labOnly}', '');
    expect(old).not.toContain('lab_only=');
    const {outputs} = await decide({
      files: changed('packages/lab/src/Tour/Tour.tsx'),
      baseOverrides: {'.github/scripts/change-scope.cjs': old},
    });
    expect(outputs).toMatchObject({
      lab_only: 'false',
      applies: 'true',
      decided: 'true',
    });
  });

  it('reports no Lab-only lane outside a pull request or when undecidable', async () => {
    const push = await decide({
      context: {...pullRequestContext(), eventName: 'workflow_dispatch'},
    });
    expect(push.outputs.lab_only).toBe('false');
    const broken = await decide({
      files: changed('packages/lab/src/Tour/Tour.tsx'),
      missingBase: ['.github/scripts/change-scope.cjs'],
    });
    expect(broken.outputs).toMatchObject({lab_only: 'false', decided: 'false'});
  });

  it('fails when the trusted classifier rejects the change', async () => {
    const {messages} = await decide({
      files: [
        ...changed('docs/specs/AST-030/spec.md'),
        {filename: '.changeset/new-thing.md', status: 'added'},
      ],
    });
    expect(messages.failed).toHaveLength(1);
  });

  it.each([
    ['the file list cannot be read', {files: new Error('502 Bad Gateway')}],
    [
      'GitHub truncates the file list',
      {
        files: Array.from({length: 3000}, (_, i) => ({
          filename: `docs/specs/AST-${i}/spec.md`,
          status: 'modified',
        })),
      },
    ],
    ['GitHub lists no changed files', {files: []}],
    [
      'a classifier file is missing at the base',
      {
        files: changed('docs/specs/AST-030/spec.md'),
        missingBase: ['scripts/component-packages.cjs'],
      },
    ],
  ])('puts everything in scope when %s', async (name, options) => {
    const {outputs, messages} = await decide({
      ...options,
      inputs: {paths: INTERACTION_PATHS},
    });
    // Only a truncated file list is one a re-run cannot decide.
    expect(outputs.truncated).toBe(
      name === 'GitHub truncates the file list' ? 'true' : 'false',
    );
    expect(outputs).toMatchObject({
      spec_only: 'false',
      docsite_only: 'false',
      tooling_only: 'false',
      full_suite: 'true',
      touches: 'true',
      applies: 'true',
    });
    expect(messages.warning).toHaveLength(1);
    expect(outputs.decided).toBe('false');
  });

  it('reports a decided scope when the classifier ran', async () => {
    const {outputs} = await decide({
      files: changed('docs/specs/AST-030/spec.md'),
    });
    expect(outputs.decided).toBe('true');
  });

  it('classifies a rename by both names, so a rename into specs is not spec-only', async () => {
    const {outputs} = await decide({
      files: [
        {
          filename: 'docs/specs/AST-030/spec.md',
          previous_filename: 'packages/core/src/Button/Button.tsx',
          status: 'renamed',
        },
      ],
    });
    expect(outputs.spec_only).toBe('false');
    expect(outputs.applies).toBe('true');
  });

  describe('requires-head-file', () => {
    const inputs = {
      paths: INTERACTION_PATHS,
      'requires-head-file': 'playwright.interaction.config.ts',
    };

    it('does not apply, with a notice, to a head cut before the file existed', async () => {
      const {outputs, messages} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs,
      });
      expect(outputs.applies).toBe('false');
      expect(messages.notice).toHaveLength(1);
    });

    it('still applies to a pull request that renames the file away, with no notice', async () => {
      const {outputs, messages} = await decide({
        files: [
          {
            filename: 'playwright.old-interaction.config.ts',
            previous_filename: 'playwright.interaction.config.ts',
            status: 'renamed',
          },
        ],
        inputs,
      });
      expect(outputs.applies).toBe('true');
      expect(messages.notice).toHaveLength(0);
    });

    it('still applies when the head lookup fails for another reason', async () => {
      const {outputs, messages} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs,
        headError: 500,
      });
      expect(outputs.applies).toBe('true');
      expect(messages.notice).toHaveLength(0);
    });

    it('applies when the head has the file', async () => {
      const {outputs} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        headFiles: ['playwright.interaction.config.ts'],
        inputs,
      });
      expect(outputs.applies).toBe('true');
    });

    it('reports a head without the file whether or not touches holds', async () => {
      for (const file of ['packages/core/src/Button/Button.tsx', 'README.md']) {
        const {outputs} = await decide({files: changed(file), inputs});
        expect(outputs.head_file_present, file).toBe('false');
      }
      const {outputs} = await decide({
        files: changed('README.md'),
        headFiles: ['playwright.interaction.config.ts'],
        inputs,
      });
      expect(outputs.head_file_present).toBe('true');
    });

    it('keeps the file present for a pull request that renames or deletes it', async () => {
      for (const file of [
        {
          filename: 'playwright.old-interaction.config.ts',
          previous_filename: 'playwright.interaction.config.ts',
          status: 'renamed',
        },
        {filename: 'playwright.interaction.config.ts', status: 'removed'},
      ]) {
        const {outputs} = await decide({files: [file], inputs});
        expect(outputs.head_file_present).toBe('true');
      }
    });

    it('still applies to a pull request that deletes the file, so the check fails', async () => {
      const {outputs} = await decide({
        files: [
          {filename: 'playwright.interaction.config.ts', status: 'removed'},
        ],
        inputs,
      });
      expect(outputs.applies).toBe('true');
    });
  });

  describe('component-audit', () => {
    const inputs = {'component-audit': 'true'};

    it('runs every audit in full outside a pull request', async () => {
      const {outputs} = await decide({
        context: {
          eventName: 'workflow_dispatch',
          repo: {owner: 'o', repo: 'r'},
        },
        inputs,
      });
      expect(outputs).toMatchObject({
        has_components: 'true',
        has_rtl_components: 'true',
        has_rtl_harness: 'true',
        force_full_component_audits: 'true',
      });
    });

    it('classifies a component change with the base classifier and lists its files', async () => {
      const {outputs, contentCalls} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs,
      });
      expect(outputs).toMatchObject({
        has_components: 'true',
        has_rtl_components: 'true',
        force_full_component_audits: 'false',
      });
      // The list goes through a file: it can outgrow an environment variable.
      expect(fs.readFileSync(outputs.changed_files_path, 'utf8')).toBe(
        'packages/core/src/Button/Button.tsx\n',
      );
      expect(contentCalls).toContainEqual({file: AUDIT_FILE, ref: BASE_SHA});
    });

    it('applies no audit to the generated release-branch pull request', async () => {
      const {outputs} = await decide({
        context: pullRequestContext('release/v1.2.3'),
        files: changed(
          '.changeset/frozen.md',
          'packages/core/CHANGELOG.md',
          'packages/core/package.json',
        ),
        inputs,
      });
      expect(outputs).toMatchObject({
        has_components: 'false',
        has_rtl_components: 'false',
        has_rtl_harness: 'false',
        force_full_component_audits: 'false',
      });
    });

    it('applies no audit on a specialized lane', async () => {
      const {outputs} = await decide({
        files: changed('docs/specs/AST-030/spec.md'),
        inputs,
      });
      expect(outputs).toMatchObject({
        has_components: 'false',
        has_rtl_components: 'false',
        has_rtl_harness: 'false',
        force_full_component_audits: 'false',
      });
    });

    it('keeps the component audits for a Lab-only change, so a label still runs its suite (spec:AST-030 FR26)', async () => {
      const {outputs} = await decide({
        files: changed('packages/lab/src/Tour/Tour.tsx'),
        inputs,
      });
      expect(outputs.lab_only).toBe('true');
      expect(outputs.applies).toBe('false');
      expect(outputs.has_components).toBe('true');
    });

    it('runs every audit in full when the base lacks the audit classifier', async () => {
      const {outputs, messages} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs,
        missingBase: [AUDIT_FILE],
      });
      expect(outputs.force_full_component_audits).toBe('true');
      expect(messages.warning).toHaveLength(1);
    });

    it('runs every audit in full when the audit classifier fails', async () => {
      const {outputs, messages} = await decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs,
        baseOverrides: {[AUDIT_FILE]: 'process.exit(3);\n'},
      });
      expect(outputs).toMatchObject({
        has_components: 'true',
        has_rtl_components: 'true',
        has_rtl_harness: 'true',
        force_full_component_audits: 'true',
      });
      expect(messages.warning).toEqual([
        expect.stringContaining('Component audit scope could not be decided'),
      ]);
    });
  });
});

describe('a new Lab component (spec:AST-030 FR26)', () => {
  const component = [
    {filename: 'packages/lab/src/CommentPin/CommentPin.tsx', status: 'added'},
    {filename: 'packages/lab/src/CommentPin/index.ts', status: 'added'},
    {filename: 'packages/lab/src/index.ts', status: 'modified'},
  ];
  const routes = {
    filename: 'internal/shadcn-registry/routes.lock.json',
    status: 'modified',
    patch: [
      '@@ -556,6 +556,11 @@',
      '       "path": "components/lab/code-editor",',
      '       "aliases": []',
      '     },',
      '+    {',
      '+      "name": "component-lab-comment-pin",',
      '+      "path": "components/lab/comment-pin",',
      '+      "aliases": []',
      '+    },',
      '@@ -1885,6 +1890,11 @@',
      '+    {',
      '+      "name": "example-comment-pin-host-owned-placement",',
      '+      "path": "examples/comment-pin/host-owned-placement",',
      '+      "aliases": []',
      '+    },',
    ].join('\n'),
  };
  const labStory = {
    filename: 'apps/storybook/stories/CommentPin.stories.tsx',
    status: 'added',
    patch: [
      '@@ -0,0 +1,3 @@',
      "+import type {Meta} from '@storybook/react';",
      "+import {CommentPin} from '@astryxdesign/lab';",
      "+import {Text} from '@astryxdesign/core/Text';",
    ].join('\n'),
  };
  const officialLines = fs
    .readFileSync(path.join(root, OFFICIAL_PACKAGES), 'utf8')
    .split('\n');
  const labLine =
    officialLines.findIndex(line =>
      line.includes('"package": "@astryxdesign/lab"'),
    ) + 1;
  const official = at => ({
    filename: OFFICIAL_PACKAGES,
    status: 'modified',
    patch: [
      `@@ -${at},3 +${at},7 @@`,
      ` ${officialLines[at - 1]}`,
      '+        {',
      '+          "kind": "component",',
      '+          "name": "CommentPin"',
      '+        },',
      ` ${officialLines[at]}`,
      ` ${officialLines[at + 1]}`,
    ].join('\n'),
  });

  it('stays in the Lab-only lane with its routes, discovery entry and story', async () => {
    const {outputs} = await decide({
      files: [...component, routes, labStory, official(labLine + 6)],
    });
    expect(outputs.lab_only).toBe('true');
    expect(outputs.full_suite).toBe('false');
  });

  it('runs full CI when a core story changes with it', async () => {
    const {outputs} = await decide({
      files: [
        ...component,
        routes,
        labStory,
        {
          filename: 'apps/storybook/stories/Button.stories.tsx',
          status: 'added',
          patch: "@@ -0,0 +1 @@\n+import {Button} from '@astryxdesign/core';",
        },
      ],
    });
    expect(outputs.lab_only).toBe('false');
  });

  it("runs full CI when a route names another component, or the discovery edit is outside Lab's entry", async () => {
    const otherRoute = {
      ...routes,
      patch: routes.patch.replaceAll('comment-pin', 'button'),
    };
    expect(
      (await decide({files: [...component, otherRoute]})).outputs.lab_only,
    ).toBe('false');
    expect(
      (await decide({files: [...component, official(10)]})).outputs.lab_only,
    ).toBe('false');
  });

  it('runs full CI for a changed existing story, even one that imports Lab', async () => {
    const {outputs} = await decide({
      files: [...component, routes, {...labStory, status: 'modified'}],
    });
    expect(outputs.lab_only).toBe('false');
  });

  it('runs full CI for a new Lab story of a component the change does not carry', async () => {
    const {outputs} = await decide({
      files: [
        ...component,
        routes,
        {
          ...labStory,
          filename: 'apps/storybook/stories/Drawer.stories.tsx',
          patch: "@@ -0,0 +1 @@\n+import {Drawer} from '@astryxdesign/lab';",
        },
      ],
    });
    expect(outputs.lab_only).toBe('false');
  });

  it('runs full CI for a renamed entry file', async () => {
    const {outputs} = await decide({
      files: [
        ...component,
        {
          ...labStory,
          status: 'renamed',
          previous_filename: 'apps/storybook/stories/OldPin.stories.tsx',
        },
      ],
    });
    expect(outputs.lab_only).toBe('false');
  });

  it('keeps the full suite for a mixed change that carries Lab routes', async () => {
    const {outputs} = await decide({
      files: [
        ...component,
        routes,
        {filename: 'packages/core/src/Button/Button.tsx', status: 'modified'},
      ],
    });
    expect(outputs.lab_only).toBe('false');
    expect(outputs.full_suite).toBe('true');
  });

  it('runs full CI when GitHub leaves out a patch, or the story does not import Lab', async () => {
    const {patch: _omitted, ...noPatch} = routes;
    expect(
      (await decide({files: [...component, noPatch]})).outputs.lab_only,
    ).toBe('false');
    const coreOnlyStory = {
      ...labStory,
      patch: "@@ -0,0 +1 @@\n+import {Text} from '@astryxdesign/core/Text';",
    };
    expect(
      (await decide({files: [...component, coreOnlyStory]})).outputs.lab_only,
    ).toBe('false');
  });
});

describe('the temporary policy folder', () => {
  // os.tmpdir() reads TMPDIR on each call, so each case gets its own folder.
  async function inFreshTemp(run) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-tmp-test-'));
    const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-runner-'));
    const saved = {
      TMPDIR: process.env.TMPDIR,
      RUNNER_TEMP: process.env.RUNNER_TEMP,
    };
    process.env.TMPDIR = temp;
    process.env.RUNNER_TEMP = runnerTemp;
    try {
      const result = await run();
      return {result, left: fs.readdirSync(temp)};
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(temp, {recursive: true, force: true});
      fs.rmSync(runnerTemp, {recursive: true, force: true});
    }
  }

  it('is removed after a decided scope', async () => {
    const {result, left} = await inFreshTemp(() =>
      decide({files: changed('packages/core/src/Button/Button.tsx')}),
    );
    expect(result.outputs.decided).toBe('true');
    expect(left).toEqual([]);
  });

  it('is removed when a base policy file cannot be read', async () => {
    const {result, left} = await inFreshTemp(() =>
      decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        truncated: ['scripts/component-packages.cjs'],
      }),
    );
    expect(result.outputs.decided).toBe('false');
    expect(left).toEqual([]);
  });

  it('is removed when the trusted classifier rejects the change', async () => {
    const {result, left} = await inFreshTemp(() =>
      decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        baseOverrides: {
          '.github/scripts/change-scope.cjs': 'process.exit(1);\n',
        },
      }),
    );
    expect(result.messages.failed).toHaveLength(1);
    expect(left).toEqual([]);
  });

  it('is removed after a component-audit scope, while the changed-file list stays for later steps', async () => {
    const {result, left} = await inFreshTemp(() =>
      decide({
        files: changed('packages/core/src/Button/Button.tsx'),
        inputs: {'component-audit': 'true'},
      }).then(r => ({
        ...r,
        listed: fs.existsSync(r.outputs.changed_files_path),
      })),
    );
    expect(result.listed).toBe(true);
    expect(left).toEqual([]);
  });
});

describe('the contract job on a pull request GitHub truncates', () => {
  it('lists every file and runs, never fails, on an undecided scope', async () => {
    const ci = yaml.parse(
      fs.readFileSync(
        path.join(import.meta.dirname, '../workflows/ci.yml'),
        'utf8',
      ),
    );
    const job = ci.jobs['pr-component-a11y-contracts'];
    const scopeStep = job.steps.find(step => step.id === 'scope');
    const {outputs} = await decide({
      files: Array.from({length: 3001}, (_, i) => ({
        filename: `packages/core/src/Button/file${i}.tsx`,
        status: 'modified',
      })),
      inputs: scopeStep.with,
    });
    expect(outputs).toMatchObject({applies: 'true', decided: 'false'});
    expect(outputs.changed_files_path ?? '').toBe('');
    // The workflow's own conditions, read against these outputs.
    const holds = condition =>
      Function(
        'outputs',
        `return (${condition
          .replace(
            /steps\.scope\.outputs\.(\w+)/g,
            (_, key) => `(outputs.${key} ?? '')`,
          )
          .replace(/ == /g, ' === ')
          .replace(/ != /g, ' !== ')});`,
      )(outputs);
    const step = name => job.steps.find(candidate => candidate.name === name);
    expect(holds(step('Require the changed-file list').if)).toBe(false);
    expect(holds(step('List every file when the scope is undecided').if)).toBe(
      true,
    );
  });
});
