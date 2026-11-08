// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setup-eval.ts
 * @input Pristine and post-executor measurements from setup-measure.mjs
 * @output Deterministic damage, task-completion, integrity, and acceptance results
 * @position internal/vibe-tests/setup-test — the scoring half
 */

export type GeometrySnapshot = {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type ProbeReading =
  | {missing: true}
  | {
      style: Record<string, string>;
      geometry: GeometrySnapshot;
      text: string;
      descendantText?: string;
      contrast: number | null;
    };

export type TaskResultReading = {
  count: number;
  visible: boolean;
  focusable: boolean;
  text: string;
  style: Record<string, string>;
  geometry: GeometrySnapshot | null;
};

export type LayerSurfaceReading =
  | {kind: string; missing: true; styleReference?: string}
  | {
      kind: string;
      styleReference?: string;
      visible: boolean;
      display: string;
      visibility: string;
      opacity: string;
      position: string;
      zIndex: string;
      style: Record<string, string>;
      bounds: GeometrySnapshot;
      intersectsViewport: boolean;
      clippingAncestor: string | null;
      centerHitSelf: boolean;
      centerHitProbe: string | null;
      /**
       * The host token-scoping selectors this surface is inside, nearest first,
       * discovered from the app's own emitted CSS. Absent on measurements taken
       * before this was recorded, which compare as an empty list.
       */
      tokenScopes?: string[];
      topLayer: {
        tagName: string;
        role: string | null;
        open: boolean;
        popover: string | null;
        ariaModal: string | null;
        inTopLayer: boolean;
        portalChild: boolean;
      };
    };

export type InteractionReading = {
  id?: string;
  direction?: 'host-baseline' | 'astryx-in-host' | 'host-in-astryx';
  opened: boolean;
  keyboardReached?: Record<string, boolean>;
  error?: string | null;
  surfaces: Record<string, LayerSurfaceReading>;
};

export type SchemeReading = {
  probes: Record<string, ProbeReading>;
  variables: Record<string, string>;
  colorScheme: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  interaction?: InteractionReading;
  taskResults?: Record<string, TaskResultReading>;
  taskInteractions?: Record<string, InteractionReading>;
};

export type ResultContract = {
  name: string;
  exact: number;
  visible?: boolean;
  focusable?: boolean;
  text?: string;
  preserveTextFromHostProbe?: string;
};

export type InteractionContract = {
  id: string;
  direction: 'astryx-in-host' | 'host-in-astryx';
  open: Array<{
    name: string;
    source: 'probe' | 'result';
    method: 'click' | 'keyboard-focus' | 'keyboard-activate';
    key?: string;
  }>;
  surfaces: Array<{
    name: string;
    marker?: string;
    source: 'probe' | 'result';
    kind: string;
    styleReference?: string;
  }>;
};

export type AllowedHostChange = {
  fixture: string;
  probe: string;
  fields: string[];
  /**
   * Whether this probe's accumulated text may *gain* content.
   *
   * A task that mandates inserting a control into an existing host container
   * necessarily adds that control's text to the container's text, so comparing
   * the container's text exactly reports the mandated insertion as host damage.
   * This permits added text and nothing else: every baseline word must still be
   * present, in its original order. Losing a word, changing one, or reordering
   * them is still a regression, so the container's existing content stays as
   * protected as it was. It is deliberately separate from `fields` — putting
   * `text` in `fields` would exempt the comparison outright and let an executor
   * delete host copy.
   */
  textInsertionOnly?: boolean;
};

export type ReplacedHostProbe = {
  fixture: string;
  probe: string;
  result: string;
};

export type AllowedOverlayChange = {
  fixture: string;
  surface: string;
  fields: string[];
};

export type TaskContract = {
  allowedHostChanges: AllowedHostChange[];
  replacedHostProbes: ReplacedHostProbe[];
  allowedOverlayChanges: AllowedOverlayChange[];
  results: ResultContract[];
  interactions: InteractionContract[];
};

export type SetupIntegrity = {
  diffSha256: string;
  attestedDiffSha256: string | null;
  diffMatchesAttestation: boolean;
  usesAstryx: boolean;
  changedFiles: string[];
  escapeHatches: string[];
};

export type Measurement = {
  label: string;
  fixture?: string;
  build: {
    ok: boolean;
    status: number;
    ms: number;
    stdout: string;
    stderr: string;
  };
  measurementErrors?: string[];
  layerOrder?: string[];
  task?: {id: string; kind: string; contract: TaskContract};
  executionStatus?: string;
  integrity?: SetupIntegrity;
  schemes: Record<'light' | 'dark', SchemeReading>;
};

export type Scheme = 'light' | 'dark';
export type Category = 'typography' | 'color' | 'geometry' | 'spacing';

const CATEGORY_OF: Record<string, Category> = {
  color: 'color',
  backgroundColor: 'color',
  boxShadow: 'color',
  fontFamily: 'typography',
  fontSize: 'typography',
  fontWeight: 'typography',
  lineHeight: 'typography',
  letterSpacing: 'typography',
  paddingTop: 'spacing',
  paddingRight: 'spacing',
  paddingBottom: 'spacing',
  paddingLeft: 'spacing',
  marginTop: 'spacing',
  marginRight: 'spacing',
  marginBottom: 'spacing',
  marginLeft: 'spacing',
  gap: 'spacing',
  rowGap: 'spacing',
  columnGap: 'spacing',
};

export const categoryOf = (property: string): Category => {
  if (/^border.*Color$/.test(property)) {
    return 'color';
  }
  if (property.startsWith('geometry.')) {
    return 'geometry';
  }
  return CATEGORY_OF[property] ?? 'geometry';
};

export type Regression = {
  scheme?: Scheme;
  probe: string;
  property: string;
  category: Category;
  before: string;
  after: string;
};

const stringValue = (value: unknown) =>
  value === undefined ? '(missing)' : String(value);

/**
 * Whether `after` is `before` with text added and nothing removed.
 *
 * Words are compared in order: every baseline word must still appear, in the
 * same sequence, with new words allowed between them. A deletion, a
 * substitution, and a reordering all fail, so a container whose text may grow
 * still cannot lose or rewrite the host's own copy.
 */
export function isTextInsertionOnly(before: string, after: string): boolean {
  const baseline = before.trim().split(/\s+/).filter(Boolean);
  const current = after.trim().split(/\s+/).filter(Boolean);
  if (current.length < baseline.length) {
    return false;
  }
  let index = 0;
  for (const word of current) {
    if (index < baseline.length && word === baseline[index]) {
      index += 1;
    }
  }
  return index === baseline.length;
}

/** Compare the complete captured style and geometry key union exactly. */
export function regressions(
  before: SchemeReading,
  after: SchemeReading,
  allowedFields: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  replacedProbes: ReadonlySet<string> = new Set(),
  textInsertionProbes: ReadonlySet<string> = new Set(),
): {changed: Regression[]; missing: string[]} {
  const changed: Regression[] = [];
  const missing: string[] = [];
  for (const [probe, baselineReading] of Object.entries(before.probes)) {
    if (replacedProbes.has(probe)) {
      continue;
    }
    const allowed = allowedFields.get(probe) ?? new Set<string>();
    const armReading = after.probes[probe];
    if (!armReading || 'missing' in armReading) {
      if (!('missing' in baselineReading)) {
        missing.push(probe);
      }
      continue;
    }
    if ('missing' in baselineReading) {
      continue;
    }

    const beforeValues: Record<string, unknown> = {
      ...baselineReading.style,
      ...Object.fromEntries(
        Object.entries(baselineReading.geometry).map(([key, value]) => [
          `geometry.${key}`,
          value,
        ]),
      ),
      text: baselineReading.text,
    };
    const afterValues: Record<string, unknown> = {
      ...armReading.style,
      ...Object.fromEntries(
        Object.entries(armReading.geometry).map(([key, value]) => [
          `geometry.${key}`,
          value,
        ]),
      ),
      text: armReading.text,
    };
    for (const property of new Set([
      ...Object.keys(beforeValues),
      ...Object.keys(afterValues),
    ])) {
      if (beforeValues[property] === afterValues[property]) {
        continue;
      }
      if (allowed.has(property)) {
        continue;
      }
      if (
        property === 'text' &&
        textInsertionProbes.has(probe) &&
        isTextInsertionOnly(
          stringValue(beforeValues.text),
          stringValue(afterValues.text),
        )
      ) {
        continue;
      }
      changed.push({
        probe,
        property,
        category: categoryOf(property),
        before: stringValue(beforeValues[property]),
        after: stringValue(afterValues[property]),
      });
    }
  }
  return {changed, missing};
}

export function countByCategory(
  changed: Regression[],
): Record<Category, number> {
  const counts: Record<Category, number> = {
    typography: 0,
    color: 0,
    geometry: 0,
    spacing: 0,
  };
  for (const regression of changed) {
    counts[regression.category] += 1;
  }
  return counts;
}

export type ContrastFinding = {probe: string; before: number; after: number};

export function contrastFailures(
  before: SchemeReading,
  after: SchemeReading,
  floor = 4.5,
  replacedProbes: ReadonlySet<string> = new Set(),
): ContrastFinding[] {
  const findings: ContrastFinding[] = [];
  for (const [probe, baselineReading] of Object.entries(before.probes)) {
    if (replacedProbes.has(probe)) {
      continue;
    }
    const armReading = after.probes[probe];
    if (
      'missing' in baselineReading ||
      !armReading ||
      'missing' in armReading
    ) {
      continue;
    }
    const beforeContrast = baselineReading.contrast;
    const afterContrast = armReading.contrast;
    if (
      beforeContrast != null &&
      afterContrast != null &&
      beforeContrast >= floor &&
      afterContrast < floor
    ) {
      findings.push({
        probe,
        before: beforeContrast,
        after: afterContrast,
      });
    }
  }
  return findings;
}

export function modeDependence(
  baseline: Measurement,
  arm: Measurement,
  replacedProbes: ReadonlySet<string> = new Set(),
): string[] {
  const probes = Object.keys(arm.schemes.light.probes);
  return probes.filter(
    probe =>
      !replacedProbes.has(probe) &&
      stableAcrossSchemes(baseline, probe) &&
      !stableAcrossSchemes(arm, probe),
  );
}

function stableAcrossSchemes(measurement: Measurement, probe: string): boolean {
  const light = measurement.schemes.light.probes[probe];
  const dark = measurement.schemes.dark.probes[probe];
  if (!light || !dark || 'missing' in light || 'missing' in dark) {
    return true;
  }
  return (
    JSON.stringify(light.style) === JSON.stringify(dark.style) &&
    JSON.stringify(light.geometry) === JSON.stringify(dark.geometry)
  );
}

export function cascadeInverted(
  layerOrder: string[] | undefined,
  {systemPrefix = 'astryx', utilityLayer = 'utilities'} = {},
): boolean {
  if (!layerOrder?.length) {
    return false;
  }
  const utilities = layerOrder.indexOf(utilityLayer);
  if (utilities === -1) {
    return false;
  }
  return layerOrder.some(
    (layer, index) => index > utilities && layer.startsWith(systemPrefix),
  );
}

export function layerOrderFailures(layerOrder: string[] | undefined): string[] {
  const order = layerOrder ?? [];
  const failures = [];
  for (const required of ['astryx-base', 'astryx-theme', 'utilities']) {
    if (!order.includes(required)) {
      failures.push(`missing-${required}`);
    }
  }
  if (cascadeInverted(order)) {
    failures.push('cascade-inverted');
  }
  return failures;
}

export type VariableFinding = {name: string; before: string; after: string};

export function variableCapture(
  before: SchemeReading,
  after: SchemeReading,
): VariableFinding[] {
  const findings: VariableFinding[] = [];
  for (const [name, value] of Object.entries(before.variables)) {
    const armValue = after.variables[name];
    if (armValue !== undefined && armValue !== value) {
      findings.push({name, before: value, after: armValue});
    }
  }
  return findings;
}

export type LayeringFailure = {
  interaction?: string;
  direction?: string;
  surface: string;
  problems: string[];
  centerHitProbe: string | null;
};

const numericZIndex = (surface: LayerSurfaceReading | undefined) => {
  if (
    !surface ||
    'missing' in surface ||
    !/^-?\d+(?:\.\d+)?$/.test(surface.zIndex)
  ) {
    return null;
  }
  return Number(surface.zIndex);
};

function failuresForInteraction(
  interaction: InteractionReading,
): LayeringFailure[] {
  const context = {
    ...(interaction.id ? {interaction: interaction.id} : {}),
    ...(interaction.direction ? {direction: interaction.direction} : {}),
  };
  if (!interaction.opened) {
    return [
      {
        ...context,
        surface: 'interaction',
        problems: [interaction.error ? 'open-error' : 'not-opened'],
        centerHitProbe: null,
      },
    ];
  }

  const backdrop = Object.values(interaction.surfaces).find(
    surface => surface.kind === 'backdrop',
  );
  const dialog = Object.values(interaction.surfaces).find(
    surface => surface.kind === 'dialog',
  );
  const backdropZ = numericZIndex(backdrop);
  const dialogZ = numericZIndex(dialog);
  const failures: LayeringFailure[] = [];

  for (const [name, surface] of Object.entries(interaction.surfaces)) {
    if ('missing' in surface) {
      failures.push({
        ...context,
        surface: name,
        problems: ['missing'],
        centerHitProbe: null,
      });
      continue;
    }
    const isNested = surface.kind === 'tooltip' || surface.kind === 'popover';
    const problems: string[] = [];
    if (!surface.visible) {
      problems.push('hidden');
    }
    if (surface.bounds.width <= 0 || surface.bounds.height <= 0) {
      problems.push('empty-bounds');
    }
    if (!surface.intersectsViewport) {
      problems.push('outside-viewport');
    }
    if (surface.clippingAncestor) {
      problems.push('clipped');
    }
    if (isNested && !surface.centerHitSelf) {
      problems.push('center-occluded');
    }

    if (isNested && !surface.topLayer.inTopLayer) {
      const nestedZ = numericZIndex(surface);
      if (nestedZ == null) {
        problems.push('unresolved-stack-order');
      } else {
        if (backdropZ == null || nestedZ <= backdropZ) {
          problems.push('below-backdrop');
        }
        if (dialogZ == null || nestedZ <= dialogZ) {
          problems.push('below-dialog');
        }
      }
    }
    if (problems.length > 0) {
      failures.push({
        ...context,
        surface: name,
        problems,
        centerHitProbe: surface.centerHitProbe,
      });
    }
  }
  return failures;
}

export function nestedLayerFailures(reading: SchemeReading): LayeringFailure[] {
  return [
    ...(reading.interaction ? failuresForInteraction(reading.interaction) : []),
    ...Object.values(reading.taskInteractions ?? {}).flatMap(
      failuresForInteraction,
    ),
  ];
}

function overlayStyleRegressions(
  before: SchemeReading,
  after: SchemeReading,
  allowedFields: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Regression[] {
  if (!before.interaction || !after.interaction) {
    return [];
  }
  const changed: Regression[] = [];
  for (const [name, baselineSurface] of Object.entries(
    before.interaction.surfaces,
  )) {
    const allowed = allowedFields.get(name) ?? new Set<string>();
    const armSurface = after.interaction.surfaces[name];
    if (
      !armSurface ||
      'missing' in armSurface ||
      'missing' in baselineSurface
    ) {
      continue;
    }
    const styleProperties = new Set([
      ...Object.keys(baselineSurface.style),
      ...Object.keys(armSurface.style),
    ]);
    if (baselineSurface.kind === 'backdrop') {
      styleProperties.delete('color');
      styleProperties.delete('fontFamily');
      styleProperties.delete('fontSize');
      styleProperties.delete('fontWeight');
      styleProperties.delete('lineHeight');
      styleProperties.delete('letterSpacing');
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (
          baselineSurface.style[`border${side}Width`] === '0px' &&
          armSurface.style[`border${side}Width`] === '0px'
        ) {
          styleProperties.delete(`border${side}Color`);
        }
      }
    }
    for (const property of styleProperties) {
      if (
        baselineSurface.style[property] !== armSurface.style[property] &&
        !allowed.has(property)
      ) {
        changed.push({
          probe: `overlay:${name}`,
          property,
          category: categoryOf(property),
          before: stringValue(baselineSurface.style[property]),
          after: stringValue(armSurface.style[property]),
        });
      }
    }
    const baselineValues: Record<string, unknown> = {
      visible: baselineSurface.visible,
      display: baselineSurface.display,
      visibility: baselineSurface.visibility,
      opacity: baselineSurface.opacity,
      position: baselineSurface.position,
      zIndex: baselineSurface.zIndex,
      ...Object.fromEntries(
        Object.entries(baselineSurface.bounds).map(([key, value]) => [
          `geometry.${key}`,
          value,
        ]),
      ),
    };
    const armValues: Record<string, unknown> = {
      visible: armSurface.visible,
      display: armSurface.display,
      visibility: armSurface.visibility,
      opacity: armSurface.opacity,
      position: armSurface.position,
      zIndex: armSurface.zIndex,
      ...Object.fromEntries(
        Object.entries(armSurface.bounds).map(([key, value]) => [
          `geometry.${key}`,
          value,
        ]),
      ),
    };
    for (const property of Object.keys(baselineValues)) {
      if (
        baselineValues[property] !== armValues[property] &&
        !allowed.has(property)
      ) {
        changed.push({
          probe: `overlay:${name}`,
          property,
          category: categoryOf(property),
          before: stringValue(baselineValues[property]),
          after: stringValue(armValues[property]),
        });
      }
    }
  }
  return changed;
}

function taskContractFailures(
  baseline: Measurement,
  arm: Measurement,
): string[] {
  if (!arm.task) {
    return ['missing-task-contract'];
  }
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const reading = arm.schemes[scheme];
    for (const replaced of arm.task.contract.replacedHostProbes) {
      if (replaced.fixture !== arm.fixture) {
        continue;
      }
      const original = reading.probes[replaced.probe];
      if (original && !('missing' in original)) {
        failures.push(`${scheme}:${replaced.probe}:not-replaced`);
      }
    }
    for (const result of arm.task.contract.results) {
      const measured = reading.taskResults?.[result.name];
      if (!measured || measured.count !== result.exact) {
        failures.push(`${scheme}:${result.name}:count`);
        continue;
      }
      if (result.visible && !measured.visible) {
        failures.push(`${scheme}:${result.name}:hidden`);
      }
      if (result.focusable && !measured.focusable) {
        failures.push(`${scheme}:${result.name}:not-focusable`);
      }
      if (result.text !== undefined && measured.text !== result.text) {
        failures.push(`${scheme}:${result.name}:text`);
      }
      if (result.preserveTextFromHostProbe) {
        const reference =
          baseline.schemes[scheme].probes[result.preserveTextFromHostProbe];
        if (
          !reference ||
          'missing' in reference ||
          measured.text !== reference.text
        ) {
          failures.push(`${scheme}:${result.name}:host-text`);
        }
      }
    }

    for (const interaction of arm.task.contract.interactions) {
      const measured = reading.taskInteractions?.[interaction.id];
      if (!measured) {
        failures.push(`${scheme}:${interaction.id}:missing-interaction`);
        continue;
      }
      for (const step of interaction.open.filter(step =>
        step.method.startsWith('keyboard'),
      )) {
        if (measured.keyboardReached?.[step.name] !== true) {
          failures.push(`${scheme}:${interaction.id}:${step.name}:keyboard`);
        }
      }
      for (const surfaceContract of interaction.surfaces) {
        if (!surfaceContract.styleReference) {
          continue;
        }
        const surface = measured.surfaces[surfaceContract.name];
        const reference =
          baseline.schemes[scheme].interaction?.surfaces[
            surfaceContract.styleReference
          ];
        if (
          !surface ||
          !reference ||
          'missing' in surface ||
          'missing' in reference ||
          JSON.stringify(surface.style) !== JSON.stringify(reference.style)
        ) {
          failures.push(
            `${scheme}:${interaction.id}:${surfaceContract.name}:host-style`,
          );
        }
        /**
         * Relocated host UI must still sit inside the host token scopes that
         * were painting it.
         *
         * Reported separately from `host-style` because they are different
         * problems with opposite fixes, and a style diff alone cannot tell them
         * apart. Losing the boundary means the host's own rules stopped
         * reaching the element: the fix is to restore the boundary, and
         * restating the colours instead produces a surface that matches today
         * and silently desynchronizes the next time the host retunes its
         * palette. A style difference *inside* the right scopes is a real
         * restyle. Neither is excused by the other, so both are reported.
         */
        if (
          surface &&
          reference &&
          !('missing' in surface) &&
          !('missing' in reference) &&
          JSON.stringify(reference.tokenScopes ?? []) !==
            JSON.stringify(surface.tokenScopes ?? [])
        ) {
          failures.push(
            `${scheme}:${interaction.id}:${surfaceContract.name}:host-boundary`,
          );
        }
      }
    }
  }
  return [...new Set(failures)];
}

function integrityFailures(arm: Measurement): string[] {
  if (!arm.integrity) {
    return ['missing-diff-integrity'];
  }
  const failures = [...arm.integrity.escapeHatches];
  if (!arm.integrity.usesAstryx) {
    failures.push('missing-astryx-use');
  }
  if (!arm.integrity.attestedDiffSha256) {
    failures.push('missing-agent-diff-attestation');
  } else if (!arm.integrity.diffMatchesAttestation) {
    failures.push('post-run-manual-edit');
  }
  return [...new Set(failures)];
}

const uniqueObjects = <T>(values: T[]): T[] => [
  ...new Map(values.map(value => [JSON.stringify(value), value])).values(),
];

export type SetupScore = {
  label: string;
  builds: boolean;
  clean: boolean;
  validRun: boolean;
  executionSucceeded: boolean;
  consoleErrors: number;
  failedRequests: number;
  regressions: number;
  regressionDetails: Regression[];
  byCategory: Record<Category, number>;
  baselineFailures: string[];
  missingProbes: string[];
  contrastFailures: ContrastFinding[];
  modeDependent: string[];
  variablesCaptured: VariableFinding[];
  measurementErrors: string[];
  layeringFailures: LayeringFailure[];
  layerOrderFailures: string[];
  cascadeInverted: boolean;
  layerOrder: string[];
  taskSuccess: boolean;
  taskFailures: string[];
  integrityFailures: string[];
};

function baselineValidationFailures(baseline: Measurement): string[] {
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const reading = baseline.schemes[scheme];
    if (!reading || Object.keys(reading.probes).length === 0) {
      failures.push(`${scheme}:no-baseline-probes`);
      continue;
    }
    for (const [name, probe] of Object.entries(reading.probes)) {
      if ('missing' in probe) {
        failures.push(`${scheme}:${name}:baseline-missing`);
      }
    }
    if (reading.interaction) {
      if (!reading.interaction.opened) {
        failures.push(`${scheme}:baseline-interaction-not-opened`);
      }
      for (const [name, surface] of Object.entries(
        reading.interaction.surfaces,
      )) {
        if ('missing' in surface) {
          failures.push(`${scheme}:${name}:baseline-missing`);
        }
      }
      for (const [name, reached] of Object.entries(
        reading.interaction.keyboardReached ?? {},
      )) {
        if (!reached) {
          failures.push(`${scheme}:${name}:baseline-keyboard`);
        }
      }
    }
  }
  return failures;
}

function allowedHostFields(arm: Measurement) {
  const fields = new Map<string, Set<string>>();
  if (!arm.fixture || !arm.task) {
    return fields;
  }
  for (const allowed of arm.task.contract.allowedHostChanges) {
    if (allowed.fixture !== arm.fixture) {
      continue;
    }
    const allowedForProbe = fields.get(allowed.probe) ?? new Set<string>();
    for (const field of allowed.fields) {
      allowedForProbe.add(field);
    }
    fields.set(allowed.probe, allowedForProbe);
  }
  return fields;
}

/**
 * The probes whose accumulated text may gain the mandated insertion's own text,
 * and only gain it. See `AllowedHostChange.textInsertionOnly`.
 */
function textInsertionProbes(arm: Measurement) {
  if (!arm.fixture || !arm.task) {
    return new Set<string>();
  }
  return new Set(
    arm.task.contract.allowedHostChanges
      .filter(
        allowed =>
          allowed.fixture === arm.fixture && allowed.textInsertionOnly === true,
      )
      .map(allowed => allowed.probe),
  );
}

function replacedHostProbes(arm: Measurement) {
  if (!arm.fixture || !arm.task) {
    return new Set<string>();
  }
  return new Set(
    arm.task.contract.replacedHostProbes
      .filter(replaced => replaced.fixture === arm.fixture)
      .map(replaced => replaced.probe),
  );
}

function allowedOverlayFields(arm: Measurement) {
  const fields = new Map<string, Set<string>>();
  if (!arm.fixture || !arm.task) {
    return fields;
  }
  for (const allowed of arm.task.contract.allowedOverlayChanges) {
    if (allowed.fixture !== arm.fixture) {
      continue;
    }
    const allowedForSurface = fields.get(allowed.surface) ?? new Set<string>();
    for (const field of allowed.fields) {
      allowedForSurface.add(field);
    }
    fields.set(allowed.surface, allowedForSurface);
  }
  return fields;
}

export function scoreArm(baseline: Measurement, arm: Measurement): SetupScore {
  const baselineFailures = baselineValidationFailures(baseline);
  const status = arm.executionStatus;
  const executionSucceeded = status === 'succeeded';
  const validRun = executionSucceeded || status === 'agent-failure';
  if (!arm.build.ok) {
    return {
      label: arm.label,
      builds: false,
      clean: false,
      validRun,
      executionSucceeded,
      consoleErrors: 0,
      failedRequests: 0,
      regressions: 0,
      regressionDetails: [],
      byCategory: {typography: 0, color: 0, geometry: 0, spacing: 0},
      baselineFailures,
      missingProbes: [],
      contrastFailures: [],
      modeDependent: [],
      variablesCaptured: [],
      measurementErrors: arm.measurementErrors ?? [],
      layeringFailures: [],
      layerOrderFailures: ['build-failed'],
      cascadeInverted: false,
      layerOrder: arm.layerOrder ?? [],
      taskSuccess: false,
      taskFailures: ['build-failed'],
      integrityFailures: integrityFailures(arm),
    };
  }
  const allowedFields = allowedHostFields(arm);
  const replacedProbes = replacedHostProbes(arm);
  const overlayFields = allowedOverlayFields(arm);
  const insertionProbes = textInsertionProbes(arm);
  const regressionDetails = uniqueObjects(
    (['light', 'dark'] as const).flatMap(scheme =>
      [
        ...regressions(
          baseline.schemes[scheme],
          arm.schemes[scheme],
          allowedFields,
          replacedProbes,
          insertionProbes,
        ).changed,
        ...overlayStyleRegressions(
          baseline.schemes[scheme],
          arm.schemes[scheme],
          overlayFields,
        ),
      ].map(regression => ({...regression, scheme})),
    ),
  );
  const missingProbes = [
    ...new Set(
      (['light', 'dark'] as const).flatMap(
        scheme =>
          regressions(
            baseline.schemes[scheme],
            arm.schemes[scheme],
            allowedFields,
            replacedProbes,
            insertionProbes,
          ).missing,
      ),
    ),
  ];
  const contrast = uniqueObjects(
    (['light', 'dark'] as const).flatMap(scheme =>
      contrastFailures(
        baseline.schemes[scheme],
        arm.schemes[scheme],
        4.5,
        replacedProbes,
      ),
    ),
  );
  const variables = uniqueObjects(
    (['light', 'dark'] as const).flatMap(scheme =>
      variableCapture(baseline.schemes[scheme], arm.schemes[scheme]),
    ),
  );
  const layering = uniqueObjects(
    (['light', 'dark'] as const).flatMap(scheme =>
      nestedLayerFailures(arm.schemes[scheme]),
    ),
  );
  const runtimeErrors = (['light', 'dark'] as const).reduce(
    (sum, scheme) =>
      sum +
      arm.schemes[scheme].consoleErrors.length +
      arm.schemes[scheme].pageErrors.length,
    0,
  );
  const failedRequests = (['light', 'dark'] as const).reduce(
    (sum, scheme) => sum + arm.schemes[scheme].failedRequests.length,
    0,
  );
  const taskFailures = taskContractFailures(baseline, arm);
  const diffFailures = integrityFailures(arm);

  return {
    label: arm.label,
    builds: arm.build.ok,
    clean: runtimeErrors === 0 && failedRequests === 0,
    validRun,
    executionSucceeded,
    consoleErrors: runtimeErrors,
    failedRequests,
    regressions: regressionDetails.length,
    regressionDetails,
    byCategory: countByCategory(regressionDetails),
    baselineFailures,
    missingProbes,
    contrastFailures: contrast,
    modeDependent: modeDependence(baseline, arm, replacedProbes),
    variablesCaptured: variables,
    measurementErrors: arm.measurementErrors ?? [],
    layeringFailures: layering,
    layerOrderFailures: layerOrderFailures(arm.layerOrder),
    cascadeInverted: cascadeInverted(arm.layerOrder),
    layerOrder: arm.layerOrder ?? [],
    taskSuccess: taskFailures.length === 0,
    taskFailures,
    integrityFailures: diffFailures,
  };
}

export type Verdict =
  'broken-build' | 'noisy' | 'silent-damage' | 'cosmetic-drift' | 'clean';

export function verdict(score: SetupScore): Verdict {
  if (!score.builds) {
    return 'broken-build';
  }
  if (
    score.measurementErrors.length > 0 ||
    score.baselineFailures.length > 0 ||
    score.contrastFailures.length > 0 ||
    score.layeringFailures.length > 0 ||
    score.layerOrderFailures.length > 0 ||
    score.missingProbes.length > 0 ||
    score.cascadeInverted ||
    !score.taskSuccess ||
    score.integrityFailures.length > 0
  ) {
    return score.clean ? 'silent-damage' : 'noisy';
  }
  if (!score.clean) {
    return 'noisy';
  }
  return score.regressions > 0 || score.modeDependent.length > 0
    ? 'cosmetic-drift'
    : 'clean';
}

export function passesAcceptance(score: SetupScore): boolean {
  return (
    score.validRun &&
    score.executionSucceeded &&
    score.taskSuccess &&
    score.integrityFailures.length === 0 &&
    verdict(score) === 'clean'
  );
}

/**
 * The kinds of failure a run can have. They are different things and a report
 * that adds them together says nothing useful.
 *
 * - `hostDamage` — the measurement found the host changed: computed styles,
 *   geometry, missing probes, contrast, layering, cascade order, mode
 *   dependence. This is the thing the whole stage exists to detect.
 * - `runtime` — the built app logged errors or failed requests.
 * - `integrity` — an escape hatch or a broken attestation in the source diff.
 *   The host may be pixel-perfect and this still fails.
 * - `task` — the run did not do what it was asked to do.
 * - `telemetry` — the run's own reporting is unusable: the executor was
 *   classified as failing, the measurement errored, or the baseline capture was
 *   incomplete. Nothing here says anything about the host; it says the cell has
 *   to be run again.
 *
 * `verdict` deliberately collapses several of these into `silent-damage`,
 * because a run with any of them is not acceptable. That is right for a gate
 * and wrong for a report: `silent-damage` from a comment misread as an
 * `!important` and `silent-damage` from a repainted host are the same word for
 * two unrelated problems. Report the breakdown next to the verdict.
 */
export type FailureKind =
  'hostDamage' | 'runtime' | 'integrity' | 'task' | 'telemetry';

export type FailureBreakdown = Record<FailureKind, number>;

export function failureBreakdown(score: SetupScore): FailureBreakdown {
  return {
    hostDamage:
      score.regressions +
      score.missingProbes.length +
      score.contrastFailures.length +
      score.layeringFailures.length +
      score.layerOrderFailures.length +
      score.modeDependent.length +
      (score.cascadeInverted ? 1 : 0),
    runtime: score.consoleErrors + score.failedRequests,
    integrity: score.integrityFailures.length,
    task: score.taskFailures.length,
    telemetry:
      (score.executionSucceeded ? 0 : 1) +
      score.measurementErrors.length +
      score.baselineFailures.length,
  };
}

/** The failure kinds actually present, in report order. */
export function failureCauses(score: SetupScore): FailureKind[] {
  const breakdown = failureBreakdown(score);
  return (Object.keys(breakdown) as FailureKind[]).filter(
    kind => breakdown[kind] > 0,
  );
}

/**
 * Whether this run's measurement may be compared with another run's.
 *
 * A run the executor did not complete is still measured and still scored — the
 * sandbox exists and the evaluator reads it — but its verdict describes an
 * unfinished attempt. An operator run produced exactly that: a cell scored
 * `clean` on a run whose executor stopped early, because nothing damaged the
 * host once the work stopped. Counting that as a clean run makes the condition
 * look better than the evidence supports, so comparison excludes it and says
 * so.
 */
export function isComparableRun(score: SetupScore): boolean {
  return score.validRun && score.executionSucceeded;
}

export type HardDimension =
  | 'build'
  | 'runtime'
  | 'taskCompletion'
  | 'color'
  | 'font'
  | 'radius'
  | 'border'
  | 'shadow'
  | 'geometry'
  | 'contrast'
  | 'layering';

export type HardGateVector = Record<HardDimension, number>;

const regressionDimension = (property: string): HardDimension => {
  if (property === 'boxShadow') {
    return 'shadow';
  }
  if (/Radius$/.test(property)) {
    return 'radius';
  }
  if (/^border/.test(property)) {
    return 'border';
  }
  if (
    property.startsWith('font') ||
    property === 'lineHeight' ||
    property === 'letterSpacing'
  ) {
    return 'font';
  }
  if (property === 'color' || property === 'backgroundColor') {
    return 'color';
  }
  return 'geometry';
};

export function hardGateVector(score: SetupScore): HardGateVector {
  const vector: HardGateVector = {
    build: score.builds ? 0 : 1,
    runtime: score.consoleErrors + score.failedRequests,
    taskCompletion:
      score.taskFailures.length +
      score.integrityFailures.length +
      score.measurementErrors.length +
      (score.executionSucceeded ? 0 : 1),
    color: 0,
    font: 0,
    radius: 0,
    border: 0,
    shadow: 0,
    geometry:
      score.baselineFailures.length +
      score.missingProbes.length +
      score.modeDependent.length,
    contrast: score.contrastFailures.length,
    layering: score.layeringFailures.length + score.layerOrderFailures.length,
  };
  for (const regression of score.regressionDetails) {
    vector[regressionDimension(regression.property)] += 1;
  }
  return vector;
}

export function compareCandidate(current: SetupScore, candidate: SetupScore) {
  const before = hardGateVector(current);
  const after = hardGateVector(candidate);
  const deltas = Object.fromEntries(
    (Object.keys(before) as HardDimension[]).map(dimension => [
      dimension,
      after[dimension] - before[dimension],
    ]),
  ) as HardGateVector;
  const regressions = (Object.keys(deltas) as HardDimension[]).filter(
    dimension => deltas[dimension] > 0,
  );
  const improvements = (Object.keys(deltas) as HardDimension[]).filter(
    dimension => deltas[dimension] < 0,
  );
  return {
    before,
    after,
    deltas,
    regressions,
    improvements,
  };
}

export function strictAcceptanceSummary(
  scores: SetupScore[],
  expectedRuns: number,
  coverageComplete: boolean,
) {
  const valid = scores.filter(score => score.validRun);
  const strict = valid.filter(passesAcceptance).length;
  const damageFree = valid.filter(
    score =>
      score.builds &&
      score.clean &&
      score.baselineFailures.length === 0 &&
      score.regressions === 0 &&
      score.missingProbes.length === 0 &&
      score.contrastFailures.length === 0 &&
      score.layeringFailures.length === 0 &&
      score.layerOrderFailures.length === 0 &&
      score.measurementErrors.length === 0 &&
      score.modeDependent.length === 0 &&
      !score.cascadeInverted,
  ).length;
  const complete =
    coverageComplete &&
    scores.length === expectedRuns &&
    valid.length === expectedRuns;
  return {
    coverage: {
      present: scores.length,
      valid: valid.length,
      expected: expectedRuns,
    },
    strictClean: {
      numerator: strict,
      denominator: valid.length,
      rate: valid.length === 0 ? 0 : strict / valid.length,
    },
    damageFree: {
      numerator: damageFree,
      denominator: valid.length,
      rate: valid.length === 0 ? 0 : damageFree / valid.length,
    },
    passes: complete && strict === expectedRuns,
  };
}
