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
  const github = {
    paginate: async () => {
      if (files instanceof Error) throw files;
      return files;
    },
    rest: {
      pulls: {listFiles: () => {}},
      repos: {
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
  return {outputs, messages, contentCalls};
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
