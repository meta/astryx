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

import fs from 'node:fs';
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
  '2-core-ubuntu-arm',
  '4-core-ubuntu',
  'ubuntu-slim',
  'ubuntu-latest',
]);

const WORKFLOWS = {
  'ci.yml': {
    lanes: ['test-ui', 'test-node'],
    // A PR that only touches docs skips the suite but must still report.
    scopeConditional: true,
    // Each Vitest lane splits its project across matrix legs.
    sharded: true,
  },
  'deploy.yml': {
    // The push gate also owns the build + typecheck gates, which need each
    // other and so ride one lane of their own.
    lanes: ['test-ui', 'test-node', 'typecheck'],
    scopeConditional: false,
    sharded: false,
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
  (file, {lanes, scopeConditional, sharded}) => {
    const workflow = load(file);

    it('gives the Node suite more than one Vitest worker', () => {
      // Vitest uses one worker per CPU beyond the first: on two cores the
      // suite would run one file at a time.
      expect(workflow.jobs['test-node']['runs-on']).toBe('4-core-ubuntu');
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

      if (!sharded) {
        // One conditional step preserves the existing scope gate for both
        // runs. Exact foreground commands also reject backgrounding or
        // ignored exits.
        expect(suites).toHaveLength(1);
        expect(suites[0].run.trim().split('\n')).toEqual([
          'pnpm test:ui',
          'pnpm test:ui:isolated',
        ]);
        return;
      }

      // Sharded: every leg runs its share without FR23, and exactly one leg
      // runs FR23 in a later step on the same runner, after its share exited.
      expect(suites).toHaveLength(2);
      const [share, isolated] = suites;
      expect(share.run.trim()).toBe(`pnpm test:ui ${SHARD_ARG}`);
      expect(isolated.run.trim()).toBe('pnpm test:ui:isolated');
      expect(job.steps.indexOf(isolated)).toBeGreaterThan(
        job.steps.indexOf(share),
      );
      expect(isolated.if).toBe(`matrix.shard == 1 && ${share.if}`);
    });

    if (sharded) {
      it('splits each Vitest lane across legs that together run every file', () => {
        for (const lane of lanes) {
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
          expect(workflow.jobs[lane].if).toContain('always()');
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
          expect(
            steps.some(step =>
              step.run?.includes('refusing to skip required work'),
            ),
            `${lane} does not guard against an unclassified scope`,
          ).toBe(true);
        }
      });
    }
  },
);

describe('ci.yml pr-a11y steps against an older PR head', () => {
  const steps = load('ci.yml').jobs['pr-a11y'].steps;
  /** The spec files each `pnpm exec playwright test` in a step names. */
  const specsOf = step =>
    (step.run ?? '')
      .replace(/\\\n/g, ' ')
      .split('\n')
      .filter(line => /pnpm exec playwright test\b/.test(line))
      .flatMap(line =>
        line
          .trim()
          .split(/\s+/)
          .filter(token => /\.spec\.(ts|tsx|js|mjs)$/.test(token)),
      );
  const playwright = steps.filter(step => specsOf(step).length > 0);

  // The wrapper skips spec files a PR head lacks, so a step that named a file
  // missing on main would pass silently everywhere. Main's steps must name
  // files that exist; only an older head skips anything.
  it('names only spec files that exist', () => {
    expect(playwright.length).toBeGreaterThan(0);
    for (const step of playwright) {
      for (const spec of specsOf(step)) {
        expect(
          fs.existsSync(path.join(root, spec)),
          `${step.name}: ${spec}`,
        ).toBe(true);
      }
    }
  });

  // A step that uploads its evidence with `if-no-files-found: error` must not
  // promise a run the wrapper then skips on an older head.
  it('promises heading-links evidence only when its spec is in the head', () => {
    const run = steps.find(
      step => step.name === 'Run heading-links module browser evidence',
    ).run;
    const spec =
      'packages/core/src/Markdown/plugins/headingLinks.a11y.chromium.spec.ts';
    const promise = run.indexOf("echo 'should_run=true'");
    expect(promise).toBeGreaterThan(-1);
    expect(run.slice(0, promise)).toContain(`if [ -e ${spec} ]; then`);
  });

  it("sources the merge commit's absent-spec wrapper before every Playwright step", () => {
    const index = steps.findIndex(
      step => step.name === 'Skip contract specs the PR head predates',
    );
    expect(index).toBeGreaterThan(-1);
    const wrapper = steps[index];
    expect(wrapper.if).toBe("github.event_name == 'pull_request'");
    // The merge commit the steps come from, not the PR's recorded base, which
    // can lag main and predate the wrapper.
    expect(wrapper.env.WORKFLOW_SHA).toBe('${{ github.sha }}');
    expect(wrapper.env.BASE_SHA).toBeUndefined();
    expect(wrapper.run).toContain(
      'git show "$WORKFLOW_SHA:.github/scripts/skip-absent-specs.sh" > "$wrapper"',
    );
    expect(wrapper.run).toContain('echo "BASH_ENV=$wrapper" >> "$GITHUB_ENV"');
    expect(
      fs.existsSync(path.join(root, '.github/scripts/skip-absent-specs.sh')),
    ).toBe(true);
    for (const step of playwright) {
      expect(steps.indexOf(step), step.name).toBeGreaterThan(index);
      // BASH_ENV reaches bash steps only, and only calls through the function.
      expect(step.shell ?? 'bash', step.name).toMatch(/^bash/);
      expect(step.run, step.name).not.toMatch(/\b(exec|command) pnpm\b/);
    }
  });
});

describe('ci.yml RTL package sharding', () => {
  const workflow = load('ci.yml');
  const shard = workflow.jobs['pr-rtl-shard'];
  const join = workflow.jobs['pr-rtl'];

  it('skips component discovery for spec-only changes and classifies other lightweight lanes', () => {
    const classification = workflow.jobs['check-components'];
    expect(classification.if).toContain("github.event_name == 'pull_request'");
    expect(classification.if).toContain(
      "needs.check-scope.outputs.spec_only != 'true'",
    );
    const commands = runLines(classification);
    for (const lane of ['docsite_only', 'tooling_only']) {
      expect(commands).toContain(`needs.check-scope.outputs.${lane}`);
    }
    expect(commands).toContain('has_components=false');
    expect(commands).toContain('has_rtl_components=false');
    expect(commands).toContain('has_rtl_harness=false');
    expect(commands).toContain('force_full_component_audits=false');
    expect(commands).toContain('has_stable_visual=false');
  });

  it('binds component evidence source, Storybook bytes, and RTL code to the PR head', () => {
    const exactRef = '${{ github.event.pull_request.head.sha || github.sha }}';
    for (const name of [
      'build-storybook',
      'pr-a11y-shard',
      'pr-a11y',
      'a11y-contracts-shard',
      'pr-rtl-shard',
    ]) {
      const checkout = workflow.jobs[name].steps.find(candidate =>
        candidate.uses?.startsWith('actions/checkout@'),
      );
      expect(checkout?.with?.ref, `${name} checkout is not exact-head`).toBe(
        exactRef,
      );
    }
    const storybookVerify = workflow.jobs['build-storybook'].steps.find(
      candidate => candidate.name === 'Verify Storybook source checkout',
    );
    expect(storybookVerify.if).toContain(
      "needs.check-scope.outputs.tooling_only != 'true'",
    );
    expect(runLines(workflow.jobs['build-storybook'])).toContain(
      'astryx-build-sha.txt',
    );
    expect(runLines(workflow.jobs['pr-a11y'])).toContain('git rev-parse HEAD');
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
    expect(runLines(workflow.jobs['pr-a11y'])).toContain(
      '.github/scripts/a11y-pr-scope.mjs',
    );
    expect(runLines(workflow.jobs['pr-a11y'])).toContain(
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
    expect(shard['runs-on']).toBe('4-core-ubuntu');
    expect(shard['timeout-minutes']).toBeLessThanOrEqual(30);
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
    expect(validation.if).toBe('always()');
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
    expect(join.needs).toEqual(
      expect.arrayContaining(['check-components', 'pr-rtl-shard']),
    );
    const commands = runLines(join);
    expect(commands).toContain('needs.check-components.result');
    expect(commands).toContain('needs.pr-rtl-shard.result');
    expect(commands).toContain('.github/scripts/rtl-join.mjs');
    expect(commands).toContain('--reports-dir rtl-shard-reports');
    expect(commands).toContain(
      '--force-full "${{ needs.check-components.outputs.force_full_component_audits }}"',
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
    expect(upload.if).toBe('always() && matrix.parts == 1');
    expect(upload.with.name).toBe('rtl-audit-report-${{ matrix.package }}');
    expect(upload.with.path).toContain('rtl-shard-scope.json');
    expect(upload.with.path).toContain('rtl-audit-report.json');
    expect(upload.with['if-no-files-found']).toBe('error');
    const part = shard.steps.find(step => step.name === 'Upload RTL part');
    expect(part.if).toBe('always() && matrix.parts > 1');
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
    ]) {
      const {typecheck} = JSON.parse(read(`${dir}/package.json`)).scripts;
      expect(typecheck, `${dir} lost its typecheck`).toBeTruthy();
    }
  });

  it('checks out main on every push-gate lane', () => {
    // A lane that checks out the default ref would gate the wrong commit.
    for (const lane of ['test-ui', 'test-node', 'typecheck']) {
      const checkout = workflow.jobs[lane].steps.find(step =>
        step.uses?.startsWith('actions/checkout'),
      );
      expect(checkout?.with?.ref, `${lane} does not pin main`).toBe('main');
    }
  });
});
