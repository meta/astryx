// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file main-artifact.test.mjs
 * Pins which kept artifact a merge-base lookup trusts: only one Main's own run
 * on `main` uploaded for that exact commit in this repository, unexpired.
 */

import {describe, expect, it, vi} from 'vitest';
import lookup from './main-artifact.cjs';

const {mainArtifactRunId} = lookup;
const SHA = 'a'.repeat(40);

function github(artifacts) {
  return {
    rest: {
      actions: {
        listArtifactsForRepo: vi.fn(async () => ({data: {artifacts}})),
      },
    },
  };
}

const artifact = (overrides = {}, run = {}) => ({
  expired: false,
  ...overrides,
  workflow_run: {
    id: 42,
    head_branch: 'main',
    head_sha: SHA,
    head_repository_id: 1,
    repository_id: 1,
    ...run,
  },
});

describe('mainArtifactRunId', () => {
  it("returns Main's run for the exact commit", async () => {
    const client = github([artifact()]);
    await expect(
      mainArtifactRunId({
        github: client,
        owner: 'meta',
        repo: 'astryx',
        name: 'x',
        sha: SHA,
      }),
    ).resolves.toBe('42');
    expect(client.rest.actions.listArtifactsForRepo).toHaveBeenCalledWith(
      expect.objectContaining({name: 'x', owner: 'meta', repo: 'astryx'}),
    );
  });

  it.each([
    ['an expired artifact', artifact({expired: true})],
    ['a pull request branch', artifact({}, {head_branch: 'feature'})],
    ['another commit', artifact({}, {head_sha: 'b'.repeat(40)})],
    ['a fork', artifact({}, {head_repository_id: 2})],
  ])('ignores %s', async (_label, candidate) => {
    await expect(
      mainArtifactRunId({
        github: github([candidate]),
        owner: 'meta',
        repo: 'astryx',
        name: 'x',
        sha: SHA,
      }),
    ).resolves.toBeNull();
  });

  it("without a commit, takes Main's run at any commit, and still ignores a branch or a fork", async () => {
    const lookupAny = candidate =>
      mainArtifactRunId({
        github: github([candidate]),
        owner: 'meta',
        repo: 'astryx',
        name: 'x',
      });
    await expect(
      lookupAny(artifact({}, {head_sha: 'b'.repeat(40)})),
    ).resolves.toBe('42');
    await expect(
      lookupAny(artifact({}, {head_branch: 'feature'})),
    ).resolves.toBeNull();
    await expect(
      lookupAny(artifact({}, {head_repository_id: 2})),
    ).resolves.toBeNull();
  });
});
