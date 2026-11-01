// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pull-request workflows cancel their own superseded runs, and only those.
 *
 * Without a per-PR concurrency group, every push to a pull request queues a
 * full run beside the one it supersedes, and runners drain stale work first.
 * A group keyed by branch name instead collides across forks, where two pull
 * requests can share a branch name and cancel each other's checks.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const dir = path.resolve(import.meta.dirname, '../workflows');
const workflows = fs
  .readdirSync(dir)
  .filter(name => name.endsWith('.yml'))
  .map(name => ({
    name,
    value: yaml.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
  }));

const triggers = value => Object.keys(value.on ?? value[true] ?? {});

// Workflows a push to an open pull request starts again: a `pull_request`
// trigger with the default activity types, or one that lists `synchronize`.
const pullRequestWorkflows = workflows.filter(({value}) => {
  const on = value.on ?? value[true] ?? {};
  if (!triggers(value).includes('pull_request')) return false;
  const types = on.pull_request?.types;
  return types == null || types.includes('synchronize');
});

describe('pull-request workflow concurrency', () => {
  it('finds the pull-request workflows', () => {
    expect(pullRequestWorkflows.map(({name}) => name)).toEqual(
      expect.arrayContaining([
        'ci.yml',
        'internal-registry.yml',
        'lint.yml',
        'cli-smoke-test.yml',
      ]),
    );
  });

  it.each(pullRequestWorkflows.map(({name, value}) => [name, value]))(
    '%s groups runs by pull request number and cancels superseded ones',
    (name, value) => {
      const {concurrency} = value;
      expect(concurrency, `${name} has no concurrency group`).toBeDefined();
      expect(concurrency.group).toContain('github.event.pull_request.number');
      expect(concurrency.group).not.toContain('head_ref');
      expect(
        [
          true,
          "${{ github.event_name == 'pull_request' }}",
          "${{ github.event_name != 'workflow_dispatch' }}",
        ],
        `${name} does not cancel superseded pull-request runs`,
      ).toContain(concurrency['cancel-in-progress']);
    },
  );

  it.each(pullRequestWorkflows.map(({name, value}) => [name, value]))(
    '%s gives other events their own groups',
    (name, value) => {
      const events = triggers(value);
      const {group} = value.concurrency;
      if (events.includes('merge_group')) {
        expect(group, name).toContain('github.event.merge_group.head_sha');
      }
      if (events.includes('push') || events.includes('workflow_dispatch')) {
        expect(group, name).toContain('github.run_id');
      }
    },
  );
});
