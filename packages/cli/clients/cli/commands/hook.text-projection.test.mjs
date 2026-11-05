// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx hook <name>` text is a projection of `hook.detail`: it shows
 * nothing the JSON envelope does not carry.
 */

import {describe, it, expect} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {findRelatedBlocks} from '../../../api/template/template.mjs';

const HOOK = 'useAnnounce';

describe('hook detail text projection', () => {
  it('prints no block templates that the JSON envelope lacks', async () => {
    const json = await runCli(['--json', 'hook', HOOK]);
    expect(json.status).toBe(0);
    const envelope = JSON.parse(json.stdout);
    expect(envelope.type).toBe('hook.detail');
    const related = envelope.data.relatedComponents;
    expect(related.length).toBeGreaterThan(0);

    const blockNames = [];
    for (const component of related) {
      for (const block of await findRelatedBlocks(component)) {
        blockNames.push(block.dirName);
      }
    }
    expect(blockNames.length).toBeGreaterThan(0);

    const text = await runCli(['hook', HOOK]);
    expect(text.status).toBe(0);
    const shownButNotInJson = blockNames.filter(
      name => text.stdout.includes(name) && !json.stdout.includes(name),
    );
    expect(shownButNotInJson).toEqual([]);
  });

  it('points at the JSON-backed block lookup for each related component', async () => {
    const text = await runCli(['hook', HOOK]);
    expect(text.stdout).toMatch(/component <name> --blocks/);
    expect(text.stdout).toContain('VisuallyHidden');
    expect(text.stdout).toContain('Toast');
  });
});
