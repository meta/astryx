// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
/**
 * The host-probe fields a task contract may ever exempt.
 *
 * A task that inserts a control into an existing container moves what follows
 * it and makes the container taller, so those consequences can be declared as
 * intended. Nothing else can: no computed style, no width, and no container
 * text. `text` is deliberately absent — a task that adds copy to a container
 * declares `textInsertionOnly`, which permits text the container *gains* and
 * still reports text it loses or rewrites, where a `text` field would exempt
 * the comparison outright and let an executor delete host copy.
 */
const ALLOWABLE_HOST_FIELDS = new Set([
  'geometry.x',
  'geometry.y',
  'geometry.top',
  'geometry.right',
  'geometry.bottom',
  'geometry.left',
  // Block-axis growth only: an insertion makes a container taller, never wider.
  'height',
  'geometry.height',
]);
const ALLOWABLE_OVERLAY_FIELDS = new Set([
  'geometry.x',
  'geometry.y',
  'geometry.top',
  'geometry.right',
  'geometry.bottom',
  'geometry.left',
  'geometry.width',
  'geometry.height',
]);

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function requireNonEmpty(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

export function taskContractText(prompt, fixtureId) {
  if (!prompt.fixtures.includes(fixtureId)) {
    throw new Error(
      `prompt ${prompt.id} does not support fixture ${fixtureId}`,
    );
  }
  const replacements = prompt.contract.replacedHostProbes.filter(
    replaced => replaced.fixture === fixtureId,
  );
  const replacementResults = new Set(
    replacements.map(replaced => replaced.result),
  );
  const resultByName = new Map(
    prompt.contract.results.map(result => [result.name, result]),
  );
  const markers = new Map();
  const marker = name => {
    const existing = markers.get(name);
    if (existing) return existing;
    const created = {description: null, surfaces: []};
    markers.set(name, created);
    return created;
  };

  for (const result of prompt.contract.results) {
    if (!replacementResults.has(result.name)) {
      marker(result.name).description = result.description;
    }
  }
  for (const interaction of prompt.contract.interactions) {
    for (const step of interaction.open) {
      if (step.source !== 'result') continue;
      const entry = marker(step.name);
      entry.description ??= `the ${step.name.replaceAll('-', ' ')}`;
    }
    for (const surface of interaction.surfaces) {
      if (surface.source !== 'result') continue;
      const name = surface.marker ?? surface.name;
      const entry = marker(name);
      if (!entry.surfaces.some(role => role.name === surface.name)) {
        entry.surfaces.push({name: surface.name, kind: surface.kind});
      }
    }
  }

  const markerLines = [...markers].map(([name, entry]) => {
    const surfaceRoles = [...entry.surfaces].sort(
      (left, right) => Number(right.name === name) - Number(left.name === name),
    );
    let description = entry.description;
    if (surfaceRoles.length === 1) {
      const role = surfaceRoles[0];
      description =
        role.kind === 'backdrop'
          ? `the ${role.name.replaceAll('-', ' ')} (the \`::backdrop\` of this element)`
          : `the ${role.name.replaceAll('-', ' ')} (${role.kind} surface)`;
    } else if (surfaceRoles.length > 1) {
      const roles = surfaceRoles.map(role =>
        role.kind === 'backdrop'
          ? `the ${role.name.replaceAll('-', ' ')} (the \`::backdrop\` of this element)`
          : `the ${role.name.replaceAll('-', ' ')} (${role.kind} surface)`,
      );
      description = `one element serving all measured roles: ${roles.join('; ')}`;
    }
    return `- \`data-vibe-result="${name}"\` on ${description}`;
  });

  const replacementLines = replacements.map(replaced => {
    const result = resultByName.get(replaced.result);
    const preserveText =
      result?.preserveTextFromHostProbe === replaced.probe
        ? ' Preserve the original probe text exactly.'
        : '';
    return `- Replace \`data-vibe-probe="${replaced.probe}"\`: remove that probe attribute from the original host treatment so it no longer exists as a host probe, and put \`data-vibe-result="${replaced.result}"\` on its replacement.${preserveText}`;
  });
  const markerSection =
    markerLines.length > 0
      ? `\nAdd exactly one of each other task-owned marker below to the element it describes:\n\n${markerLines.join('\n')}\n`
      : '';
  const replacementSection =
    replacementLines.length > 0
      ? `\nThe following host probes are intentional replacements for this fixture. Keep every other existing \`data-vibe-probe\` attribute:\n\n${replacementLines.join('\n')}\n`
      : '\nKeep every existing `data-vibe-probe` attribute on pre-existing host UI.\n';

  return `## Measurement contract
${replacementSection}${markerSection}
The markers are measurement hooks only. They do not choose the implementation.
Do not patch or replace unrelated host UI, delete or neutralize host CSS, disable
color modes, add blanket resets or \`!important\`, or avoid the requested
Astryx/Tailwind composition.`;
}

export function setupCellKey(entry) {
  return [
    entry.condition,
    entry.fixture,
    entry.prompt,
    entry.bundle,
    `r${entry.rep}`,
  ].join('__');
}

export function validatePromptContracts(prompts, probeConfig, matrixConfig) {
  assertUnique(
    prompts.map(prompt => prompt.id),
    'prompt ids',
  );
  for (const prompt of prompts) {
    const contract = prompt.contract;
    if (!contract || !Array.isArray(contract.allowedHostChanges)) {
      throw new Error(`prompt ${prompt.id} is missing allowedHostChanges`);
    }
    if ('allowedHostProbeChanges' in contract || 'requiresAstryx' in contract) {
      throw new Error(`prompt ${prompt.id} uses a retired contract field`);
    }
    const configuredFixtures = matrixConfig.promptFixtures[prompt.id];
    if (
      !configuredFixtures ||
      JSON.stringify([...configuredFixtures].sort()) !==
        JSON.stringify([...prompt.fixtures].sort())
    ) {
      throw new Error(
        `prompt ${prompt.id} fixture applicability does not match matrix.json`,
      );
    }
    const seen = new Set();
    for (const allowed of contract.allowedHostChanges) {
      if (!prompt.fixtures.includes(allowed.fixture)) {
        throw new Error(
          `prompt ${prompt.id} allows a change in unsupported fixture ${allowed.fixture}`,
        );
      }
      const fixture = probeConfig.fixtures[allowed.fixture];
      if (!fixture?.probes.some(probe => probe.name === allowed.probe)) {
        throw new Error(
          `prompt ${prompt.id} allows unknown probe ${allowed.fixture}:${allowed.probe}`,
        );
      }
      requireNonEmpty(
        allowed.fields,
        `prompt ${prompt.id} ${allowed.fixture}:${allowed.probe} fields`,
      );
      assertUnique(
        allowed.fields,
        `prompt ${prompt.id} ${allowed.fixture}:${allowed.probe} fields`,
      );
      if (
        'textInsertionOnly' in allowed &&
        typeof allowed.textInsertionOnly !== 'boolean'
      ) {
        throw new Error(
          `prompt ${prompt.id} ${allowed.fixture}:${allowed.probe} textInsertionOnly must be a boolean`,
        );
      }
      for (const field of allowed.fields) {
        if (!ALLOWABLE_HOST_FIELDS.has(field)) {
          throw new Error(
            `prompt ${prompt.id} cannot allow protected host field ${field}`,
          );
        }
        const key = `${allowed.fixture}:${allowed.probe}:${field}`;
        if (seen.has(key)) {
          throw new Error(
            `prompt ${prompt.id} duplicates allowed field ${key}`,
          );
        }
        seen.add(key);
      }
    }
    const resultsByName = new Map(
      (contract.results ?? []).map(result => [result.name, result]),
    );
    if (!Array.isArray(contract.replacedHostProbes)) {
      throw new Error(`prompt ${prompt.id} is missing replacedHostProbes`);
    }
    const replacedKeys = new Set();
    for (const replaced of contract.replacedHostProbes) {
      if (!prompt.fixtures.includes(replaced.fixture)) {
        throw new Error(
          `prompt ${prompt.id} replaces a probe in unsupported fixture ${replaced.fixture}`,
        );
      }
      const fixture = probeConfig.fixtures[replaced.fixture];
      if (!fixture?.probes.some(probe => probe.name === replaced.probe)) {
        throw new Error(
          `prompt ${prompt.id} replaces unknown probe ${replaced.fixture}:${replaced.probe}`,
        );
      }
      const replacementResult = resultsByName.get(replaced.result);
      if (!replacementResult) {
        throw new Error(
          `prompt ${prompt.id} replacement ${replaced.probe} references unknown result ${replaced.result}`,
        );
      }
      if (replacementResult.preserveTextFromHostProbe !== replaced.probe) {
        throw new Error(
          `prompt ${prompt.id} replacement ${replaced.probe} must preserve its host text in result ${replaced.result}`,
        );
      }
      const key = `${replaced.fixture}:${replaced.probe}`;
      if (replacedKeys.has(key)) {
        throw new Error(`prompt ${prompt.id} duplicates replacement ${key}`);
      }
      replacedKeys.add(key);
    }
    if (prompt.id === 's2') {
      for (const fixture of prompt.fixtures) {
        const replacementCount = contract.replacedHostProbes.filter(
          replaced => replaced.fixture === fixture,
        ).length;
        if (replacementCount !== 1) {
          throw new Error(
            `prompt s2 must replace exactly one host probe in ${fixture}`,
          );
        }
      }
    }

    if (!Array.isArray(contract.allowedOverlayChanges)) {
      throw new Error(`prompt ${prompt.id} is missing allowedOverlayChanges`);
    }
    const overlayKeys = new Set();
    for (const allowed of contract.allowedOverlayChanges) {
      if (!prompt.fixtures.includes(allowed.fixture)) {
        throw new Error(
          `prompt ${prompt.id} allows an overlay change in unsupported fixture ${allowed.fixture}`,
        );
      }
      const surfaces =
        probeConfig.fixtures[allowed.fixture]?.interaction?.surfaces;
      if (!surfaces?.some(surface => surface.name === allowed.surface)) {
        throw new Error(
          `prompt ${prompt.id} allows unknown overlay ${allowed.fixture}:${allowed.surface}`,
        );
      }
      requireNonEmpty(
        allowed.fields,
        `prompt ${prompt.id} ${allowed.fixture}:${allowed.surface} overlay fields`,
      );
      assertUnique(
        allowed.fields,
        `prompt ${prompt.id} ${allowed.fixture}:${allowed.surface} overlay fields`,
      );
      for (const field of allowed.fields) {
        if (!ALLOWABLE_OVERLAY_FIELDS.has(field)) {
          throw new Error(
            `prompt ${prompt.id} cannot allow protected overlay field ${field}`,
          );
        }
        const key = `${allowed.fixture}:${allowed.surface}:${field}`;
        if (overlayKeys.has(key)) {
          throw new Error(
            `prompt ${prompt.id} duplicates allowed overlay field ${key}`,
          );
        }
        overlayKeys.add(key);
      }
    }
  }
  return prompts;
}

export function validateSetupMatrixConfig(config) {
  if (config?.schemaVersion !== 1) {
    throw new Error('setup matrix schemaVersion must be 1');
  }
  requireNonEmpty(config.fixtures, 'fixtures');
  requireNonEmpty(config.bundles, 'bundles');
  requireNonEmpty(config.stages, 'stages');
  assertUnique(config.fixtures, 'fixtures');
  assertUnique(
    config.bundles.map(bundle => bundle.id),
    'bundle ids',
  );
  assertUnique(
    config.stages.map(stage => stage.id),
    'stage ids',
  );

  for (const bundle of config.bundles) {
    for (const field of ['id', 'harness', 'model', 'effort']) {
      if (typeof bundle[field] !== 'string' || bundle[field].length === 0) {
        throw new Error(`bundle ${field} must be a non-empty string`);
      }
    }
    if (bundle.blocked !== undefined && typeof bundle.blocked !== 'boolean') {
      throw new Error(`bundle ${bundle.id} blocked must be boolean`);
    }
    if (bundle.blocked && !bundle.blocker) {
      throw new Error(`blocked bundle ${bundle.id} must name its blocker`);
    }
  }

  if (!config.promptFixtures || typeof config.promptFixtures !== 'object') {
    throw new Error('promptFixtures must be an object');
  }
  const fixtureSet = new Set(config.fixtures);
  for (const [prompt, fixtures] of Object.entries(config.promptFixtures)) {
    requireNonEmpty(fixtures, `prompt ${prompt} fixtures`);
    assertUnique(fixtures, `prompt ${prompt} fixtures`);
    for (const fixture of fixtures) {
      if (!fixtureSet.has(fixture)) {
        throw new Error(
          `prompt ${prompt} references unknown fixture ${fixture}`,
        );
      }
    }
  }

  const bundleSet = new Set(config.bundles.map(bundle => bundle.id));
  const seenStages = new Set();
  for (const stage of config.stages) {
    for (const field of ['fixtures', 'conditions', 'prompts', 'bundles']) {
      requireNonEmpty(stage[field], `stage ${stage.id} ${field}`);
      assertUnique(stage[field], `stage ${stage.id} ${field}`);
    }
    if (!Number.isInteger(stage.reps) || stage.reps < 1) {
      throw new Error(`stage ${stage.id} reps must be a positive integer`);
    }
    for (const fixture of stage.fixtures) {
      if (!fixtureSet.has(fixture)) {
        throw new Error(
          `stage ${stage.id} references unknown fixture ${fixture}`,
        );
      }
    }
    for (const prompt of stage.prompts) {
      if (!config.promptFixtures[prompt]) {
        throw new Error(
          `stage ${stage.id} references unknown prompt ${prompt}`,
        );
      }
    }
    for (const bundle of stage.bundles) {
      if (!bundleSet.has(bundle)) {
        throw new Error(
          `stage ${stage.id} references unknown bundle ${bundle}`,
        );
      }
    }
    for (const reused of stage.reuseFromStages ?? []) {
      if (!seenStages.has(reused)) {
        throw new Error(
          `stage ${stage.id} can reuse only an earlier stage, not ${reused}`,
        );
      }
    }
    if (stage.cells !== undefined) {
      requireNonEmpty(stage.cells, `stage ${stage.id} cells`);
      const stageConditions = new Set(stage.conditions);
      const stageFixtures = new Set(stage.fixtures);
      const stagePrompts = new Set(stage.prompts);
      const seenCells = new Set();
      for (const cell of stage.cells) {
        for (const field of ['condition', 'fixture', 'prompt']) {
          if (typeof cell?.[field] !== 'string' || cell[field].length === 0) {
            throw new Error(
              `stage ${stage.id} cell ${field} must be a non-empty string`,
            );
          }
        }
        if (!stageConditions.has(cell.condition)) {
          throw new Error(
            `stage ${stage.id} cell names condition ${cell.condition}, which the stage does not list`,
          );
        }
        if (!stageFixtures.has(cell.fixture)) {
          throw new Error(
            `stage ${stage.id} cell names fixture ${cell.fixture}, which the stage does not list`,
          );
        }
        if (!stagePrompts.has(cell.prompt)) {
          throw new Error(
            `stage ${stage.id} cell names prompt ${cell.prompt}, which the stage does not list`,
          );
        }
        if (!config.promptFixtures[cell.prompt].includes(cell.fixture)) {
          throw new Error(
            `stage ${stage.id} cell pairs prompt ${cell.prompt} with unsupported fixture ${cell.fixture}`,
          );
        }
        const key = `${cell.condition}__${cell.fixture}__${cell.prompt}`;
        if (seenCells.has(key)) {
          throw new Error(`stage ${stage.id} duplicates cell ${key}`);
        }
        seenCells.add(key);
      }
    }
    seenStages.add(stage.id);
  }

  const retryPolicy = config.infraRetryPolicy;
  if (
    !retryPolicy ||
    !Number.isInteger(retryPolicy.maxRetriesPerCell) ||
    retryPolicy.maxRetriesPerCell < 0
  ) {
    throw new Error('infraRetryPolicy.maxRetriesPerCell must be nonnegative');
  }
  requireNonEmpty(
    retryPolicy.retryableStatuses,
    'infraRetryPolicy.retryableStatuses',
  );
  return config;
}

function select(available, requested, label) {
  if (!requested?.length) return available;
  const availableSet = new Set(available);
  for (const value of requested) {
    if (!availableSet.has(value)) {
      throw new Error(`unknown ${label}: ${value}`);
    }
  }
  return requested;
}

function rawEntries(config, stage, selections = {}) {
  const fixtures = select(stage.fixtures, selections.fixtures, 'fixture');
  const conditions = select(
    stage.conditions,
    selections.conditions,
    'condition',
  );
  const prompts = select(stage.prompts, selections.prompts, 'prompt');
  const bundleIds = select(stage.bundles, selections.bundles, 'bundle');
  const reps = selections.reps ?? stage.reps;
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('reps must be a positive integer');
  }
  const bundleById = new Map(config.bundles.map(bundle => [bundle.id, bundle]));
  /**
   * An optional allowlist of the exact condition/fixture/prompt triples a stage
   * covers.
   *
   * A stage is otherwise the full cross product of its dimensions, which cannot
   * describe a stage that reruns a named handful of earlier cells: the four
   * cells this exists for span two conditions and two fixtures, and their cross
   * product is eight. Listing them keeps the expected set equal to the intended
   * set, so coverage and acceptance stay honest instead of reporting a stage
   * that can never be complete.
   */
  const allowedCells = stage.cells
    ? new Set(
        stage.cells.map(
          cell => `${cell.condition}__${cell.fixture}__${cell.prompt}`,
        ),
      )
    : null;
  const entries = [];

  for (const fixture of fixtures) {
    for (const condition of conditions) {
      for (const prompt of prompts) {
        if (!config.promptFixtures[prompt].includes(fixture)) continue;
        if (
          allowedCells &&
          !allowedCells.has(`${condition}__${fixture}__${prompt}`)
        ) {
          continue;
        }
        for (const bundleId of bundleIds) {
          const bundle = bundleById.get(bundleId);
          for (let rep = 1; rep <= reps; rep += 1) {
            const dimensions = {
              stage: stage.id,
              fixture,
              condition,
              prompt,
              bundle: bundleId,
              harness: bundle.harness,
              model: bundle.model,
              effort: bundle.effort,
              rep,
              blocked: bundle.blocked === true,
              blocker: bundle.blocker ?? null,
            };
            entries.push({
              id: `${stage.id}__${setupCellKey(dimensions)}`,
              ...dimensions,
            });
          }
        }
      }
    }
  }
  return entries;
}

export function expandSetupMatrix(
  config,
  {
    stage: stageId = config.stages[0]?.id,
    fixtures,
    conditions,
    prompts,
    bundles,
    reps,
  } = {},
) {
  validateSetupMatrixConfig(config);
  const stage = config.stages.find(entry => entry.id === stageId);
  if (!stage) throw new Error(`unknown stage: ${stageId}`);

  const entries = rawEntries(config, stage, {
    fixtures,
    conditions,
    prompts,
    bundles,
    reps,
  });
  const reusedKeys = new Set(
    (stage.reuseFromStages ?? []).flatMap(reusedStageId => {
      const reusedStage = config.stages.find(
        entry => entry.id === reusedStageId,
      );
      return rawEntries(config, reusedStage).map(setupCellKey);
    }),
  );
  const freshEntries = entries.filter(
    entry => !reusedKeys.has(setupCellKey(entry)),
  );
  if (freshEntries.length === 0) {
    throw new Error('selection contains no supported fixture-prompt cells');
  }
  return freshEntries;
}

export function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * The digest that records *which guidance text* a run was actually given.
 *
 * This is the only durable link between a recorded run and the instructions it
 * received, and it is what makes stale evidence detectable. The strategy pilot
 * needed it: every host-aligned sandbox it produced was missing the rule
 * against ignoring generated theme output, because the rule was written into
 * the guidance after those runs happened. The recorded digests do not match the
 * digest recomputed from the current text, which is how that is provable rather
 * than arguable — an executor cannot be said to have ignored an instruction it
 * was never handed.
 *
 * Recompute this against current guidance before treating any recorded run as
 * evidence about current guidance. A mismatch means the run predates the text
 * and has to be rerun under a new condition id, not reinterpreted.
 */
export function setupEnvironmentHash({fixtureSha256, condition, patches}) {
  if (!SHA256.test(fixtureSha256)) {
    throw new Error('fixtureSha256 must be a SHA-256 digest');
  }
  if (typeof condition !== 'string' || condition.length === 0) {
    throw new Error('condition must be a non-empty string');
  }
  for (const entry of patches) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error('each patch must be a [id, text] pair');
    }
  }
  return sha256Text(JSON.stringify({fixtureSha256, condition, patches}));
}

export function fixtureManifestSha256(recipe) {
  const files = Object.entries(recipe.manifest?.files ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (files.length === 0) throw new Error('fixture recipe manifest is empty');
  return sha256Text(JSON.stringify(files));
}

export function createSetupProvenance({
  entry,
  taskSha256,
  fixtureSha256,
  environmentHash,
}) {
  for (const [label, value] of [
    ['taskSha256', taskSha256],
    ['fixtureSha256', fixtureSha256],
    ['environmentHash', environmentHash],
  ]) {
    if (!SHA256.test(value)) {
      throw new Error(`${label} must be a SHA-256 digest`);
    }
  }
  return {
    schemaVersion: 1,
    task: {id: entry.prompt, sha256: taskSha256},
    fixture: {id: entry.fixture, sha256: fixtureSha256},
    condition: entry.condition,
    rep: entry.rep,
    executor: {
      harness: entry.harness,
      model: entry.model,
      effort: entry.effort,
    },
    matrix: {stage: entry.stage, bundle: entry.bundle},
    execution: {
      status: entry.blocked ? 'blocked' : 'prepared',
      attempt: 1,
      retry: 0,
      ...(entry.blocker ? {blocker: entry.blocker} : {}),
    },
    environmentHash,
  };
}
