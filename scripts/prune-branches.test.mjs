// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file prune-branches.test.mjs
 * Pins that the daily branch pruner deletes an `assets/pr-<n>` branch the PR
 * report created (it carries `.pr-report-frames`) once PR #<n> is merged or
 * closed, keeps it while the PR is open, and does not delete an assets branch
 * without the marker, such as screenshots pushed by hand, for its PR closing.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {createRepository} from './lib/git-fixture.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'prune-branches.sh',
);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function setup(prStates) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  roots.push(root);
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  createRepository(
    origin,
    [
      {ref: 'refs/heads/main', name: 'base'},
      {
        ref: 'refs/heads/assets/pr-1',
        name: 'frames',
        parent: 'base',
        files: {'.pr-report-frames': 'marker\n'},
      },
    ],
    {
      bare: true,
      // assets/pr-3 is pushed by hand: no marker.
      refs: {
        'refs/heads/assets/pr-2': 'frames',
        'refs/heads/assets/pr-3': 'base',
      },
    },
  );
  execFileSync('git', ['clone', '-q', origin, work]);
  // A stand-in for gh: `pr view <n>` answers from prStates; `pr list` finds no PR.
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nif [ "$1 $2" = "pr view" ]; then\n  case "$3" in\n${Object.entries(
      prStates,
    )
      .map(([n, state]) => `    ${n}) echo ${state} ;;`)
      .join('\n')}\n  esac\nelse\n  echo none\nfi\n`,
    {mode: 0o755},
  );
  return {work, bin};
}

describe('prune-branches.sh', () => {
  it("deletes a closed PR's marked assets branch, keeps an open PR's, and never an unmarked one", () => {
    const {work, bin} = setup({1: 'MERGED', 2: 'OPEN', 3: 'CLOSED'});
    const out = execFileSync('bash', [SCRIPT], {
      cwd: work,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    }).replace(/\u001b\[[0-9;]*m/g, '');
    const willDelete = out.slice(
      out.indexOf('Merged/closed PR (will delete):'),
    );
    expect(willDelete).toContain('assets/pr-1');
    expect(willDelete).not.toContain('assets/pr-2');
    // assets/pr-3 has no marker: its PR is closed, yet it is not deleted.
    expect(out).not.toMatch(/^\s+assets\/pr-3$/m);
    expect(out).toContain('0 branches (no PR');
  });

  it('keeps stale branches with open PRs or gh errors, ignores fork PRs, keeps HEAD-named branches, and safely deletes option-like branch names', () => {
    const {work, bin} = setup({});
    const origin = path.join(path.dirname(work), 'origin.git');
    const oldGitEnv = {
      ...process.env,
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };

    for (const branch of ['old-open-pr', 'old-gh-error']) {
      execFileSync('git', ['checkout', '-q', '-b', branch, 'main'], {cwd: work});
      execFileSync('git', ['commit', '--allow-empty', '-q', '-m', branch], {
        cwd: work,
        env: oldGitEnv,
      });
      execFileSync('git', ['push', '-q', 'origin', branch], {cwd: work});
    }
    for (const branch of ['fork-closed-only', 'fix/HEAD-reset']) {
      execFileSync('git', ['checkout', '-q', '-b', branch, 'main'], {cwd: work});
      execFileSync('git', ['push', '-q', 'origin', branch], {cwd: work});
    }
    execFileSync('git', ['checkout', '-q', 'main'], {cwd: work});
    execFileSync(
      'git',
      ['update-ref', 'refs/heads/--hyphen-branch', 'refs/heads/main'],
      {cwd: origin},
    );

    fs.writeFileSync(
      path.join(bin, 'gh'),
      [
        '#!/usr/bin/env bash',
        'if [ "$1 $2" = "pr list" ]; then',
        '  head=""',
        '  json=""',
        '  jq_expr=""',
        '  while [ $# -gt 0 ]; do',
        '    case "$1" in',
        '      --head) head="$2"; shift 2 ;;',
        '      --json) json="$2"; shift 2 ;;',
        '      --jq) jq_expr="$2"; shift 2 ;;',
        '      *) shift ;;',
        '    esac',
        '  done',
        '  [[ "$head" != *:* ]] || exit 2',
        '  [[ "$json" == *isCrossRepository* ]] || exit 2',
        '  [ "$jq_expr" = \'[.[] | select(.isCrossRepository | not)][0].state // "none"\' ] || exit 2',
        '  case "$head" in',
        '    old-open-pr) payload=\'[{"state":"OPEN","isCrossRepository":false}]\' ;;',
        '    old-gh-error) exit 1 ;;',
        '    fork-closed-only) payload=\'[{"state":"CLOSED","isCrossRepository":true}]\' ;;',
        '    --hyphen-branch) payload=\'[{"state":"MERGED","isCrossRepository":false}]\' ;;',
        '    *) payload=\'[]\' ;;',
        '  esac',
        '  node -e \'const items = JSON.parse(process.argv[1]); const kept = items.filter(p => !p.isCrossRepository); process.stdout.write((kept[0]?.state ?? "none") + "\\n");\' "$payload"',
        'else',
        '  echo none',
        'fi',
      ].join('\n') + '\n',
      {mode: 0o755},
    );

    const out = execFileSync('bash', [SCRIPT, '--delete'], {
      cwd: work,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    }).replace(/\u001b\[[0-9;]*m/g, '');

    expect(out).toContain('Found 8 remote branches');
    expect(out).toContain('Deleted:   1');
    const refs = execFileSync(
      'git',
      ['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads'],
      {cwd: origin, encoding: 'utf8'},
    )
      .trim()
      .split(/\r?\n/);
    expect(refs).not.toContain('--hyphen-branch');
    expect(refs).toContain('old-open-pr');
    expect(refs).toContain('old-gh-error');
    expect(refs).toContain('fork-closed-only');
    expect(refs).toContain('fix/HEAD-reset');
  });
});
