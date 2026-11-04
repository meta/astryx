// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-block automaticity proof (discovery seam).
 *
 * The contract: once an integration package declares its templates root,
 * documenting a NEW example needs exactly two authored files — a same-stem
 * `<Name>.tsx` + `<Name>.doc.mjs` pair in that root — and ZERO edits anywhere
 * else (no astryx.config change, no generator change, no hand-maintained
 * catalog). The probe uses @astryxdesign/charts, whose `templates: './blocks'`
 * root already holds real blocks. A package declares its root together with
 * its first block, because `integration pack --check` rejects an empty root.
 *
 * SCOPE: this file proves the DISCOVERY seam only — it writes a temporary
 * fixture pair into packages/charts/blocks and asserts the exact CLI API call
 * `generate-data.mjs` makes (`template --list/--show`, same cwd) returns it.
 * It does not re-run generation. Separate, narrower guarantees exist around
 * it, and nothing proves more than their sum:
 *   1. this file — generic CLI discovery of a new authored pair;
 *   2. example-coverage.test.ts — every authored, valid Lab block appears in
 *      the generated blockRegistry (blockRegistry only);
 *   3. playground-scope.test.ts — imports used by registered integration
 *      blocks resolve in the generated Playground scope.
 * General loader completeness for a future block's showcase/example
 * projection is NOT proved by any of these.
 *
 * The fixture files exist only while this file runs (created in beforeAll,
 * removed in afterAll; leftovers from a killed run are cleaned first). The
 * AUTOMATICITY_FIXTURE_PREFIX is reserved so the example-coverage report,
 * which walks the same directory in a parallel worker, ignores them.
 *
 * @input A temporary authored block pair in packages/charts/blocks and the CLI
 *   template listing API with the docsite's own working directory
 * @output Proof that block authoring is registration-free for integrations
 * @position Build-time docsite discovery verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {template as queryTemplates} from '@astryxdesign/cli/api';
import type {
  TemplateListEntry,
  TemplateListResponse,
  TemplateShowResponse,
} from '@astryxdesign/cli/api';
import {AUTOMATICITY_FIXTURE_PREFIX} from '../lib/exampleCoverage.mjs';

/** The api's declared envelope is `{type, data: unknown}`; narrow to the
 *  documented response typedefs for the two invocations this file makes. */
async function listBlocks(cwd: string): Promise<TemplateListEntry[]> {
  const response = (await queryTemplates(undefined, {
    list: true,
    type: 'block',
    cwd,
  })) as TemplateListResponse;
  return response.data;
}

const DOCSITE_ROOT = path.resolve(__dirname, '../..');
const PROBE_PACKAGE = '@astryxdesign/charts';
const PROBE_BLOCKS_DIR = path.resolve(
  DOCSITE_ROOT,
  '../../packages/charts/blocks',
);
const FIXTURE_NAME = AUTOMATICITY_FIXTURE_PREFIX;
const FIXTURE_TSX = path.join(PROBE_BLOCKS_DIR, `${FIXTURE_NAME}.tsx`);
const FIXTURE_DOC = path.join(PROBE_BLOCKS_DIR, `${FIXTURE_NAME}.doc.mjs`);
const FIXTURE_MARKER =
  'Automaticity probe: zero-registration integration block';

const FIXTURE_TSX_SOURCE = `// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Text} from '@astryxdesign/core/Text';

export default function ${FIXTURE_NAME}() {
  return <Text>${FIXTURE_MARKER}</Text>;
}
`;

const FIXTURE_DOC_SOURCE = `// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: '${FIXTURE_NAME}',
  displayName: '${FIXTURE_NAME}',
  description:
    'Temporary test fixture written by example-automaticity.test.ts; never committed.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Text'],
};
`;

function removeFixture() {
  fs.rmSync(FIXTURE_TSX, {force: true});
  fs.rmSync(FIXTURE_DOC, {force: true});
}

beforeAll(() => {
  expect(fs.existsSync(PROBE_BLOCKS_DIR)).toBe(true);
  removeFixture();
  fs.writeFileSync(FIXTURE_TSX, FIXTURE_TSX_SOURCE, 'utf-8');
  fs.writeFileSync(FIXTURE_DOC, FIXTURE_DOC_SOURCE, 'utf-8');
});

afterAll(() => {
  removeFixture();
});

describe('integration block automaticity', () => {
  it('discovers a newly authored integration block pair with zero registration edits', async () => {
    // Exactly what generate-data.mjs runs to assemble the canary block
    // registry — same API, same cwd. Nothing about the fixture exists outside
    // packages/charts/blocks: astryx.config.mjs, the integration manifest,
    // and every generator are untouched.
    const entries = await listBlocks(DOCSITE_ROOT);
    const entry = entries.find(
      candidate =>
        candidate.package === PROBE_PACKAGE && candidate.id === FIXTURE_NAME,
    );
    expect(
      entry,
      `authored fixture pair was not discovered as a ${PROBE_PACKAGE} block`,
    ).toBeDefined();
    expect(entry!.name).toBe(FIXTURE_NAME);
    expect(entry!.description).toContain('Temporary test fixture');

    const shown = (await queryTemplates(entry!.id, {
      show: true,
      type: 'block',
      package: entry!.package,
      cwd: DOCSITE_ROOT,
    })) as TemplateShowResponse;
    expect(shown.data.source).toContain(FIXTURE_MARKER);
  }, 60_000);

  it("still lists the package's authored blocks alongside the fixture (no shadowing)", async () => {
    const entries = await listBlocks(DOCSITE_ROOT);
    const probeIds = entries
      .filter(candidate => candidate.package === PROBE_PACKAGE)
      .map(candidate => candidate.id);
    expect(probeIds).toContain(FIXTURE_NAME);
    expect(probeIds.some(id => id !== FIXTURE_NAME)).toBe(true);
  }, 60_000);
});
