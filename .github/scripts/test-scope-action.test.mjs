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
  runs = [],
  earlierFiles = [],
  headParents = 2,
  env: extraEnv = {},
} = {}) {
  const outputs = {};
  const messages = {info: [], warning: [], notice: [], failed: []};
  const contentCalls = [];
  const apiCalls = [];
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
  const github = {
    graphql: async (query, variables) => {
      apiCalls.push({graphql: variables});
      if (headParents instanceof Error) throw headParents;
      return {repository: {object: {parents: {totalCount: headParents}}}};
    },
    paginate: async () => {
      if (files instanceof Error) throw files;
      return files;
    },
    rest: {
      pulls: {listFiles: () => {}},
      actions: {
        listWorkflowRuns: async params => {
          apiCalls.push({listWorkflowRuns: params});
          if (runs instanceof Error) throw runs;
          return {data: {workflow_runs: runs}};
        },
      },
      repos: {
        compareCommitsWithBasehead: async params => {
          apiCalls.push({compare: params});
          if (earlierFiles instanceof Error) throw earlierFiles;
          return {data: {files: earlierFiles}};
        },
        getContent: async ({path: file, ref}) => {
          contentCalls.push({file, ref});
          if (
            ref === BASE_SHA &&
            (CLASSIFIER_FILES.has(file) || file === AUDIT_FILE)
          ) {
            if (missingBase.includes(file)) throw notFound();
            if (file in baseOverrides) {
              return {
                data: {
                  content: Buffer.from(baseOverrides[file]).toString('base64'),
                },
              };
            }
            return {
              data: {
                content: fs
                  .readFileSync(path.join(root, file))
                  .toString('base64'),
              },
            };
          }
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
    SCOPE_CARRY_FORWARD: inputs['carry-forward'] ?? 'false',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/ci.yml@refs/pull/7/merge',
    ...extraEnv,
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
  return {outputs, messages, contentCalls, apiCalls};
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
        'carried',
        'carried_from',
        'changed_files_path',
        'decided',
        'docsite_only',
        'force_full_component_audits',
        'full_suite',
        'has_components',
        'has_rtl_components',
        'has_rtl_harness',
        'release_bump',
        'spec_only',
        'tooling_only',
        'touches',
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

  it('marks a release-branch pull request as the generated version bump', async () => {
    const {outputs} = await decide({
      context: pullRequestContext('release/v1.2.3'),
    });
    expect(outputs).toMatchObject({
      release_bump: 'true',
      spec_only: 'true',
      tooling_only: 'true',
      applies: 'false',
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
  ])('puts everything in scope when %s', async (_, options) => {
    const {outputs, messages} = await decide({
      ...options,
      inputs: {paths: INTERACTION_PATHS},
    });
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

    it('applies no audit to a release-branch pull request', async () => {
      const {outputs} = await decide({
        context: pullRequestContext('release/v1.2.3'),
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

describe('carrying a passing result forward (spec:AST-030 FR18)', () => {
  const EARLIER = 'e'.repeat(40);
  const file = (filename, extra = {}) => ({
    filename,
    status: 'modified',
    sha: `blob-${filename}`,
    patch: `@@ -1 +1 @@\n-old ${filename}\n+new ${filename}`,
    ...extra,
  });
  const ownFiles = [file('packages/core/src/Button/Button.tsx')];
  const pushContext = ({
    action = 'synchronize',
    fork = false,
    before = EARLIER,
  } = {}) => {
    const context = pullRequestContext();
    context.runId = 99;
    context.payload.action = action;
    context.payload.before = before;
    Object.assign(context.payload.pull_request, {
      number: 7,
      head: {
        sha: HEAD_SHA,
        ref: 'fix/button',
        repo: {full_name: fork ? 'someone/r' : 'o/r'},
      },
    });
    return context;
  };
  const run = (overrides = {}) => ({
    id: 41,
    head_sha: EARLIER,
    head_repository: {full_name: 'o/r'},
    head_branch: 'fix/button',
    pull_requests: [],
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/o/r/actions/runs/41',
    ...overrides,
  });
  const carry = ({action, fork, before, inputs = {}, ...rest} = {}) =>
    decide({
      context: pushContext({action, fork, before}),
      files: ownFiles,
      inputs: {'carry-forward': 'true', ...inputs},
      runs: [run()],
      earlierFiles: ownFiles,
      ...rest,
    });

  it('carries the last passing run forward when the push only merged the base branch', async () => {
    const {outputs, messages, apiCalls} = await carry();
    expect(outputs).toMatchObject({
      carried: 'true',
      carried_from: `run 41 at ${EARLIER}`,
      applies: 'false',
    });
    expect(messages.notice).toEqual([
      `Carried forward from run 41 at ${EARLIER} (https://github.com/o/r/actions/runs/41): this push only merges main, and the pull request's own diff is unchanged. The pre-merge re-run runs everything.`,
    ]);
    expect(apiCalls).toEqual([
      {graphql: {owner: 'o', repo: 'r', oid: HEAD_SHA}},
      {compare: {owner: 'o', repo: 'r', basehead: `${BASE_SHA}...${EARLIER}`}},
      {
        listWorkflowRuns: {
          owner: 'o',
          repo: 'r',
          workflow_id: 'ci.yml',
          event: 'pull_request',
          head_sha: EARLIER,
          per_page: 10,
        },
      },
    ]);
  });

  it('compares the diff in any file order', async () => {
    const two = [file('a.ts'), file('b.ts')];
    const {outputs} = await carry({
      files: two,
      earlierFiles: [...two].reverse(),
    });
    expect(outputs.carried).toBe('true');
  });

  it("looks past the previous head's cancelled, skipped and unfinished runs to its last completed one", async () => {
    const {outputs} = await carry({
      runs: [
        run({id: 44, conclusion: 'cancelled'}),
        run({id: 43, conclusion: 'skipped'}),
        run({id: 42, status: 'in_progress', conclusion: null}),
        run(),
      ],
    });
    expect(outputs.carried_from).toBe(`run 41 at ${EARLIER}`);
  });

  it("ignores another branch's or another repository's run on the previous head", async () => {
    const {outputs} = await carry({
      runs: [
        run({id: 44, conclusion: 'failure', head_branch: 'other'}),
        run({
          id: 43,
          conclusion: 'failure',
          head_repository: {full_name: 'someone/r'},
        }),
        run(),
      ],
    });
    expect(outputs.carried_from).toBe(`run 41 at ${EARLIER}`);
  });

  it('makes no REST call when the head is not a merge commit', async () => {
    const {outputs, apiCalls} = await carry({headParents: 1});
    expect(outputs.carried).toBe('false');
    expect(apiCalls).toEqual([
      {graphql: {owner: 'o', repo: 'r', oid: HEAD_SHA}},
    ]);
  });

  it('stops after the comparison when the merge changed the diff', async () => {
    const {outputs, apiCalls} = await carry({earlierFiles: [file('other.ts')]});
    expect(outputs.carried).toBe('false');
    expect(apiCalls.map(call => Object.keys(call)[0])).toEqual([
      'graphql',
      'compare',
    ]);
  });

  it("identifies a fork's runs by its repository and branch", async () => {
    const {outputs} = await carry({
      fork: true,
      runs: [
        run({head_repository: {full_name: 'someone/r'}, pull_requests: []}),
      ],
    });
    expect(outputs.carried).toBe('true');
  });

  it.each([
    [
      'the last completed run on the previous head failed',
      {runs: [run({id: 42, conclusion: 'failure'}), run()]},
    ],
    [
      'the previous head has only a cancelled run',
      {runs: [run({conclusion: 'cancelled'})]},
    ],
    ['the previous head has no run', {runs: []}],
    ['the push names no previous head', {before: ''}],
    [
      'a patch changed',
      {
        earlierFiles: [
          file('packages/core/src/Button/Button.tsx', {
            patch: '@@ -2 +2 @@\n-old\n+new',
          }),
        ],
      },
    ],
    [
      'the base branch changed a file the pull request changes',
      {
        earlierFiles: [
          file('packages/core/src/Button/Button.tsx', {sha: 'older-blob'}),
        ],
      },
    ],
    ['a file was added', {earlierFiles: []}],
    [
      'a file was renamed',
      {
        earlierFiles: [
          file('packages/core/src/Button/Button.tsx', {
            status: 'renamed',
            previous_filename: 'old.tsx',
          }),
        ],
      },
    ],
    [
      'the comparison is truncated',
      {earlierFiles: Array.from({length: 300}, (_, i) => file(`f${i}.ts`))},
    ],
    ['the job does not opt in', {inputs: {'carry-forward': 'false'}}],
    ['the pull request was opened', {action: 'opened'}],
    ['the pull request was reopened', {action: 'reopened'}],
    ['the pull request was marked ready', {action: 'ready_for_review'}],
    ['it is the pre-merge re-run', {env: {GITHUB_RUN_ATTEMPT: '2'}}],
    ['the workflow is unknown', {env: {GITHUB_WORKFLOW_REF: ''}}],
  ])('runs the job when %s', async (_, options) => {
    const {outputs, messages} = await carry(options);
    expect(outputs).toMatchObject({
      carried: 'false',
      carried_from: '',
      applies: 'true',
    });
    expect(messages.notice).toEqual([]);
  });

  it.each([
    [
      'the runs cannot be read',
      {
        runs: Object.assign(
          new Error('Resource not accessible by integration'),
          {status: 403},
        ),
      },
    ],
    [
      'the comparison fails',
      {earlierFiles: Object.assign(new Error('Server Error'), {status: 500})},
    ],
  ])('runs the job, with a warning, when %s', async (_, options) => {
    const {outputs, messages} = await carry(options);
    expect(outputs).toMatchObject({carried: 'false', applies: 'true'});
    expect(messages.warning).toEqual([
      expect.stringMatching(
        /^Could not compare with the last run \(.+\); running this job\.$/,
      ),
    ]);
  });

  it('makes no extra calls for a job that does not opt in', async () => {
    const {apiCalls} = await carry({inputs: {'carry-forward': 'false'}});
    expect(apiCalls).toEqual([]);
  });

  it('keeps the classification it reports', async () => {
    const {outputs} = await carry();
    expect(outputs).toMatchObject({
      spec_only: 'false',
      docsite_only: 'false',
      decided: 'true',
    });
  });
});
