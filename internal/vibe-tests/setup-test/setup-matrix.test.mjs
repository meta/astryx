// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parseExecutionProvenanceV1} from '../src/provenance';
import {
  createSetupProvenance,
  expandSetupMatrix,
  fixtureManifestSha256,
  setupCellKey,
  setupEnvironmentHash,
  sha256Text,
  taskContractText,
  validatePromptContracts,
  validateSetupMatrixConfig,
} from './setup-matrix.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(
  fs.readFileSync(path.join(HERE, 'matrix.json'), 'utf8'),
);
const prompts = JSON.parse(
  fs.readFileSync(path.join(HERE, 'prompts.json'), 'utf8'),
).prompts;
const probes = JSON.parse(
  fs.readFileSync(path.join(HERE, 'probes.json'), 'utf8'),
);

function recipe(fixture) {
  return JSON.parse(
    fs.readFileSync(
      path.join(HERE, '..', 'fixture-recipes', `${fixture}.json`),
      'utf8',
    ),
  );
}

describe('setup execution matrix', () => {
  it('uses three fixtures, four paired bundles, and K=2 in every stage', () => {
    expect(() => validateSetupMatrixConfig(matrix)).not.toThrow();
    expect(matrix.fixtures).toHaveLength(3);
    expect(matrix.bundles).toHaveLength(4);
    expect(matrix.bundles.map(bundle => bundle.effort)).toEqual([
      'high',
      'high',
      'high',
      'high',
    ]);
    expect(new Set(matrix.bundles.map(bundle => bundle.model))).toEqual(
      new Set(['claude-family', 'gpt-family']),
    );
    // K=2 everywhere the matrix is exploring. An iteration stage is not
    // exploring: it reruns already-recorded r1 cells one-for-one, so a second
    // repetition would produce cells with no counterpart to compare against.
    expect(
      matrix.stages
        .filter(stage => !stage.id.startsWith('strategy-iteration'))
        .map(stage => stage.reps),
    ).toEqual([2, 2, 2, 2]);
    for (const stage of matrix.stages.filter(entry =>
      entry.id.startsWith('strategy-iteration'),
    )) {
      expect(stage.reps).toBe(1);
    }
  });

  it('keeps the Codex bundle configured and explicitly blocked', () => {
    expect(
      matrix.bundles.find(bundle => bundle.id === 'codex-gpt'),
    ).toMatchObject({harness: 'codex', blocked: true});
    const entries = expandSetupMatrix(matrix, {
      stage: 'confirmation',
      fixtures: ['tailwind-v4-control'],
      prompts: ['s0'],
      bundles: ['codex-gpt'],
      reps: 1,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({blocked: true});
  });

  it('validates every field-granular intended change against supported fixture probes', () => {
    expect(() =>
      validatePromptContracts(prompts, probes, matrix),
    ).not.toThrow();
    const allFields = prompts.flatMap(prompt =>
      prompt.contract.allowedHostChanges.flatMap(allowed => allowed.fields),
    );
    // Position offsets, plus block-axis growth where a task mandates inserting
    // something into a host container. Nothing else is exemptible.
    expect(
      allFields.every(
        field => field.startsWith('geometry.') || field === 'height',
      ),
    ).toBe(true);
    expect(allFields).not.toContain('geometry.width');
    expect(allFields).not.toContain('width');
    expect(allFields).not.toContain('color');
    // Container text is never exempted outright, only ever insertion-only.
    expect(allFields).not.toContain('text');

    // One per protected class: a computed style, an inline-axis dimension,
    // and container text, which is only ever insertion-only.
    for (const field of ['color', 'width', 'text']) {
      const invalid = structuredClone(prompts);
      invalid
        .find(prompt => prompt.id === 's1')
        .contract.allowedHostChanges.push({
          fixture: 'tailwind-v4-control',
          probe: 'primary-action',
          fields: [field],
        });
      expect(() => validatePromptContracts(invalid, probes, matrix)).toThrow(
        new RegExp(`cannot allow protected host field ${field}`),
      );
    }
  });

  it('accepts the s5 insertion allowance and nothing broader', () => {
    const s5 = prompts.find(prompt => prompt.id === 's5');
    expect(s5.contract.allowedHostChanges).toEqual([
      expect.objectContaining({
        fixture: 'enterprise-scoped-synthetic',
        probe: 'host-shell',
        fields: ['height', 'geometry.height', 'geometry.bottom'],
        textInsertionOnly: true,
      }),
      expect.objectContaining({
        fixture: 'enterprise-scoped-synthetic',
        probe: 'guest-boundary',
        fields: ['height', 'geometry.height', 'geometry.bottom'],
      }),
    ]);
    // The guest boundary gains a task-owned control, whose text the container's
    // protected text already excludes, so that allowance takes no text
    // exemption at all.
    expect(
      s5.contract.allowedHostChanges.find(
        allowed => allowed.probe === 'guest-boundary',
      ),
    ).not.toHaveProperty('textInsertionOnly');

    // Nothing outside block-axis growth may be added to either allowance.
    for (const field of ['width', 'color', 'text']) {
      const broader = structuredClone(prompts);
      broader
        .find(prompt => prompt.id === 's5')
        .contract.allowedHostChanges.push({
          fixture: 'enterprise-scoped-synthetic',
          probe: 'guest-boundary',
          fields: [field],
        });
      expect(() => validatePromptContracts(broader, probes, matrix)).toThrow(
        new RegExp(`cannot allow protected host field ${field}`),
      );
    }

    const duplicated = structuredClone(prompts);
    duplicated
      .find(prompt => prompt.id === 's5')
      .contract.allowedHostChanges.push({
        fixture: 'enterprise-scoped-synthetic',
        probe: 'guest-boundary',
        fields: ['geometry.height'],
      });
    expect(() => validatePromptContracts(duplicated, probes, matrix)).toThrow(
      /duplicates allowed field/,
    );

    const badFlag = structuredClone(prompts);
    badFlag.find(
      prompt => prompt.id === 's5',
    ).contract.allowedHostChanges[0].textInsertionOnly = 'yes';
    expect(() => validatePromptContracts(badFlag, probes, matrix)).toThrow(
      /textInsertionOnly must be a boolean/,
    );
  });

  it('rejects an intended change for a nonexistent probe or unsupported fixture', () => {
    const missingProbe = structuredClone(prompts);
    missingProbe.find(
      prompt => prompt.id === 's1',
    ).contract.allowedHostChanges[0].probe = 'missing';
    expect(() => validatePromptContracts(missingProbe, probes, matrix)).toThrow(
      /allows unknown probe/,
    );

    const wrongFixture = structuredClone(prompts);
    wrongFixture
      .find(prompt => prompt.id === 's4')
      .contract.allowedHostChanges.push({
        fixture: 'tailwind-v4-control',
        probe: 'primary-action',
        fields: ['geometry.x'],
      });
    expect(() => validatePromptContracts(wrongFixture, probes, matrix)).toThrow(
      /unsupported fixture/,
    );
  });

  it('requires s2 to replace one validated host probe in every fixture', () => {
    const s2 = prompts.find(prompt => prompt.id === 's2');
    expect(
      new Set(
        s2.contract.replacedHostProbes.map(
          replaced =>
            `${replaced.fixture}:${replaced.probe}:${replaced.result}`,
        ),
      ),
    ).toEqual(
      new Set([
        'tailwind-v4-control:status:astryx-status',
        'shadcn-tailwind-v4-established:status:astryx-status',
        'enterprise-scoped-synthetic:status:astryx-status',
      ]),
    );

    const incomplete = structuredClone(prompts);
    incomplete
      .find(prompt => prompt.id === 's2')
      .contract.replacedHostProbes.pop();
    expect(() => validatePromptContracts(incomplete, probes, matrix)).toThrow(
      /must replace exactly one host probe/,
    );

    const mismatchedText = structuredClone(prompts);
    mismatchedText
      .find(prompt => prompt.id === 's2')
      .contract.replacedHostProbes.push({
        fixture: 'tailwind-v4-control',
        probe: 'page-title',
        result: 'astryx-status',
      });
    expect(() =>
      validatePromptContracts(mismatchedText, probes, matrix),
    ).toThrow(/must preserve its host text/);

    const duplicateFixture = structuredClone(prompts);
    const duplicateS2 = duplicateFixture.find(prompt => prompt.id === 's2');
    duplicateS2.contract.results.push({
      name: 'astryx-title',
      exact: 1,
      preserveTextFromHostProbe: 'page-title',
    });
    duplicateS2.contract.replacedHostProbes.push({
      fixture: 'tailwind-v4-control',
      probe: 'page-title',
      result: 'astryx-title',
    });
    expect(() =>
      validatePromptContracts(duplicateFixture, probes, matrix),
    ).toThrow(/must replace exactly one host probe/);

    const unknownResult = structuredClone(prompts);
    unknownResult.find(
      prompt => prompt.id === 's2',
    ).contract.replacedHostProbes[0].result = 'missing-result';
    expect(() =>
      validatePromptContracts(unknownResult, probes, matrix),
    ).toThrow(/references unknown result/);
  });

  it('allows only validated overlay bounds and rejects style exemptions', () => {
    const overlayFields = prompts.flatMap(prompt =>
      prompt.contract.allowedOverlayChanges.flatMap(allowed => allowed.fields),
    );
    expect(overlayFields.length).toBeGreaterThan(0);
    expect(overlayFields.every(field => field.startsWith('geometry.'))).toBe(
      true,
    );

    const backdropStyle = structuredClone(prompts);
    backdropStyle
      .find(prompt => prompt.id === 's4')
      .contract.allowedOverlayChanges.push({
        fixture: 'shadcn-tailwind-v4-established',
        surface: 'dialog-backdrop',
        fields: ['backgroundColor'],
      });
    expect(() =>
      validatePromptContracts(backdropStyle, probes, matrix),
    ).toThrow(/cannot allow protected overlay field backgroundColor/);

    const missingSurface = structuredClone(prompts);
    missingSurface.find(
      prompt => prompt.id === 's5',
    ).contract.allowedOverlayChanges[0].surface = 'missing';
    expect(() =>
      validatePromptContracts(missingSurface, probes, matrix),
    ).toThrow(/allows unknown overlay/);
  });

  it.each([
    'tailwind-v4-control',
    'shadcn-tailwind-v4-established',
    'enterprise-scoped-synthetic',
  ])('renders an explicit s2 replacement contract for %s', fixture => {
    const text = taskContractText(
      prompts.find(prompt => prompt.id === 's2'),
      fixture,
    );
    expect(text).toContain(
      'The following host probes are intentional replacements for this fixture. Keep every other existing `data-vibe-probe` attribute:',
    );
    expect(text).toContain(
      '- Replace `data-vibe-probe="status"`: remove that probe attribute from the original host treatment so it no longer exists as a host probe, and put `data-vibe-result="astryx-status"` on its replacement. Preserve the original probe text exactly.',
    );
    expect(text).not.toContain(
      'Keep every existing `data-vibe-probe` attribute on pre-existing host UI.',
    );
    expect(text.match(/data-vibe-result="astryx-status"/g)).toHaveLength(1);
  });

  it('renders aliased surface roles on one unambiguous marker instruction', () => {
    const text = taskContractText(
      prompts.find(prompt => prompt.id === 's5'),
      'enterprise-scoped-synthetic',
    );
    const markerLines = text
      .split('\n')
      .filter(line => line.includes('data-vibe-result'));
    const dialogLines = markerLines.filter(line =>
      line.includes('data-vibe-result="astryx-dialog-surface"'),
    );
    expect(dialogLines).toHaveLength(1);
    expect(dialogLines[0]).toContain(
      'the astryx dialog surface (dialog surface)',
    );
    expect(dialogLines[0]).toContain(
      'the astryx dialog backdrop (the `::backdrop` of this element)',
    );
    expect(dialogLines[0].indexOf('dialog surface')).toBeLessThan(
      dialogLines[0].indexOf('dialog backdrop'),
    );
    expect(dialogLines[0]).not.toMatch(/on the astryx dialog backdrop/);
  });

  it('prepares 48 separation cells, then 400 new guidance cells', () => {
    const separation = expandSetupMatrix(matrix, {stage: 'separation'});
    const guidance = expandSetupMatrix(matrix, {stage: 'guidance'});
    expect(separation).toHaveLength(48);
    expect(guidance).toHaveLength(400);

    const reused = new Set(separation.map(setupCellKey));
    expect(guidance.some(entry => reused.has(setupCellKey(entry)))).toBe(false);
    expect(
      new Set([...separation, ...guidance].map(setupCellKey)),
    ).toHaveLength(448);
  });

  it('requires 112 fresh candidate confirmation cells', () => {
    const confirmation = expandSetupMatrix(matrix, {stage: 'confirmation'});
    expect(confirmation).toHaveLength(112);
    expect(new Set(confirmation.map(entry => entry.fixture))).toEqual(
      new Set(matrix.fixtures),
    );
    expect(new Set(confirmation.map(entry => entry.prompt))).toEqual(
      new Set(['s0', 's1', 's2', 's3', 's4', 's5']),
    );
    expect(new Set(confirmation.map(entry => entry.condition))).toEqual(
      new Set(['candidate']),
    );
    expect(
      confirmation.every(entry => entry.id.startsWith('confirmation__')),
    ).toBe(true);
  });

  it('applies each cross-system prompt only to its supported established fixture', () => {
    const confirmation = expandSetupMatrix(matrix, {
      stage: 'confirmation',
      prompts: ['s4', 's5'],
      reps: 1,
    });
    expect(
      new Set(confirmation.map(entry => `${entry.prompt}:${entry.fixture}`)),
    ).toEqual(
      new Set([
        's4:shadcn-tailwind-v4-established',
        's5:enterprise-scoped-synthetic',
      ]),
    );
    expect(confirmation).toHaveLength(2 * 4);
  });

  it('keeps harness/model bundles paired instead of taking their cross-product', () => {
    const entries = expandSetupMatrix(matrix, {stage: 'separation'});
    expect(new Set(entries.map(entry => entry.bundle))).toEqual(
      new Set([
        'native-claude',
        'claude-code-claude',
        'native-gpt',
        'codex-gpt',
      ]),
    );
  });

  it('emits a sidecar accepted by the shared provenance parser', () => {
    const entry = expandSetupMatrix(matrix, {
      stage: 'separation',
      fixtures: [matrix.fixtures[0]],
      conditions: ['floor'],
      prompts: ['s1'],
      bundles: [matrix.bundles[0].id],
      reps: 1,
    })[0];
    const fixtureSha256 = fixtureManifestSha256(recipe(entry.fixture));
    const sidecar = createSetupProvenance({
      entry,
      taskSha256: sha256Text('stable task'),
      fixtureSha256,
      environmentHash: sha256Text(`${fixtureSha256}:${entry.condition}`),
    });
    expect(parseExecutionProvenanceV1(sidecar)).toMatchObject({
      task: {id: 's1'},
      fixture: {id: entry.fixture},
      condition: 'floor',
      executor: {harness: entry.harness, model: entry.model},
      execution: {status: 'prepared'},
      matrix: {stage: 'separation', bundle: entry.bundle},
      rep: 1,
    });
  });

  it('rejects invalid or empty selections', () => {
    expect(() =>
      expandSetupMatrix(matrix, {stage: 'separation', reps: 0}),
    ).toThrow(/positive integer/);
    expect(() =>
      expandSetupMatrix(matrix, {
        stage: 'separation',
        fixtures: ['missing-fixture'],
      }),
    ).toThrow(/unknown fixture/);
    expect(() =>
      expandSetupMatrix(matrix, {
        stage: 'confirmation',
        fixtures: ['tailwind-v4-control'],
        prompts: ['s4'],
      }),
    ).toThrow(/no supported fixture-prompt cells/);
  });

  it('rejects duplicate bundle labels and invalid reuse references', () => {
    const duplicate = structuredClone(matrix);
    duplicate.bundles[1].id = duplicate.bundles[0].id;
    expect(() => validateSetupMatrixConfig(duplicate)).toThrow(
      /bundle ids must not contain duplicates/,
    );

    const forwardReuse = structuredClone(matrix);
    forwardReuse.stages[0].reuseFromStages = ['confirmation'];
    expect(() => validateSetupMatrixConfig(forwardReuse)).toThrow(
      /only an earlier stage/,
    );
  });
});

describe('strategy pilot stage', () => {
  const conditionsFile = JSON.parse(
    fs.readFileSync(path.join(HERE, 'conditions.json'), 'utf8'),
  );
  const pilot = matrix.stages.find(stage => stage.id === 'strategy-pilot');

  it('is additive: it follows every control stage and reuses none of them', () => {
    // The pilot was appended after the control stages and is now itself
    // followed by the iteration stage that reruns four of its cells. What has
    // to hold is that no control stage precedes it by accident and that it
    // borrows nothing: its own position stopped being last when the iteration
    // stage was added, and that is the point of adding a stage rather than
    // editing this one.
    const stageIds = matrix.stages.map(stage => stage.id);
    expect(stageIds.indexOf('strategy-pilot')).toBeGreaterThan(
      stageIds.indexOf('confirmation'),
    );
    expect(stageIds.at(-1)).toBe('strategy-iteration-2');
    // stages[0] is the default stage for run-setup.mjs and setup-aggregate.ts.
    expect(matrix.stages[0].id).toBe('separation');
    expect(pilot.reuseFromStages).toBeUndefined();
  });

  it('prepares exactly 80 cells from 5 fixture-prompt pairs', () => {
    const entries = expandSetupMatrix(matrix, {stage: 'strategy-pilot'});
    expect(entries).toHaveLength(80);

    // 5 pairs x 2 strategies x 4 bundles x K=2.
    expect(
      new Set(entries.map(entry => `${entry.fixture}:${entry.prompt}`)),
    ).toEqual(
      new Set([
        'tailwind-v4-control:s1',
        'shadcn-tailwind-v4-established:s1',
        'enterprise-scoped-synthetic:s1',
        'shadcn-tailwind-v4-established:s4',
        'enterprise-scoped-synthetic:s5',
      ]),
    );
    expect(new Set(entries.map(entry => entry.condition))).toEqual(
      new Set(['host-aligned', 'guest-contained']),
    );
    expect(new Set(entries.map(entry => entry.rep))).toEqual(new Set([1, 2]));
    expect(new Set(entries.map(entry => entry.bundle))).toEqual(
      new Set([
        'native-claude',
        'claude-code-claude',
        'native-gpt',
        'codex-gpt',
      ]),
    );
    expect(
      entries.every(entry => entry.id.startsWith('strategy-pilot__')),
    ).toBe(true);
    expect(new Set(entries.map(entry => entry.id)).size).toBe(80);
  });

  it('characterizes downstream composition, not install-time only', () => {
    const entries = expandSetupMatrix(matrix, {stage: 'strategy-pilot'});
    // Both cross-system directions are represented: an Astryx overlay inside a
    // host dialog (s4) and a host menu inside an Astryx dialog (s5).
    expect(entries.some(entry => entry.prompt === 's4')).toBe(true);
    expect(entries.some(entry => entry.prompt === 's5')).toBe(true);
    for (const prompt of ['s4', 's5']) {
      expect(entries.filter(entry => entry.prompt === prompt)).toHaveLength(
        2 * 4 * 2,
      );
    }
    expect(entries.filter(entry => entry.prompt === 's1')).toHaveLength(
      3 * 2 * 4 * 2,
    );
  });

  it('overlaps no existing stage by cell key or by cell id', () => {
    const pilotEntries = expandSetupMatrix(matrix, {stage: 'strategy-pilot'});
    const existing = ['separation', 'guidance', 'confirmation'].flatMap(stage =>
      expandSetupMatrix(matrix, {stage}),
    );
    const existingKeys = new Set(existing.map(setupCellKey));
    const existingIds = new Set(existing.map(entry => entry.id));

    expect(
      pilotEntries.filter(entry => existingKeys.has(setupCellKey(entry))),
    ).toEqual([]);
    expect(pilotEntries.filter(entry => existingIds.has(entry.id))).toEqual([]);
    expect(
      new Set([...existing, ...pilotEntries].map(entry => entry.id)),
    ).toHaveLength(existing.length + pilotEntries.length);
  });

  it('leaves every pre-existing stage expansion byte-stable', () => {
    // These counts and identities predate the pilot. If adding a stage or a
    // condition ever perturbs them, prior evidence stops being comparable.
    const separation = expandSetupMatrix(matrix, {stage: 'separation'});
    const guidance = expandSetupMatrix(matrix, {stage: 'guidance'});
    const confirmation = expandSetupMatrix(matrix, {stage: 'confirmation'});
    expect(separation).toHaveLength(48);
    expect(guidance).toHaveLength(400);
    expect(confirmation).toHaveLength(112);

    for (const entries of [separation, guidance, confirmation]) {
      expect(
        entries.every(entry =>
          ['floor', 'current', 'candidate', 'direct'].includes(entry.condition),
        ),
      ).toBe(true);
    }

    // Spot-check exact ids at the expansion boundaries.
    expect(separation[0].id).toBe(
      'separation__floor__tailwind-v4-control__s1__native-claude__r1',
    );
    expect(confirmation.at(-1).id).toBe(
      'confirmation__candidate__enterprise-scoped-synthetic__s5__codex-gpt__r2',
    );
  });

  it('leaves the pre-existing conditions unchanged', () => {
    const byId = new Map(
      conditionsFile.conditions.map(condition => [condition.id, condition]),
    );
    expect(byId.get('current')).toEqual({
      id: 'current',
      label: 'Current public guidance',
      role: 'current-control',
      patches: ['patch:pointer'],
      hypothesis:
        'A pointer makes the current public setup guidance discoverable but does not change its instructions.',
    });
    expect(byId.get('candidate').patches).toEqual([
      'patch:pointer',
      'patch:existing-app',
    ]);
    expect(byId.get('direct').patches).toEqual([
      'patch:pointer',
      'patch:existing-app',
      'patch:directed',
    ]);
    expect(byId.get('floor').patches).toEqual([]);
  });

  it('marks every strategy condition opt-in and none as a default', () => {
    const strategies = conditionsFile.conditions.filter(
      condition => condition.role === 'strategy-pilot',
    );
    expect(strategies.map(condition => condition.id)).toEqual([
      'host-aligned',
      'guest-contained',
      'guest-contained-r2',
      'host-aligned-r2',
      'guest-contained-r3',
      'host-aligned-r3',
    ]);
    expect(strategies.every(condition => condition.optIn === true)).toBe(true);
    // A strategy is never combined with the generic existing-app recipe.
    for (const strategy of strategies) {
      expect(strategy.patches).not.toContain('patch:existing-app');
      expect(strategy.patches[0]).toBe('patch:pointer');
    }
  });

  it('declares each revision against the condition it revises, and changes neither', () => {
    const byId = new Map(
      conditionsFile.conditions.map(condition => [condition.id, condition]),
    );
    for (const [revision, original] of Object.entries(
      conditionsFile.strategyPilot.revisions,
    ).filter(([key]) => key !== '$comment')) {
      const revised = byId.get(revision);
      expect(revised.revisionOf).toBe(original);
      // A revision carries the same patch set; what differs is the text behind
      // those patches, the measurement, or both — and it says which.
      expect(revised.patches).toEqual(byId.get(original).patches);
      expect(revised.changedSincePriorRevision).toBeTruthy();
    }
    // The revised conditions keep their own ids and hypotheses untouched.
    expect(byId.get('host-aligned').revisionOf).toBeUndefined();
    expect(byId.get('guest-contained').revisionOf).toBeUndefined();
  });

  it('filters to the documented 10-cell initial operator run', () => {
    const filtered = expandSetupMatrix(matrix, {
      stage: 'strategy-pilot',
      bundles: ['claude-code-claude'],
      reps: 1,
    });
    expect(filtered).toHaveLength(10);
    expect(new Set(filtered.map(entry => entry.bundle))).toEqual(
      new Set(['claude-code-claude']),
    );
    expect(new Set(filtered.map(entry => entry.rep))).toEqual(new Set([1]));
    // Filtering is a selection over the same 80 prepared cells, not a
    // different matrix: every filtered id is one of them.
    const all = new Set(
      expandSetupMatrix(matrix, {stage: 'strategy-pilot'}).map(
        entry => entry.id,
      ),
    );
    expect(filtered.every(entry => all.has(entry.id))).toBe(true);
  });
});

/**
 * The iteration stage that reruns the four strategy-pilot cells that failed.
 *
 * Its whole reason to exist is that the pilot's own cells must not move. A
 * rerun under the same ids would overwrite the measurements that justified the
 * changes being tested, so the reruns carry new condition ids and land in a new
 * stage, and these tests hold both halves of that: the four new cells are
 * exactly the four intended ones, and every earlier stage expands to precisely
 * what it expanded to before.
 */
describe('strategy-iteration — rerunning four pilot cells without moving them', () => {
  const iteration = expandSetupMatrix(matrix, {stage: 'strategy-iteration'});

  it('expands to exactly the four cells that failed the pilot', () => {
    expect([...iteration.map(entry => entry.id)].sort()).toEqual([
      'strategy-iteration__guest-contained-r2__enterprise-scoped-synthetic__s1__claude-code-claude__r1',
      'strategy-iteration__guest-contained-r2__shadcn-tailwind-v4-established__s4__claude-code-claude__r1',
      'strategy-iteration__host-aligned-r2__enterprise-scoped-synthetic__s5__claude-code-claude__r1',
      'strategy-iteration__host-aligned-r2__shadcn-tailwind-v4-established__s1__claude-code-claude__r1',
    ]);
  });

  it('does not expand to the cross product of its own dimensions', () => {
    // Two conditions over two fixtures and three prompts would be eight cells.
    // The allowlist is what keeps the expected set equal to the intended set,
    // so coverage and acceptance stay meaningful for this stage.
    expect(iteration).toHaveLength(4);
  });

  it('maps every cell to the pilot cell it reruns', () => {
    const stage = matrix.stages.find(
      entry => entry.id === 'strategy-iteration',
    );
    const pairs = stage.comparisonMapping.pairs;
    expect(pairs).toHaveLength(iteration.length);
    expect([...pairs.map(pair => pair.iteration)].sort()).toEqual(
      [...iteration.map(entry => entry.id)].sort(),
    );

    const pilotIds = new Set(
      expandSetupMatrix(matrix, {stage: 'strategy-pilot'}).map(
        entry => entry.id,
      ),
    );
    for (const pair of pairs) {
      expect(pilotIds.has(pair.pilot)).toBe(true);
      expect(pair.pilotFinding).toBeTruthy();
      expect(pair.changed).toBeTruthy();
    }
  });

  it('collides with no earlier stage by cell key or cell id', () => {
    const earlier = [
      'separation',
      'guidance',
      'confirmation',
      'strategy-pilot',
    ].flatMap(stage => expandSetupMatrix(matrix, {stage}));
    const keys = new Set(earlier.map(setupCellKey));
    const ids = new Set(earlier.map(entry => entry.id));

    expect(iteration.filter(entry => keys.has(setupCellKey(entry)))).toEqual(
      [],
    );
    expect(iteration.filter(entry => ids.has(entry.id))).toEqual([]);
  });

  it('leaves the strategy-pilot expansion exactly as it was', () => {
    const pilot = expandSetupMatrix(matrix, {stage: 'strategy-pilot'});
    expect(pilot).toHaveLength(80);
    expect(
      pilot.every(entry =>
        ['host-aligned', 'guest-contained'].includes(entry.condition),
      ),
    ).toBe(true);
    // The four reruns name these; if any pilot id moved, the mapping breaks.
    for (const id of [
      'strategy-pilot__guest-contained__enterprise-scoped-synthetic__s1__claude-code-claude__r1',
      'strategy-pilot__guest-contained__shadcn-tailwind-v4-established__s4__claude-code-claude__r1',
      'strategy-pilot__host-aligned__shadcn-tailwind-v4-established__s1__claude-code-claude__r1',
      'strategy-pilot__host-aligned__enterprise-scoped-synthetic__s5__claude-code-claude__r1',
    ]) {
      expect(pilot.some(entry => entry.id === id)).toBe(true);
    }
  });
});

describe('stage cell allowlists are validated, not trusted', () => {
  const withIterationCells = cells => {
    const config = JSON.parse(JSON.stringify(matrix));
    const stage = config.stages.find(
      entry => entry.id === 'strategy-iteration',
    );
    stage.cells = cells;
    return config;
  };

  it('rejects a cell naming a condition the stage does not list', () => {
    expect(() =>
      validateSetupMatrixConfig(
        withIterationCells([
          {
            condition: 'floor',
            fixture: 'enterprise-scoped-synthetic',
            prompt: 's1',
          },
        ]),
      ),
    ).toThrow(/condition floor, which the stage does not list/);
  });

  it('rejects a cell pairing a prompt with an unsupported fixture', () => {
    expect(() =>
      validateSetupMatrixConfig(
        withIterationCells([
          {
            condition: 'guest-contained-r2',
            fixture: 'enterprise-scoped-synthetic',
            prompt: 's4',
          },
        ]),
      ),
    ).toThrow(/prompt s4 with unsupported fixture/);
  });

  it('rejects a duplicated cell', () => {
    const cell = {
      condition: 'guest-contained-r2',
      fixture: 'enterprise-scoped-synthetic',
      prompt: 's1',
    };
    expect(() =>
      validateSetupMatrixConfig(withIterationCells([cell, {...cell}])),
    ).toThrow(/duplicates cell/);
  });

  it('rejects an empty allowlist rather than silently covering everything', () => {
    expect(() => validateSetupMatrixConfig(withIterationCells([]))).toThrow(
      /cells must be a non-empty array/,
    );
  });
});

/**
 * Stale evidence has to be detectable.
 *
 * The pilot's host-aligned cells were scored against an instruction that no
 * sandbox they produced ever contained: the rule was written into the guidance
 * after those runs. The only thing that can catch that is the digest each run
 * records of the guidance it was handed, so this pins the property that makes
 * the digest useful — it changes when the text changes.
 */
describe('recorded guidance digests distinguish revisions', () => {
  const fixtureSha256 = sha256Text('fixture');
  const hashFor = text =>
    setupEnvironmentHash({
      fixtureSha256,
      condition: 'host-aligned',
      patches: [['patch:host-aligned', text]],
    });

  it('changes when a single byte of the guidance changes', () => {
    expect(hashFor('rule A')).not.toBe(hashFor('rule A.'));
  });

  it('changes when the same text is delivered under a different condition', () => {
    expect(
      setupEnvironmentHash({
        fixtureSha256,
        condition: 'host-aligned',
        patches: [['patch:host-aligned', 'same']],
      }),
    ).not.toBe(
      setupEnvironmentHash({
        fixtureSha256,
        condition: 'host-aligned-r2',
        patches: [['patch:host-aligned', 'same']],
      }),
    );
  });

  it('is stable for identical inputs', () => {
    expect(hashFor('rule A')).toBe(hashFor('rule A'));
  });
});

/**
 * The second iteration stage: two cells, and nothing before it moves.
 *
 * Same contract as the first. What is worth pinning separately is that the
 * chain holds — r3 revises r2, which revises the original — and that adding a
 * third generation of a condition did not disturb the two already recorded.
 */
describe('strategy-iteration-2 — rerunning two cells without moving anything', () => {
  const iteration2 = expandSetupMatrix(matrix, {stage: 'strategy-iteration-2'});

  it('expands to exactly the two cells that failed the first iteration', () => {
    expect([...iteration2.map(entry => entry.id)].sort()).toEqual([
      'strategy-iteration-2__guest-contained-r3__enterprise-scoped-synthetic__s1__claude-code-claude__r1',
      'strategy-iteration-2__host-aligned-r3__enterprise-scoped-synthetic__s5__claude-code-claude__r1',
    ]);
  });

  it('does not expand to the cross product of its own dimensions', () => {
    // Two conditions over two prompts on one fixture would be four cells; only
    // the two pairings that name real predecessors are in the allowlist.
    expect(iteration2).toHaveLength(2);
  });

  it('maps every cell to the cell it reruns', () => {
    const stage = matrix.stages.find(
      entry => entry.id === 'strategy-iteration-2',
    );
    const pairs = stage.comparisonMapping.pairs;
    expect(pairs).toHaveLength(iteration2.length);
    expect([...pairs.map(pair => pair.iteration)].sort()).toEqual(
      [...iteration2.map(entry => entry.id)].sort(),
    );

    const predecessors = new Set(
      expandSetupMatrix(matrix, {stage: 'strategy-iteration'}).map(
        entry => entry.id,
      ),
    );
    for (const pair of pairs) {
      expect(predecessors.has(pair.predecessor)).toBe(true);
      expect(pair.priorFinding).toBeTruthy();
      expect(pair.changed).toBeTruthy();
    }
  });

  it('collides with no earlier stage by cell key or cell id', () => {
    const earlier = [
      'separation',
      'guidance',
      'confirmation',
      'strategy-pilot',
      'strategy-iteration',
    ].flatMap(stage => expandSetupMatrix(matrix, {stage}));
    const keys = new Set(earlier.map(setupCellKey));
    const ids = new Set(earlier.map(entry => entry.id));

    expect(iteration2.filter(entry => keys.has(setupCellKey(entry)))).toEqual(
      [],
    );
    expect(iteration2.filter(entry => ids.has(entry.id))).toEqual([]);
  });

  it('leaves every earlier stage expansion at its exact count', () => {
    expect(expandSetupMatrix(matrix, {stage: 'separation'})).toHaveLength(48);
    expect(expandSetupMatrix(matrix, {stage: 'guidance'})).toHaveLength(400);
    expect(expandSetupMatrix(matrix, {stage: 'confirmation'})).toHaveLength(
      112,
    );
    expect(expandSetupMatrix(matrix, {stage: 'strategy-pilot'})).toHaveLength(
      80,
    );
    expect(
      expandSetupMatrix(matrix, {stage: 'strategy-iteration'}),
    ).toHaveLength(4);
  });

  it('chains each revision to the one before it', () => {
    const conditions = JSON.parse(
      fs.readFileSync(path.join(HERE, 'conditions.json'), 'utf8'),
    );
    const byId = new Map(
      conditions.conditions.map(condition => [condition.id, condition]),
    );
    expect(byId.get('guest-contained-r3').revisionOf).toBe(
      'guest-contained-r2',
    );
    expect(byId.get('host-aligned-r3').revisionOf).toBe('host-aligned-r2');
    expect(byId.get('guest-contained-r2').revisionOf).toBe('guest-contained');
    expect(byId.get('host-aligned-r2').revisionOf).toBe('host-aligned');
    // A revision changes the text behind a patch, never the patch set.
    for (const id of ['guest-contained-r3', 'host-aligned-r3']) {
      const revision = byId.get(id);
      expect(revision.patches).toEqual(byId.get(revision.revisionOf).patches);
      expect(revision.changedSincePriorRevision).toBeTruthy();
    }
  });
});
