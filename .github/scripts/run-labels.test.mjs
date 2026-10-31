// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Per-suite opt-in labels for the heavy owners.
 * @input run-labels.cjs with a mocked GitHub API, and ci.yml's owner conditions
 * @output Each `ci:run-<suite>` label, applied with write access, runs only its
 *   own suite; a missing, removed or unauthorized label runs none
 * @position Node contracts for AST-030 FR12 and FR17
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {ungated} from './ci-pr-gate.mjs';

const require = createRequire(import.meta.url);
const {
  SUITE_LABELS,
  decideRunLabel,
  decideRunLabels,
  notRunSentence,
} = require('./run-labels.cjs');

const ci = yaml.parse(
  fs.readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8'),
);

/** Runs the decision against a mocked pull request and GitHub API. */
async function decide({
  eventName = 'pull_request',
  labels = [],
  events = labels.map(name => ({actor: {login: 'maintainer'}, label: {name}})),
  permissions = {maintainer: 'write'},
  failLookup = false,
  failPermission = [],
} = {}) {
  const outputs = {};
  const notices = [];
  const lookups = [];
  const core = {
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    notice: message => notices.push(message),
    warning: message => notices.push(message),
  };
  const github = {
    graphql: async (_query, variables) => {
      if (failLookup) throw new Error('rate limited');
      expect(variables).toEqual({owner: 'meta', repo: 'astryx', number: 7});
      return {repository: {pullRequest: {timelineItems: {nodes: events}}}};
    },
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({username}) => {
          lookups.push(username);
          if (failPermission.includes(username)) throw new Error('timeout');
          return {data: {permission: permissions[username] ?? 'read'}};
        },
      },
    },
  };
  const context = {
    eventName,
    repo: {owner: 'meta', repo: 'astryx'},
    payload: {
      pull_request:
        eventName === 'pull_request'
          ? {number: 7, labels: labels.map(name => ({name}))}
          : undefined,
    },
  };
  await decideRunLabels({github, context, core});
  return {outputs, notices, lookups};
}

describe('run-labels decision', () => {
  it('words the not-run sentence the comment shows for each suite', () => {
    expect(notRunSentence('visual')).toBe(
      'Visual did not run on this pull request; add `ci:run-visual` to run it.',
    );
    expect(notRunSentence('a11y')).toBe(
      'Accessibility did not run on this pull request; add `ci:run-a11y` to run it.',
    );
    expect(notRunSentence('rtl')).toBe(
      'RTL did not run on this pull request; add `ci:run-rtl` to run it.',
    );
  });

  it('names one label per suite', () => {
    expect(SUITE_LABELS).toEqual({
      visual: 'ci:run-visual',
      a11y: 'ci:run-a11y',
      rtl: 'ci:run-rtl',
    });
  });

  it.each(Object.entries(SUITE_LABELS))(
    'opts in only %s for %s',
    async (suite, label) => {
      const {outputs} = await decide({labels: [label]});
      for (const other of Object.keys(SUITE_LABELS))
        expect(outputs[other], other).toBe(String(other === suite));
    },
  );

  // GitHub reports maintain and custom write-based roles as `write`; the
  // review gate's hasWritePermission decides, so labels and reviews agree.
  it('runs a suite when its label came from write or admin access', async () => {
    for (const permission of ['write', 'admin']) {
      const {outputs} = await decide({
        labels: ['ci:run-a11y'],
        permissions: {maintainer: permission},
      });
      expect(outputs.a11y, permission).toBe('true');
    }
  });

  it('does not run a suite labelled with read or no access, and says why', async () => {
    for (const permission of ['read', 'none']) {
      const {outputs, notices} = await decide({
        labels: ['ci:run-rtl'],
        permissions: {maintainer: permission},
      });
      expect(outputs.rtl, permission).toBe('false');
      expect(notices.join('\n')).toContain('maintainer');
    }
  });

  it('denies only the suites of a labeler whose access lookup fails', async () => {
    const {outputs} = await decide({
      labels: ['ci:run-visual', 'ci:run-rtl'],
      events: [
        {actor: {login: 'maintainer'}, label: {name: 'ci:run-visual'}},
        {actor: {login: 'flaky'}, label: {name: 'ci:run-rtl'}},
      ],
      permissions: {maintainer: 'write', flaky: 'write'},
      failPermission: ['flaky'],
    });
    expect(outputs).toEqual({visual: 'true', a11y: 'false', rtl: 'false'});
  });

  it("judges each label's newest application, not an earlier one", async () => {
    const {outputs} = await decide({
      labels: ['ci:run-visual', 'ci:run-rtl'],
      events: [
        {actor: {login: 'maintainer'}, label: {name: 'ci:run-visual'}},
        {actor: {login: 'maintainer'}, label: {name: 'ci:run-rtl'}},
        {actor: {login: 'triager'}, label: {name: 'ci:run-visual'}},
      ],
      permissions: {maintainer: 'write', triager: 'read'},
    });
    expect(outputs).toEqual({visual: 'false', a11y: 'false', rtl: 'true'});
  });

  it('runs nothing for a removed label, even though its event is in the timeline', async () => {
    const {outputs} = await decide({
      labels: [],
      events: [{actor: {login: 'maintainer'}, label: {name: 'ci:run-visual'}}],
    });
    expect(outputs).toEqual({visual: 'false', a11y: 'false', rtl: 'false'});
  });

  it('fails closed when the lookup fails or finds no label event', async () => {
    expect(
      (await decide({labels: ['ci:run-visual'], failLookup: true})).outputs,
    ).toEqual({visual: 'false', a11y: 'false', rtl: 'false'});
    expect(
      (await decide({labels: ['ci:run-visual'], events: []})).outputs.visual,
    ).toBe('false');
  });

  it('looks each labeler up once and makes no call without a suite label', async () => {
    const {lookups} = await decide({
      labels: ['ci:run-visual', 'ci:run-a11y', 'ci:run-rtl'],
    });
    expect(lookups).toEqual(['maintainer']);
    const none = await decide({labels: ['ci:run', 'bug']});
    expect(none.lookups).toEqual([]);
    expect(none.outputs).toEqual({
      visual: 'false',
      a11y: 'false',
      rtl: 'false',
    });
  });

  it('opts nothing in outside a pull request', async () => {
    for (const eventName of ['push', 'workflow_dispatch', 'merge_group']) {
      const {outputs} = await decide({eventName});
      expect(outputs, eventName).toEqual({
        visual: 'false',
        a11y: 'false',
        rtl: 'false',
      });
    }
  });
});

// A suite in its own workflow (the nightly perf lane) asks about one label
// under the same rule and sets no output of its own (spec:AST-030 FR18).
describe('decideRunLabel', () => {
  async function decideOne({
    labels,
    permission = 'write',
    eventName = 'pull_request',
  }) {
    const outputs = {};
    const notices = [];
    const core = {
      setOutput: (name, value) => {
        outputs[name] = value;
      },
      notice: message => notices.push(message),
      warning: message => notices.push(message),
    };
    const github = {
      graphql: async () => ({
        repository: {
          pullRequest: {
            timelineItems: {
              nodes: labels.map(name => ({
                actor: {login: 'maintainer'},
                label: {name},
              })),
            },
          },
        },
      }),
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async () => ({data: {permission}}),
        },
      },
    };
    const context = {
      eventName,
      repo: {owner: 'meta', repo: 'astryx'},
      payload: {
        pull_request: {number: 7, labels: labels.map(name => ({name}))},
      },
    };
    const runs = await decideRunLabel({
      github,
      context,
      core,
      suite: 'perf',
      label: 'ci:run-perf',
    });
    return {runs, outputs, notices};
  }

  it('runs for its label from write access, and sets no output', async () => {
    const {runs, outputs} = await decideOne({labels: ['ci:run-perf']});
    expect(runs).toBe(true);
    expect(outputs).toEqual({});
  });

  it('does not run for read access, another suite label, or outside a pull request', async () => {
    expect(
      (await decideOne({labels: ['ci:run-perf'], permission: 'read'})).runs,
    ).toBe(false);
    expect((await decideOne({labels: ['ci:run-visual']})).runs).toBe(false);
    expect(
      (await decideOne({labels: ['ci:run-perf'], eventName: 'push'})).runs,
    ).toBe(false);
  });

  it('leaves the CI suites unchanged', () => {
    expect(Object.values(SUITE_LABELS)).not.toContain('ci:run-perf');
  });
});

// Replay: each label's decision through every heavy owner's condition on a
// pull request whose other needs succeeded.
describe('each label runs only its own suite', () => {
  const OWNERS = {
    visual: ['visual-scout', 'pr-visual'],
    a11y: ['pr-a11y-guards', 'pr-a11y-specs', 'pr-a11y'],
    rtl: ['pr-rtl-shard', 'pr-rtl-merge', 'pr-rtl'],
  };

  function runsOnPullRequest(job, decision) {
    const expression = ungated(job.if)
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
    const needs = Object.fromEntries(
      [job.needs].flat().map(name => [
        name,
        {
          result: 'success',
          outputs: name === 'run-labels' ? decision : {},
        },
      ]),
    );
    return Function(
      'github',
      'inputs',
      'needs',
      'always',
      'cancelled',
      `return Boolean(${expression});`,
    )(
      {event_name: 'pull_request', event: {pull_request: {labels: []}}},
      {},
      needs,
      () => true,
      () => false,
    );
  }

  it.each([
    [[]],
    [['ci:run-visual']],
    [['ci:run-a11y']],
    [['ci:run-rtl']],
    [['ci:run-visual', 'ci:run-rtl']],
  ])('with %j', async labels => {
    const {outputs} = await decide({labels});
    const ran = Object.entries(OWNERS)
      .flatMap(([, owners]) => owners)
      .filter(owner => runsOnPullRequest(ci.jobs[owner], outputs));
    const expected = Object.entries(OWNERS)
      .filter(([suite]) => labels.includes(SUITE_LABELS[suite]))
      .flatMap(([, owners]) => owners);
    expect(ran.sort()).toEqual(expected.sort());
  });
});
