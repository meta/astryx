// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-test-routing.test.mjs
 *
 * The contract between `vitest.config.ts` and the CI jobs that run it, in both
 * workflows that run the suite. FR23 must run after the other UI workers exit
 * so its helper-overhead measurement does not compete with unrelated tests.
 *
 * This repo has now lost test coverage to routing twice. First a suite
 * belonged to no Vitest project, so `pnpm test` never collected it. Then the
 * single `test` job that ran every project at once was terminated around 20
 * minutes with no summary — `main` was already at ~19m15, so the budget was
 * the defect, not any one test. `deploy.yml`'s push gate carried strictly more
 * than that: the same suite plus a full build plus eight typecheck gates.
 *
 * Both now run the projects as parallel lanes joined by `test`. That only
 * holds if every project has a lane in every workflow: a third project added
 * to the config with no job to run it would be collected by nobody and fail
 * nothing — the first failure again, one level up.
 *
 * The lanes call root package scripts (`pnpm test:ui`, `pnpm test:node`), so
 * the commands are checked with each script expanded to its body.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import componentPackages from '../../scripts/component-packages.cjs';

const {COMPONENT_PACKAGE_NAMES} = componentPackages;

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

/** The `name:` of every project declared in the root Vitest config. */
function declaredProjects() {
  return [...read('vitest.config.ts').matchAll(/^\s*name:\s*'([^']+)'/gm)].map(
    match => match[1],
  );
}

/**
 * The runner labels this repo is known to have.
 *
 * Deliberately a FIXED list, not one scraped from the workflow under test. A
 * self-derived allowlist is vacuous: a typo'd label appears in the file, so it
 * appears in the set, so it validates itself and the job queues forever
 * against a runner that does not exist. Adding a genuinely new label is a
 * deliberate edit here.
 */
const KNOWN_RUNNERS = new Set([
  'ubuntu-24.04-arm',
  'ubuntu-slim',
  'ubuntu-latest',
]);

const WORKFLOWS = {
  'ci.yml': {
    lanes: ['test-ui', 'test-node'],
    // A PR that only touches docs skips the suite but must still report.
    scopeConditional: true,
    // A pull request the import graph can scope runs only related tests.
    graphScoped: true,
    // Each Vitest lane splits its project across matrix legs.
    sharded: true,
  },
  'deploy.yml': {
    // The push gate also owns the build + typecheck gates, which need each
    // other and so ride one lane of their own.
    lanes: ['test-ui', 'test-node', 'typecheck'],
    scopeConditional: false,
    // The push to main runs every test.
    graphScoped: false,
    sharded: true,
  },
};

const SHARD_ARG = '--shard=${{ matrix.shard }}/${{ strategy.job-total }}';

function load(file) {
  return yaml.parse(read(`.github/workflows/${file}`));
}

const rootScripts = JSON.parse(read('package.json')).scripts;

/**
 * A run block with each `pnpm <root script>` replaced by the script's body,
 * recursively; arguments after the script name stay after its body.
 */
function expandScripts(run) {
  return run.replace(/\bpnpm ([a-z][\w:-]*)(?=\s|$)/g, (whole, name) =>
    Object.hasOwn(rootScripts, name) ? expandScripts(rootScripts[name]) : whole,
  );
}

function runLines(job) {
  return (job?.steps ?? [])
    .map(step => step.run)
    .filter(Boolean)
    .map(expandScripts)
    .join('\n');
}

describe.each(Object.entries(WORKFLOWS))(
  '%s test routing',
  (file, {lanes, scopeConditional, graphScoped, sharded}) => {
    const workflow = load(file);

    it('gives the Node suite more than one Vitest worker', () => {
      // Vitest uses one worker per CPU beyond the first: on two cores the
      // suite would run one file at a time.
      expect(workflow.jobs['test-node']['runs-on']).toBe('ubuntu-latest');
    });

    it('runs every declared Vitest project in some lane', () => {
      const projects = declaredProjects();
      expect(projects.length).toBeGreaterThan(0);

      const commands = lanes
        .map(lane => runLines(workflow.jobs[lane]))
        .join('\n');
      for (const project of projects) {
        expect(commands, `no lane runs --project ${project}`).toContain(
          `--project ${project}`,
        );
      }
    });

    it('assigns each project to exactly one lane', () => {
      for (const project of declaredProjects()) {
        const owners = lanes.filter(lane =>
          runLines(workflow.jobs[lane]).includes(`--project ${project}`),
        );
        expect(
          owners,
          `--project ${project} runs in ${owners.length} lanes`,
        ).toHaveLength(1);
      }
    });

    it('runs FR23 only after the parallel UI suite has exited', () => {
      const benchmark = 'packages/core/src/Markdown/Markdown.fr23.perf.test.ts';
      const job = workflow.jobs['test-ui'];
      const suites = job.steps.filter(step =>
        expandScripts(step.run ?? '').includes('--project ui'),
      );
      // The two package scripts every lane calls: the parallel suite without
      // FR23, and FR23 alone with no file parallelism.
      expect(rootScripts['test:ui']).toBe(
        `vitest run --project ui --exclude ${benchmark}`,
      );
      expect(rootScripts['test:ui:isolated']).toBe(
        `vitest run --project ui ${benchmark} --no-file-parallelism`,
      );
      expect(job['continue-on-error']).not.toBe(true);
      for (const suite of suites) {
        expect(suite['continue-on-error']).not.toBe(true);
      }

      // Sharded: every leg runs its share without FR23, and exactly one leg
      // runs FR23 in a later step on the same runner, after its share exited.
      expect(suites).toHaveLength(2);
      const [share, isolated] = suites;
      // Its share is the full UI project, or for a scoped pull request the
      // tests related to its diff (the scope step's full_suite).
      if (graphScoped) {
        expect(share.run.trim()).toBe(
          [
            'if [ "$SCOPED" = true ]; then',
            `  pnpm test:ui --changed=HEAD^1 --passWithNoTests ${SHARD_ARG}`,
            '  # Tests no module graph relates to the change run too: guards',
            '  # that read sources, and tests that load a changed package from',
            '  # its build (by name or its dist/).',
            '  # The list goes through a file so a failing lister fails the step.',
            '  node .github/scripts/fs-guard-tests.mjs --changed HEAD^1 > "$RUNNER_TEMP/fs-guards.txt"',
            '  mapfile -t GUARDS < "$RUNNER_TEMP/fs-guards.txt"',
            '  if [ "${#GUARDS[@]}" -gt 0 ]; then',
            `    pnpm test:ui --passWithNoTests ${SHARD_ARG} "\${GUARDS[@]}"`,
            '  fi',
            'else',
            `  pnpm test:ui ${SHARD_ARG}`,
            'fi',
          ].join('\n'),
        );
        expect(share.env.SCOPED).toBe(
          "${{ github.event_name == 'pull_request' && steps.scope.outputs.full_suite == 'false' }}",
        );
        // The Node lane runs the same scoped share, guards included.
        const node = workflow.jobs['test-node'].steps.find(
          step => step.name === 'Run this shard of the Node tests',
        );
        expect(node.run.trim()).toBe(
          [
            'if [ "$SCOPED" = true ]; then',
            `  pnpm test:node --changed=HEAD^1 --passWithNoTests ${SHARD_ARG}`,
            '  # Tests no module graph relates to the change run too: guards',
            '  # that read sources, and tests that load a changed package from',
            '  # its build (by name or its dist/).',
            '  # The list goes through a file so a failing lister fails the step.',
            '  node .github/scripts/fs-guard-tests.mjs --changed HEAD^1 > "$RUNNER_TEMP/fs-guards.txt"',
            '  mapfile -t GUARDS < "$RUNNER_TEMP/fs-guards.txt"',
            '  if [ "${#GUARDS[@]}" -gt 0 ]; then',
            `    pnpm test:node --passWithNoTests ${SHARD_ARG} "\${GUARDS[@]}"`,
            '  fi',
            'else',
            `  pnpm test:node ${SHARD_ARG}`,
            'fi',
          ].join('\n'),
        );
        expect(node.env.SCOPED).toBe(share.env.SCOPED);
      } else {
        expect(share.run.trim()).toBe(`pnpm test:ui ${SHARD_ARG}`);
      }
      expect(isolated.run.trim()).toBe('pnpm test:ui:isolated');
      expect(job.steps.indexOf(isolated)).toBeGreaterThan(
        job.steps.indexOf(share),
      );
      expect(isolated.if).toBe(
        share.if ? `matrix.shard == 1 && ${share.if}` : 'matrix.shard == 1',
      );
    });

    if (sharded) {
      it('splits each Vitest lane across legs that together run every file', () => {
        const vitestLanes = lanes.filter(lane =>
          /--project \w+/.test(runLines(workflow.jobs[lane])),
        );
        expect(vitestLanes).toEqual(['test-ui', 'test-node']);
        for (const lane of vitestLanes) {
          const job = workflow.jobs[lane];
          const legs = job.strategy?.matrix?.shard;
          expect(Array.isArray(legs), `${lane} has no shard matrix`).toBe(true);
          // Legs are numbered 1..n exactly once, so --shard i/n covers all n.
          expect(legs).toEqual(
            Array.from({length: legs.length}, (_, index) => index + 1),
          );
          expect(Object.keys(job.strategy.matrix)).toEqual(['shard']);
          expect(job.strategy['fail-fast']).toBe(false);
          const suites = job.steps.filter(step =>
            /--project \w+/.test(expandScripts(step.run ?? '')),
          );
          // The one step that is not sharded is the isolated FR23 benchmark.
          const unsharded = suites.filter(
            step => !step.run.includes(SHARD_ARG),
          );
          for (const step of unsharded) {
            expect(expandScripts(step.run)).toContain(
              'Markdown.fr23.perf.test.ts',
            );
          }
          expect(suites.length - unsharded.length).toBe(1);
        }
      });
    }

    it('gives no lane the whole suite', () => {
      // A bare `pnpm test` runs every project in one job — the shape that hit
      // the wall. Checked on the steps as written: expanded, it is just
      // `vitest run`.
      for (const lane of lanes) {
        const raw = (workflow.jobs[lane]?.steps ?? [])
          .map(step => step.run ?? '')
          .join('\n');
        expect(raw, `${lane} runs the whole suite`).not.toMatch(
          /^\s*pnpm test\s*$/m,
        );
      }
    });

    it('keeps `test` as a job so its context still reports', () => {
      // In ci.yml this is a required status check; in deploy.yml the `deploy`
      // job gates the publish on `needs.test.result`. Renaming it silently
      // breaks whichever one applies.
      expect(workflow.jobs.test).toBeDefined();
      expect(workflow.jobs.test.needs).toEqual(expect.arrayContaining(lanes));
    });

    it('fails the join when any lane fails', () => {
      // `needs` alone does not fail a job whose `if` is `always()`; the join
      // has to pass every result to its fail-closed contract.
      const join = workflow.jobs.test;
      if (file === 'ci.yml') {
        const contract = join.steps.find(step =>
          step.run?.includes('.github/scripts/ci-test-join.mjs'),
        );
        expect(contract).toBeDefined();
        for (const lane of lanes) {
          const key = `${lane.replaceAll('-', '_').toUpperCase()}_RESULT`;
          expect(contract.env[key], `join does not pass ${lane}`).toContain(
            `needs.${lane}.result`,
          );
        }
      } else {
        const commands = runLines(join);
        for (const lane of lanes) {
          expect(commands, `join does not assert ${lane}`).toContain(
            `needs.${lane}.result }}" = "success"`,
          );
        }
      }
    });

    it('runs every lane on a known runner label', () => {
      for (const job of [...lanes, 'test']) {
        const label = workflow.jobs[job]['runs-on'];
        expect(
          KNOWN_RUNNERS.has(label),
          `${job} uses unknown runner label "${label}"`,
        ).toBe(true);
      }
    });

    if (scopeConditional) {
      it('keeps the lightweight-docs skip on every lane', () => {
        for (const lane of lanes) {
          // Each lane decides its own scope; there is no scope job to wait on.
          expect(
            workflow.jobs[lane].steps.some(step => step.id === 'scope'),
            `${lane} has no scope step`,
          ).toBe(true);
          const steps = workflow.jobs[lane].steps;
          const suite = steps.find(step =>
            expandScripts(step.run ?? '').includes('--project'),
          );
          expect(suite.if, `${lane} suite is unconditional`).toContain(
            "docsite_only != 'true'",
          );
          expect(suite.if, `${lane} suite is unconditional`).toContain(
            "spec_only != 'true'",
          );
          // A scope step that fails (a classifier rejecting the change)
          // fails the lane; nothing lets the suite skip past it.
          expect(
            steps.some(
              step => step.id === 'scope' && step['continue-on-error'] !== true,
            ),
            `${lane} does not guard against an unclassified scope`,
          ).toBe(true);
        }
      });
    }
  },
);

describe('ci.yml pr-a11y browser specs', () => {
  const steps = load('ci.yml').jobs['pr-a11y-specs'].steps;
  const run = steps.find(
    step => step.name === 'Run browser accessibility specs',
  );
  const upload = steps.find(
    step => step.name === 'Upload browser accessibility evidence',
  );

  // Specs are discovered, never listed: a step naming one spec file is the
  // per-test workflow edit this lane exists to avoid.
  it('names no spec file in any step', () => {
    for (const step of steps) {
      expect(step.run ?? '', step.name).not.toMatch(
        /\.spec\.(ts|tsx|js|mjs)\b/,
      );
    }
  });

  it("runs the merge commit's runner against the PR head", () => {
    expect(run.if).toBe(
      "(!cancelled()) && steps.scope.outputs.has_components == 'true'",
    );
    // The merge commit the steps come from, not the PR's recorded base, which
    // can lag main and predate the runner.
    expect(run.env.WORKFLOW_SHA).toBe('${{ github.sha }}');
    expect(run.env.BASE_SHA).toBe('${{ github.event.pull_request.base.sha }}');
    expect(run.env.PR_TITLE).toBe('${{ github.event.pull_request.title }}');
    expect(run.run).toContain(
      'git show "$WORKFLOW_SHA:.github/scripts/a11y-pr-contracts.mjs" > "$runner"',
    );
    expect(run.run).toContain('node "$runner"');
    expect(
      JSON.parse(read('package.json')).scripts['test:a11y-contract:pr'],
    ).toBe('node .github/scripts/a11y-pr-contracts.mjs');
  });

  it('uploads every spec receipt in one head-bound artifact', () => {
    expect(upload.if).toBe(
      "(!cancelled()) && steps.scope.outputs.has_components == 'true'",
    );
    expect(upload.with.name).toBe(
      'pr-a11y-evidence-${{ needs.build-storybook.outputs.short_hash }}',
    );
    for (const dir of [
      'pr-a11y-evidence/',
      'pr-a11y-output/',
      'test-results/',
      '*-audit-evidence/',
    ]) {
      expect(upload.with.path).toContain(dir);
    }
    expect(steps.indexOf(upload)).toBeGreaterThan(steps.indexOf(run));
  });
});

describe('ci.yml RTL package sharding', () => {
  const workflow = load('ci.yml');
  const shard = workflow.jobs['pr-rtl-shard'];
  const join = workflow.jobs['pr-rtl'];

  it('decides component scope inside each audit job, with no classification job', () => {
    expect(workflow.jobs['check-components']).toBeUndefined();
    for (const job of Object.values(workflow.jobs)) {
      expect(JSON.stringify(job)).not.toContain('needs.check-components');
    }
    // Every job that reads the step's audit outputs asks for them: without
    // `component-audit`, those outputs are missing and the job would skip its
    // audits while reporting success.
    const auditOutput =
      /steps\.scope\.outputs\.(has_components|has_rtl_components|has_rtl_harness|force_full_component_audits|changed_files_path)/;
    const readers = Object.entries(workflow.jobs).filter(([, job]) =>
      auditOutput.test(JSON.stringify(job)),
    );
    expect(readers.map(([name]) => name).sort()).toEqual(
      [
        'pr-a11y-guards',
        'pr-a11y-specs',
        'pr-rtl',
        'pr-rtl-merge',
        'pr-rtl-shard',
        'pr-visual',
        'visual-scout',
      ].sort(),
    );
    for (const [name, job] of readers) {
      const scope = job.steps.find(step => step.id === 'scope');
      expect(scope.with?.['component-audit'], name).toBe('true');
    }
    expect(runLines(shard)).toContain(
      '--force-full "${{ steps.scope.outputs.force_full_component_audits }}"',
    );
    expect(runLines(shard)).toContain(
      '--has-components "${{ steps.scope.outputs.has_rtl_components }}"',
    );
    expect(runLines(shard)).toContain(
      '--has-harness "${{ steps.scope.outputs.has_rtl_harness }}"',
    );
  });

  it('binds component evidence source, Storybook bytes, and RTL code to the PR head', () => {
    const exactRef = '${{ github.event.pull_request.head.sha || github.sha }}';
    for (const name of [
      'build-storybook',
      'pr-a11y-shard',
      'pr-a11y-guards',
      'pr-a11y-specs',
      'a11y-contracts-shard',
      'pr-rtl-shard',
    ]) {
      const checkout = workflow.jobs[name].steps.find(
        candidate =>
          candidate.uses?.startsWith('actions/checkout@') &&
          candidate.with?.path !== '.test-scope',
      );
      expect(checkout?.with?.ref, `${name} checkout is not exact-head`).toBe(
        exactRef,
      );
    }
    const storybookVerify = workflow.jobs['build-storybook'].steps.find(
      candidate => candidate.name === 'Verify Storybook source checkout',
    );
    expect(storybookVerify.if).toContain(
      "steps.scope.outputs.tooling_only != 'true'",
    );
    expect(runLines(workflow.jobs['build-storybook'])).toContain(
      'astryx-build-sha.txt',
    );
    for (const name of ['pr-a11y-guards', 'pr-a11y-specs']) {
      expect(runLines(workflow.jobs[name]), name).toContain(
        'git rev-parse HEAD',
      );
    }
    expect(runLines(shard)).toContain('git rev-parse HEAD');

    const evidence = read(
      'packages/core/src/Chat/__tests__/ChatMessageBubble.a11y.chromium.spec.ts',
    );
    const provenance = read(
      'packages/core/src/Chat/__tests__/ChatMessageBubble.auditProvenance.ts',
    );
    expect(evidence).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
    expect(evidence).toContain('resolveChatMessageBubbleAuditProvenance');
    expect(provenance).toContain('/astryx-build-sha.txt');
    expect(provenance).toContain('storybookSha !== checkoutSha');
    expect(provenance).toContain("mode: 'local-unstamped'");
  });

  it('keeps PR accessibility scoped while RTL retains its canonical resolver', () => {
    expect(runLines(workflow.jobs['pr-a11y-guards'])).toContain(
      '.github/scripts/a11y-pr-scope.mjs',
    );
    expect(runLines(workflow.jobs['pr-a11y-guards'])).toContain(
      'SCOPE_ARGS=(--components "$COMPONENTS")',
    );
    expect(runLines(shard)).toContain('.github/scripts/rtl-shard-scope.mjs');
  });

  it('runs one bounded shard for every canonical component package', () => {
    const legs = shard.strategy.matrix.include;
    expect([...new Set(legs.map(leg => leg.package))]).toEqual([
      ...COMPONENT_PACKAGE_NAMES,
    ]);
    // Each package's parts are numbered 1..parts exactly once.
    for (const name of COMPONENT_PACKAGE_NAMES) {
      const parts = legs.filter(leg => leg.package === name);
      expect(parts.map(leg => leg.part)).toEqual(
        Array.from({length: parts[0].parts}, (_, index) => index + 1),
      );
      expect(new Set(parts.map(leg => leg.parts)).size).toBe(1);
    }
    // Standard runner for pull requests; a dispatched release gate takes the
    // paid release pool (ci-free-runners.test.mjs).
    expect(shard['runs-on']).toContain("|| 'ubuntu-latest'");
    // Pull requests get the 15-minute PR budget; the full release roster, 30.
    expect(shard['timeout-minutes']).toBe(
      "${{ github.event_name == 'workflow_dispatch' && 30 || 15 }}",
    );
    expect(shard['continue-on-error']).not.toBe(true);
    const scope = shard.steps.find(
      step => step.name === 'Resolve RTL shard scope',
    );
    const audit = shard.steps.find(step => step.name === 'Run RTL audit');
    const validation = shard.steps.find(
      step => step.name === 'Require completed RTL shard report',
    );
    expect(scope['continue-on-error']).not.toBe(true);
    expect(scope.run).toContain('.github/scripts/rtl-shard-scope.mjs');
    expect(scope.run).toContain('--manifest rtl-shard-scope.json');
    expect(audit.if).toContain("steps.rtl-scope.outputs.should_run == 'true'");
    expect(audit['continue-on-error']).toBe(true);
    expect(validation.if).toBe(
      "always() && (steps.scope.outputs.has_rtl_components == 'true' || steps.scope.outputs.has_rtl_harness == 'true' || steps.scope.outputs.force_full_component_audits == 'true')",
    );
    expect(validation.run).toContain('steps.rtl-scope.outcome');
    expect(validation.run).toContain(
      'produced no explicit should_run decision',
    );
    expect(runLines(shard)).toContain('--packages "$PACKAGE"');
    expect(runLines(shard)).toContain('--concurrency 8');
    expect(runLines(shard)).toContain(
      '.github/scripts/rtl-report-completion.mjs',
    );
    expect(runLines(shard)).toContain(
      '--filter "${{ steps.rtl-scope.outputs.filter }}"',
    );
  });

  it('keeps pr-rtl as a fail-closed join over every matrix shard', () => {
    expect(join.needs).toEqual(expect.arrayContaining(['pr-rtl-shard']));
    const commands = runLines(join);
    expect(commands).toContain('needs.pr-rtl-shard.result');
    expect(commands).toContain('.github/scripts/rtl-join.mjs');
    expect(commands).toContain('--reports-dir rtl-shard-reports');
    expect(commands).toContain(
      '--force-full "${{ steps.scope.outputs.force_full_component_audits }}"',
    );
    expect(commands).toContain(
      '--check-components "${{ steps.scope.outcome }}"',
    );
    const download = join.steps.find(
      step => step.name === 'Download applicable RTL shard reports',
    );
    expect(download['continue-on-error']).toBe(true);
    expect(download.with.pattern).toBe('rtl-audit-report-*');
    const requireStep = join.steps.find(
      step => step.name === 'Require every applicable RTL shard',
    );
    expect(requireStep.if).toBe('always()');
  });

  it('publishes a distinct scope manifest and optional report for each shard', () => {
    const upload = shard.steps.find(
      step => step.name === 'Upload RTL shard evidence',
    );
    expect(upload.if).toBe(
      "(always() && matrix.parts == 1) && (steps.scope.outputs.has_rtl_components == 'true' || steps.scope.outputs.has_rtl_harness == 'true' || steps.scope.outputs.force_full_component_audits == 'true')",
    );
    expect(upload.with.name).toBe('rtl-audit-report-${{ matrix.package }}');
    expect(upload.with.path).toContain('rtl-shard-scope.json');
    expect(upload.with.path).toContain('rtl-audit-report.json');
    expect(upload.with['if-no-files-found']).toBe('error');
    const part = shard.steps.find(step => step.name === 'Upload RTL part');
    expect(part.if).toBe(
      "(always() && matrix.parts > 1) && (steps.scope.outputs.has_rtl_components == 'true' || steps.scope.outputs.has_rtl_harness == 'true' || steps.scope.outputs.force_full_component_audits == 'true')",
    );
    expect(part.with.name).toBe(
      'rtl-audit-part-${{ matrix.package }}-${{ matrix.part }}',
    );
    expect(part.with['if-no-files-found']).toBe('error');
  });

  it('joins split packages into the report a whole leg would upload', () => {
    const merge = workflow.jobs['pr-rtl-merge'];
    expect(merge.needs).toContain('pr-rtl-shard');
    expect(merge.if).toContain('always()');
    const commands = runLines(merge);
    expect(commands).toContain('--merge-shards rtl-parts');
    expect(commands).toContain('.github/scripts/rtl-report-completion.mjs');
    expect(commands).toContain(
      'case "$code" in 0|1) ;; *) exit "$code" ;; esac',
    );
    const upload = merge.steps.find(
      step => step.name === 'Upload RTL shard evidence',
    );
    expect(upload.with.name).toBe('rtl-audit-report-core');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(join.needs).toContain('pr-rtl-merge');
    // The join's --shards value: the shared result when the parts and the
    // merge agree (success, or both skipped on an out-of-scope PR), and both
    // results otherwise, which rtl-join.mjs rejects.
    const expression = /--shards "\$\{\{(.*?)\}\}"/.exec(runLines(join))[1];
    const render = (shards, merge) =>
      new Function(
        'S',
        'M',
        `return ${expression
          .replaceAll('needs.pr-rtl-shard.result', 'S')
          .replaceAll('needs.pr-rtl-merge.result', 'M')
          .replaceAll('==', '===')
          .replace("format('{0}/{1}', S, M)", '`${S}/${M}`')};`,
      )(shards, merge);
    expect(render('success', 'success')).toBe('success');
    expect(render('skipped', 'skipped')).toBe('skipped');
    expect(render('success', 'failure')).toBe('success/failure');
    expect(render('failure', 'skipped')).toBe('failure/skipped');
    expect(render('failure', 'failure')).toBe('failure');
  });
});

describe('full component typechecks', () => {
  // Each component package's own sources and tests, in both typecheck lanes:
  // typecheck:docs covers only its .doc.mjs files, so a type error in a test
  // otherwise lands on main unseen (lab's MobileTokenizer.test.tsx did).
  const packages = ['core', 'lab', 'charts', 'richtext', 'vega'];
  const scriptsOf = dir => JSON.parse(read(`${dir}/package.json`)).scripts;

  it.each(['ci.yml', 'deploy.yml'])(
    '%s runs every package typecheck through pnpm typecheck',
    file => {
      const steps = load(file).jobs.typecheck.steps;
      const step = steps.find(candidate =>
        /^\s*pnpm typecheck\s*$/m.test(candidate.run ?? ''),
      );
      expect(step, `${file} does not run pnpm typecheck`).toBeDefined();
      expect(scriptsOf('.').typecheck).toBe(
        'pnpm -r --no-bail --workspace-concurrency=1 --if-present --filter "!@astryxdesign/docsite" --filter "!@astryxdesign/sandbox" run typecheck',
      );
    },
  );

  it.each(packages)(
    "%s's typecheck covers its sources, tests, and docs",
    name => {
      const {typecheck, 'typecheck:docs': docs} = scriptsOf(`packages/${name}`);
      expect(docs).toBe('tsc --project tsconfig.docs.json');
      expect(typecheck).toMatch(
        /^tsc (--project tsconfig\.json )?--noEmit && pnpm typecheck:docs$/,
      );
    },
  );

  it('covers the CLI template docs and strict checkJs', () => {
    expect(scriptsOf('packages/cli').typecheck).toBe(
      'pnpm typecheck:template-docs && pnpm typecheck:strict',
    );
  });

  it('keeps the previous list for a head that predates pnpm typecheck', () => {
    const step = load('ci.yml').jobs.typecheck.steps.find(
      candidate => candidate.name === 'Typecheck every package',
    );
    expect(step.env.WORKFLOW_SHA).toBe('${{ github.sha }}');
    expect(step.run).toContain(
      'git show "$WORKFLOW_SHA:.github/scripts/typecheck-predating-head.sh" > "$legacy"',
    );
    const legacy = read('.github/scripts/typecheck-predating-head.sh');
    for (const name of packages) {
      expect(legacy).toContain(`pnpm -F @astryxdesign/${name} typecheck\n`);
      expect(legacy).toContain(
        `pnpm -F @astryxdesign/${name} typecheck:docs\n`,
      );
    }
  });
});

describe('deploy.yml push gating', () => {
  const workflow = load('deploy.yml');

  it('ends at the stable validation join without a publisher', () => {
    expect(workflow.jobs.deploy).toBeUndefined();
    expect(workflow.jobs.test.needs).toEqual([
      'test-ui',
      'test-node',
      'typecheck',
    ]);
    const join = workflow.jobs.test.steps.find(
      step => step.name === 'Assert every push gate succeeded',
    ).run;
    for (const owner of ['test-ui', 'test-node', 'typecheck']) {
      expect(join).toContain(`needs.${owner}.result`);
    }
  });

  it('keeps the typecheck gates behind the build they need', () => {
    // `typecheck:strict` resolves the built @astryxdesign/* types, so the
    // build has to precede the gates in the SAME lane.
    const steps = workflow.jobs.typecheck.steps.map(step => step.run ?? '');
    const build = steps.findIndex(step => step.trim() === 'pnpm build');
    const strict = steps.findIndex(step => /^pnpm typecheck$/m.test(step));

    expect(build).toBeGreaterThanOrEqual(0);
    expect(strict).toBeGreaterThan(build);
  });

  it('keeps every typecheck gate that guarded main', () => {
    // These exist because a typecheck error can otherwise land on main and
    // break the `build` check on every open PR (#3197).
    const gates = runLines(workflow.jobs.typecheck);
    expect(gates).toContain('scripts/verify-exports.mjs');
    // runLines expands root scripts, so look for the step as written.
    const steps = workflow.jobs.typecheck.steps.map(step => step.run ?? '');
    expect(steps.some(run => /^pnpm typecheck$/m.test(run))).toBe(true);
    expect(gates).toContain('--if-present');
    // Every package that guarded main still defines the script it reaches.
    for (const dir of [
      'packages/core',
      'packages/lab',
      'packages/charts',
      'packages/cli',
      'apps/storybook',
      'internal/a11y-spec',
      'internal/interaction-harness',
    ]) {
      const {typecheck} = JSON.parse(read(`${dir}/package.json`)).scripts;
      expect(typecheck, `${dir} lost its typecheck`).toBeTruthy();
    }
  });

  it('checks out one run-wide main commit on every push-gate lane and leg', () => {
    // A lane that checks out the default ref would gate the wrong commit, and
    // legs that each resolve `main` can straddle a merge and shard different
    // file lists, so one job resolves the commit and every leg checks it out.
    const resolve = workflow.jobs['main-commit'];
    expect(resolve.outputs.sha).toBe('${{ steps.resolve.outputs.sha }}');
    const script = resolve.steps[0].with.script;
    expect(script).toContain('context.sha');
    expect(script).toContain("branch: 'main'");
    for (const lane of ['test-ui', 'test-node', 'typecheck']) {
      expect(workflow.jobs[lane].needs).toEqual(['main-commit']);
      const checkout = workflow.jobs[lane].steps.find(step =>
        step.uses?.startsWith('actions/checkout'),
      );
      expect(checkout?.with?.ref, `${lane} does not pin the run's commit`).toBe(
        '${{ needs.main-commit.outputs.sha }}',
      );
    }
  });
});

describe('ci.yml interaction proofs', () => {
  const workflow = load('ci.yml');
  const job = workflow.jobs['pr-interaction'];
  const step = name => job.steps.find(candidate => candidate.name === name);

  it('runs the interaction config in Chromium against the exact PR head', () => {
    // One fixed runner: out of scope, every step after the scope step skips.
    expect(KNOWN_RUNNERS.has(job['runs-on']), job['runs-on']).toBe(true);
    expect(job.needs).toEqual(['build-storybook']);
    const checkout = job.steps.find(
      candidate =>
        candidate.uses?.startsWith('actions/checkout@') &&
        candidate.with?.path === undefined,
    );
    expect(checkout?.with?.ref).toBe(
      '${{ github.event.pull_request.head.sha }}',
    );
    const run = step('Run interaction proofs').run;
    expect(run).toContain('--config playwright.interaction.config.ts');
    expect(run).toContain('--project chromium');
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts['test:interaction']).toBe(
      'playwright test --config playwright.interaction.config.ts',
    );
  });

  it('runs whenever the harness, its config, a component or a story changes', () => {
    const scope = job.steps.find(candidate => candidate.id === 'scope').with
      .paths;
    for (const path of [
      'internal/interaction-harness/',
      'internal/a11y-spec/',
      'playwright\\.interaction\\.config\\.ts',
      'packages/[^/]+/src/',
      'apps/storybook/',
      '\\.github/workflows/ci\\.yml$',
      'package\\.json$',
      'pnpm-lock\\.yaml$',
    ]) {
      expect(scope).toContain(path);
    }
  });
});

describe('scoped browser audits (spec:AST-030 FR9, FR13)', () => {
  const workflow = load('ci.yml');
  const stepNamed = name => {
    for (const job of Object.values(workflow.jobs)) {
      const step = (job.steps ?? []).find(candidate => candidate.name === name);
      if (step != null) return step;
    }
    throw new Error(`no step named ${name}`);
  };

  it('asks component analysis for full audits unless the scope step reports a scoped suite', () => {
    const analyze = stepNamed('Analyze components');
    expect(analyze.env.FULL_SUITE).toBe(
      '${{ steps.scope.outputs.full_suite }}',
    );
    expect(analyze.run).toContain(
      'if [ "$FULL_SUITE" != false ]; then FORCE_FULL=(--force-full); fi',
    );
    expect(analyze.run).toContain('"${FORCE_FULL[@]}"');
  });

  it('hands the visual gate the folder-level reverse dependents RTL audits, and the whole plan when analysis or the gate asks for it', () => {
    const visual = stepNamed('Run the visual gate for the touched components');
    expect(visual.run).toContain(
      `DEPENDENTS=$(jq -r '[(.dependentComponentFolders // [])[] | select(startswith("core/")) | ltrimstr("core/")] | unique | join(",")' analysis.json)`,
    );
    expect(visual.run).toContain(
      'if [ -n "$DEPENDENTS" ]; then DEPENDENT_ARGS=(--dependents "$DEPENDENTS"); fi',
    );
    expect(visual.run).toContain(
      'SCOPE_ARGS=(--tiers component --components "$COMPONENTS" "${DEPENDENT_ARGS[@]}" --no-scout)',
    );
    expect(visual.run).toContain(
      "FORCE_FULL_AUDITS=$(jq -r '.forceFullComponentAudits == true' analysis.json)",
    );
    expect(visual.run).toContain('[ "$FORCE_FULL_AUDITS" = \'true\' ]');
    // The gate's broaden exit runs the whole plan instead of skipping.
    expect(visual.run).toMatch(
      /if \[ "\$code" = 3 \]; then[\s\S]*?COMMAND=release\s+SCOPE_ARGS=\(\)\s+run_gate/,
    );
  });

  it("scopes the stable visual plan from the PR's own files", () => {
    const visual = stepNamed('Run the visual gate for the touched components');
    expect(visual.env.BROAD_STABLE_VISUAL).toBe(
      '${{ steps.visual-scope.outputs.broad_stable_visual }}',
    );
    expect(visual.if).toContain(
      "steps.visual-scope.outputs.has_stable_visual == 'true'",
    );
    const decide = stepNamed('Decide stable visual scope');
    expect(decide.env.SCOPED).toBe(
      "${{ github.event_name == 'pull_request' && steps.scope.outputs.full_suite == 'false' }}",
    );
    expect(decide.run).toContain(
      'if [ "$SCOPED" = true ]; then VISUAL_ARGS=(--scoped); fi',
    );
    expect(decide.run).toContain(
      'visual-scope.mjs --github-output "$GITHUB_OUTPUT" "${VISUAL_ARGS[@]}"',
    );
  });
});

describe('heavy lanes outside their component scope (spec:AST-030 FR9)', () => {
  const workflow = load('ci.yml');
  const RTL =
    "(steps.scope.outputs.has_rtl_components == 'true' || steps.scope.outputs.has_rtl_harness == 'true' || steps.scope.outputs.force_full_component_audits == 'true')";
  const gates = {
    'pr-a11y-guards': "steps.scope.outputs.has_components == 'true'",
    'pr-a11y-specs': "steps.scope.outputs.has_components == 'true'",
    'pr-rtl-shard': RTL,
    'pr-visual': "steps.visual-scope.outputs.has_stable_visual == 'true'",
  };

  it.each(Object.entries(gates))(
    '%s downloads the PR analysis only inside its component scope',
    (name, gate) => {
      const download = workflow.jobs[name].steps.find(
        step => step.name === 'Download analysis artifact',
      );
      expect(download.if).toContain(gate);
    },
  );

  it('installs nothing for the visual jobs outside their visual scope', () => {
    const scout = workflow.jobs['visual-scout'].steps.find(
      step => step.name === 'Setup Node and pnpm',
    );
    expect(scout.if).toBe(
      "steps.visual-scope.outputs.has_stable_visual == 'true' && steps.visual-scope.outputs.broad_stable_visual == 'true'",
    );
    for (const name of ['Setup Node and pnpm', 'Install Playwright']) {
      const step = workflow.jobs['pr-visual'].steps.find(
        candidate => candidate.name === name,
      );
      expect(step.if, name).toBe(
        "github.event_name != 'pull_request' || steps.visual-scope.outputs.has_stable_visual == 'true'",
      );
    }
  });

  it('gives the full visual plan when the file list is unreadable or there is no pull request', () => {
    const decide = (job, {event, files, specialized = 'false'}) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-scope-'));
      try {
        const output = path.join(dir, 'output');
        const filesPath = path.join(dir, 'files');
        fs.writeFileSync(output, '');
        fs.writeFileSync(filesPath, files);
        const step = workflow.jobs[job].steps.find(
          candidate => candidate.name === 'Decide stable visual scope',
        );
        const result = spawnSync(
          'bash',
          ['-e', '-c', step.run.replaceAll('${{ github.event_name }}', event)],
          {
            cwd: path.resolve(import.meta.dirname, '../..'),
            env: {
              ...process.env,
              GITHUB_OUTPUT: output,
              FILES_PATH: filesPath,
              SCOPED: 'false',
              SPECIALIZED: specialized,
            },
            encoding: 'utf8',
          },
        );
        expect(result.status, result.stderr).toBe(0);
        return fs.readFileSync(output, 'utf8');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    };
    const full = 'has_stable_visual=true\nbroad_stable_visual=true\n';
    for (const job of ['visual-scout', 'pr-visual']) {
      expect(decide(job, {event: 'pull_request', files: ''}), job).toBe(full);
      expect(
        decide(job, {event: 'workflow_dispatch', files: 'docs/x.md\n'}),
        job,
      ).toBe(full);
      expect(
        decide(job, {
          event: 'pull_request',
          files: 'packages/core/src/Button/Button.tsx\n',
          specialized: 'true',
        }),
        job,
      ).toBe('has_stable_visual=false\nbroad_stable_visual=false\n');
    }
  });

  it('reports no stable visual work on a specialized lane', () => {
    for (const name of ['visual-scout', 'pr-visual']) {
      const decide = workflow.jobs[name].steps.find(
        step => step.name === 'Decide stable visual scope',
      );
      expect(decide.env.SPECIALIZED, name).toContain(
        "steps.scope.outputs.spec_only == 'true'",
      );
      const shortCircuit = decide.run.indexOf('"$SPECIALIZED" = true');
      expect(shortCircuit, name).toBeGreaterThanOrEqual(0);
      expect(shortCircuit, name).toBeLessThan(
        decide.run.indexOf('!= pull_request'),
      );
    }
  });

  it('validates spec records whenever docsite-test cannot decide its scope', () => {
    const validate = workflow.jobs['docsite-test'].steps.find(
      step => step.name === 'Validate spec records',
    );
    expect(validate.if).toBe(
      "(steps.scope.outputs.spec_only == 'true' || steps.scope.outputs.decided != 'true')",
    );
  });
});
