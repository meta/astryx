// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared RTL coverage and directional-decoration helpers.
 * @input Rendered DOM decorations, canonical package rosters, Storybook routes
 *   and source/export metadata, typed story-level applicability, curated targets,
 *   and D1/D5/D6/curated audit results.
 * @output Audited package/story routing, stable D1 targets, applicability and
 *   exclusion disclosure, contextual decoration candidates, component-filter
 *   reconciliation, and per-component measured / verified-N-A / coverage-gap
 *   classifications.
 * @position Pure support layer for rtl-audit.mjs and its unit tests.
 */

import componentPackages from '../../../scripts/component-packages.cjs';

const {COMPONENT_PACKAGES, COMPONENT_PACKAGE_NAMES} = componentPackages;

export const AUDITED_PACKAGE_NAMES = COMPONENT_PACKAGE_NAMES;
export const AUDITED_STORY_PREFIXES = Object.freeze([
  ...new Set(COMPONENT_PACKAGES.flatMap(pkg => pkg.storyPrefixes)),
]);

function packageForStoryId(storyId, packageNames = AUDITED_PACKAGE_NAMES) {
  return (
    COMPONENT_PACKAGES.find(
      pkg =>
        packageNames.includes(pkg.name) &&
        pkg.storyPrefixes.some(prefix => storyId.startsWith(prefix)),
    )?.name ?? null
  );
}

function pascalCase(value) {
  return (value.match(/[A-Za-z0-9]+/g) ?? [])
    .map(word => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join('');
}

function singularize(value) {
  if (value === 'Axes') return 'Axis';
  return value.endsWith('s') ? value.slice(0, -1) : value;
}

function componentsFromStoryTitle(
  title,
  preferredPackage,
  publicComponentsByPackage,
) {
  const titleSegments = title?.split('/') ?? [];
  const namespace = titleSegments[0] ?? '';
  const finalSegment = titleSegments.at(-1) ?? '';
  const candidates = new Set();
  for (const part of finalSegment.split(/\s*(?:&|\band\b)\s*/i)) {
    const name = pascalCase(part);
    if (!name) continue;
    const singular = singularize(name);
    candidates.add(name);
    candidates.add(singular);
    candidates.add(`Chart${name}`);
    candidates.add(`Chart${singular}`);
  }
  const matchesIn = packageName =>
    (publicComponentsByPackage[packageName] ?? [])
      .filter(component => candidates.has(component))
      .map(component => `${packageName}/${component}`);
  const namespacePackages = COMPONENT_PACKAGES.filter(pkg =>
    pkg.storyNamespaces.includes(namespace),
  )
    .map(pkg => pkg.name)
    .filter(packageName => packageName in publicComponentsByPackage);
  const eligiblePackages =
    namespacePackages.length > 0
      ? namespacePackages
      : Object.keys(publicComponentsByPackage);
  const preferred =
    preferredPackage && eligiblePackages.includes(preferredPackage)
      ? matchesIn(preferredPackage)
      : [];
  if (preferred.length > 0) return preferred;
  return eligiblePackages
    .filter(packageName => packageName !== preferredPackage)
    .flatMap(matchesIn);
}

/** Resolve the best default package/component route encoded in a story id. */
export function componentFromStoryId(
  storyId,
  packageNames = AUDITED_PACKAGE_NAMES,
  publicComponentsByPackage = {},
) {
  const packageName = packageForStoryId(storyId, packageNames);
  if (!packageName) {
    return `unknown/${storyId.split('--')[0]}`;
  }
  const segment = storyId.slice(packageName.length + 1).split('--')[0];
  const normalized = segment.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const publicComponents = publicComponentsByPackage[packageName] ?? [];
  const exact = publicComponents.find(
    component => component.toLowerCase() === normalized,
  );
  const fallback =
    exact ?? (publicComponents.includes('Chart') ? 'Chart' : segment);
  return `${packageName}/${fallback}`;
}

/** Resolve a curated target's declared component in the story's package. */
export function componentFromTarget(
  target,
  packageNames = AUDITED_PACKAGE_NAMES,
  publicComponentsByPackage = {},
) {
  const declared = target?.component?.trim();
  if (!declared) {
    return componentFromStoryId(
      target.storyId,
      packageNames,
      publicComponentsByPackage,
    );
  }
  if (declared.includes('/')) {
    return declared;
  }
  const packageName = packageForStoryId(target.storyId, packageNames);
  return packageName ? `${packageName}/${declared}` : `unknown/${declared}`;
}

/**
 * Route each story to its public component owner(s). Story titles project onto
 * the canonical public-component roster; curated targets provide exact aliases
 * for surfaces whose titles do not name their owner.
 */
export function buildStoryComponentRoutes({
  stories,
  storyIds,
  targets = [],
  packageNames = AUDITED_PACKAGE_NAMES,
  publicComponentsByPackage = {},
}) {
  const normalizedStories = stories ?? storyIds.map(id => ({id, title: ''}));
  const aliases = new Map();
  for (const target of targets) {
    const component = componentFromTarget(
      target,
      packageNames,
      publicComponentsByPackage,
    );
    const current = aliases.get(target.storyId) ?? [];
    current.push(component);
    aliases.set(target.storyId, current);
  }

  return normalizedStories.flatMap(story => {
    const packageName = packageForStoryId(story.id, packageNames);
    const explicitComponents = aliases.get(story.id) ?? [];
    const titleComponents =
      explicitComponents.length === 0
        ? componentsFromStoryTitle(
            story.title,
            packageName,
            publicComponentsByPackage,
          )
        : [];
    const components = [...explicitComponents, ...titleComponents];
    if (components.length === 0) {
      components.push(
        componentFromStoryId(story.id, packageNames, publicComponentsByPackage),
      );
    }
    return Array.from(
      new Map(
        components.map(component => [component.toLowerCase(), component]),
      ).values(),
    ).map(component => ({id: story.id, component}));
  });
}

export function filterStoryRoutesByPackages(
  routes,
  packageNames,
  packages = COMPONENT_PACKAGES,
) {
  return routes.filter(({component, id}) => {
    const ownerPackage = component.split('/')[0];
    if (packageNames.includes(ownerPackage)) return true;
    if (ownerPackage !== 'unknown') return false;
    const fallbackPackage = packages.find(pkg =>
      pkg.storyPrefixes.some(prefix => id.startsWith(prefix)),
    )?.name;
    return fallbackPackage != null && packageNames.includes(fallbackPackage);
  });
}

/** Whether a package-qualified route owns a bare or qualified filter. */
function routeMatchesComponentFilter(route, filter) {
  const component = route.component.toLowerCase();
  const bareComponent = component.split('/').at(-1);
  const requested = filter.toLowerCase();
  return component === requested || bareComponent === requested;
}

/** Package-qualified owner routes selected by bare or qualified filters. */
export function componentRoutesForFilters(routes, filters) {
  if (filters.length === 0) return routes;
  return routes.filter(route =>
    filters.some(filter => routeMatchesComponentFilter(route, filter)),
  );
}

/** Story ids owned by any bare or package-qualified component filter. */
export function storyIdsForComponentFilters(routes, filters) {
  return [
    ...new Set(
      componentRoutesForFilters(routes, filters).map(route => route.id),
    ),
  ];
}

/**
 * Keep D1 representative selection stable when Storybook changes index order.
 * Story source-file and export order preserve the repository's existing choice;
 * the story id is the deterministic fallback.
 */
export function orderD1StoryCandidates(candidates) {
  return [...candidates].sort(
    (left, right) =>
      (left.importPath ?? '').localeCompare(right.importPath ?? '') ||
      (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.sourceOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id),
  );
}

/** Build one stable D1 scan target from a component's ordered candidates. */
export function buildD1Target(comp, candidates) {
  const orderedCandidates = orderD1StoryCandidates(candidates);
  if (orderedCandidates.length === 0) {
    throw new Error(`${comp} has no D1 story candidates`);
  }
  return {
    comp,
    id: orderedCandidates[0].id,
    candidates: orderedCandidates,
  };
}

/**
 * Select the first applicable D1 story while disclosing every explicit
 * exclusion, including exclusions ordered after the selected representative.
 */
export function resolveD1Applicability(
  component,
  candidates,
  parametersByStoryId,
) {
  let selectedCandidate = null;
  const declaredExclusions = [];
  for (const candidate of orderD1StoryCandidates(candidates)) {
    if (!parametersByStoryId.has(candidate.id)) {
      throw new Error(
        `${candidate.id} resolved rtlAudit metadata was not collected`,
      );
    }
    const parameters = parametersByStoryId.get(candidate.id);
    if (parameters.D1?.applicable === false) {
      declaredExclusions.push({
        component,
        storyId: candidate.id,
        dimension: 'D1',
        reason: parameters.D1.reason,
      });
    } else if (selectedCandidate == null) {
      selectedCandidate = candidate;
    }
  }
  return {selectedCandidate, declaredExclusions};
}

/**
 * Preserve the planned D1 identity even when metadata selects another story or
 * excludes every candidate. Keep the rendered story separately for evidence.
 */
export function withD1CompletionIdentity(result, plannedStoryId) {
  const selectedStoryId = result.storyId;
  return {
    ...result,
    storyId: plannedStoryId,
    ...(selectedStoryId && selectedStoryId !== plannedStoryId
      ? {selectedStoryId}
      : {}),
  };
}

const STORY_RTL_AUDIT_DIMENSIONS = new Set(['D1']);

/** Validate resolved Storybook RTL-audit applicability metadata. */
export function validateStoryRtlAuditParameters(value, storyId) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${storyId} rtlAudit metadata must be an object`);
  }

  const result = {};
  for (const [dimension, applicability] of Object.entries(value)) {
    if (!STORY_RTL_AUDIT_DIMENSIONS.has(dimension)) {
      throw new Error(`${storyId} rtlAudit has unknown dimension ${dimension}`);
    }
    if (
      applicability == null ||
      typeof applicability !== 'object' ||
      Array.isArray(applicability) ||
      typeof applicability.applicable !== 'boolean'
    ) {
      throw new Error(
        `${storyId} rtlAudit.${dimension} must declare applicable as a boolean`,
      );
    }
    const reason = applicability.reason;
    if (reason != null && typeof reason !== 'string') {
      throw new Error(
        `${storyId} rtlAudit.${dimension}.reason must be a string`,
      );
    }
    const trimmedReason = reason?.trim();
    if (applicability.applicable === false && !trimmedReason) {
      throw new Error(
        `${storyId} rtlAudit.${dimension} applicable=false needs a non-empty reason`,
      );
    }
    result[dimension] = {
      applicable: applicability.applicable,
      ...(trimmedReason ? {reason: trimmedReason} : {}),
    };
  }
  return result;
}

/** Selected owners for which the canonical Storybook route has no story. */
export function unresolvedComponentFilters(routes, filters) {
  return filters.filter(
    filter => !routes.some(route => routeMatchesComponentFilter(route, filter)),
  );
}

const EXPLICIT_GLYPH_PAIRS = new Map([
  ['/', '\\'],
  ['\\', '/'],
  ['→', '←'],
  ['←', '→'],
  ['>', '<'],
  ['<', '>'],
]);

/**
 * Find single-glyph, aria-hidden decorations only when the DOM supplies a
 * directional context. A slash in prose is ignored; a slash attached to one of
 * several repeated list items is a separator and is measured.
 *
 * This function is passed directly to Playwright's page.evaluate(), so every
 * browser-side helper intentionally lives inside its body.
 */
export function collectDirectionalDecorations({
  root = globalThis.document,
  requireVisible = true,
} = {}) {
  if (!root?.querySelectorAll) {
    return [];
  }

  const candidateGlyphs = new Set([
    '/',
    '\\',
    '→',
    '←',
    '>',
    '<',
    '›',
    '‹',
    '»',
    '«',
  ]);
  const autoBidiGlyphs = new Set(['›', '‹', '»', '«']);
  const view =
    root.defaultView ?? root.ownerDocument?.defaultView ?? globalThis;

  function multiply(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
    ];
  }

  function composedMatrixFor(start) {
    let matrix = [1, 0, 0, 1];
    let element = start;
    let steps = 0;
    while (element && steps < 6) {
      const transform = view.getComputedStyle?.(element)?.transform;
      const match = transform?.match(/matrix\(([^)]+)\)/);
      if (match) {
        const values = match[1]
          .split(',')
          .map(value => Number.parseFloat(value.trim()));
        matrix = multiply([values[0], values[1], values[2], values[3]], matrix);
      }
      element = element.parentElement;
      steps += 1;
    }
    return matrix;
  }

  function repeatedItemContext(element) {
    const item = element.closest('li,[role="listitem"]');
    const parent = item?.parentElement;
    if (!item || !parent) {
      return null;
    }
    const items = Array.from(parent.children).filter(child =>
      child.matches('li,[role="listitem"]'),
    );
    if (items.length < 2) {
      return null;
    }
    return {
      kind: 'repeated-item',
      itemIndex: items.indexOf(item),
      itemCount: items.length,
    };
  }

  function betweenSiblingsContext(element) {
    const parent = element.parentElement;
    if (!parent) {
      return null;
    }
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element);
    if (index <= 0 || index >= siblings.length - 1) {
      return null;
    }
    return {
      kind: 'between-siblings',
      itemIndex: index,
      itemCount: siblings.length,
    };
  }

  const candidates = [];
  for (const element of root.querySelectorAll('[aria-hidden="true"]')) {
    const glyph = element.textContent?.trim() ?? '';
    if (!candidateGlyphs.has(glyph)) {
      continue;
    }
    const context =
      repeatedItemContext(element) ?? betweenSiblingsContext(element);
    if (!context) {
      continue;
    }
    let glyphElement = element;
    while (
      glyphElement.children.length === 1 &&
      glyphElement.children[0].textContent?.trim() === glyph
    ) {
      glyphElement = glyphElement.children[0];
    }
    if (requireVisible) {
      const box = glyphElement.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) {
        continue;
      }
    }
    candidates.push({
      index: candidates.length,
      glyph,
      policy: autoBidiGlyphs.has(glyph) ? 'auto-bidi' : 'explicit',
      context,
      matrix: composedMatrixFor(glyphElement),
    });
  }
  return candidates;
}

function matricesEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === 4 &&
    right.length === 4 &&
    left.every((value, index) => Math.abs(value - right[index]) < 0.01)
  );
}

function isMirrorOf(rtl, ltr) {
  if (!Array.isArray(rtl) || !Array.isArray(ltr)) {
    return false;
  }
  const expected = [-ltr[0], ltr[1], -ltr[2], ltr[3]];
  return expected.every((value, index) => Math.abs(value - rtl[index]) < 0.01);
}

/** Classify one stable LTR/RTL contextual-decoration pair. */
export function classifyDirectionalDecorationPair(ltr, rtl) {
  if (!ltr || !rtl) {
    return {verdict: 'fail', reason: 'decoration is missing in one direction'};
  }

  const mirrored = isMirrorOf(rtl.matrix, ltr.matrix);
  const sameMatrix = matricesEqual(ltr.matrix, rtl.matrix);
  const swapped = EXPLICIT_GLYPH_PAIRS.get(ltr.glyph) === rtl.glyph;

  if (ltr.policy === 'auto-bidi') {
    if (ltr.glyph !== rtl.glyph) {
      return {
        verdict: 'fail',
        reason:
          'Unicode-mirrored glyph was swapped in the DOM (double handling)',
      };
    }
    if (mirrored) {
      return {
        verdict: 'fail',
        reason:
          'Unicode-mirrored glyph also has an RTL transform (double handling)',
      };
    }
    if (!sameMatrix) {
      return {
        verdict: 'fail',
        reason:
          'Unicode-mirrored glyph has an unexpected direction-only transform',
      };
    }
    return {
      verdict: 'pass',
      reason: 'Unicode bidi mirroring handles the unchanged glyph',
    };
  }

  if (mirrored && swapped) {
    return {
      verdict: 'fail',
      reason: 'glyph is both swapped and transformed (double handling)',
    };
  }
  if (mirrored) {
    return {
      verdict: 'pass',
      reason: 'decoration mirrors through its transform',
    };
  }
  if (swapped && sameMatrix) {
    return {verdict: 'pass', reason: 'decoration swaps to its opposite glyph'};
  }
  return {
    verdict: 'fail',
    reason: 'contextual directional decoration neither mirrors nor swaps',
  };
}

/** Roll up all contextual decorations found in one story. */
export function evaluateDirectionalDecorations(ltr, rtl) {
  if (ltr.length === 0 && rtl.length === 0) {
    return {
      verdict: 'N-A',
      results: [],
      notes: ['no contextual directional decorations'],
    };
  }

  const count = Math.max(ltr.length, rtl.length);
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const result = classifyDirectionalDecorationPair(ltr[index], rtl[index]);
    results.push({
      index,
      glyph: ltr[index]?.glyph ?? rtl[index]?.glyph,
      ...result,
    });
  }
  const failures = results.filter(result => result.verdict === 'fail');
  return {
    verdict: failures.length > 0 ? 'fail' : 'pass',
    results,
    notes:
      failures.length > 0
        ? failures.map(failure => `${failure.glyph ?? '?'}: ${failure.reason}`)
        : ['every contextual directional decoration mirrors exactly once'],
  };
}

/**
 * Classify one asymmetric inline-edge pair across LTR and RTL.
 *
 * Logical start/end values must stay stable while the physical edges for the
 * computed inline axis swap: left/right in horizontal writing and top/bottom
 * in vertical or sideways writing. A symmetric fixture cannot prove this
 * relationship, so it fails closed instead of producing a vacuous pass.
 */
export function classifyLogicalInlinePair(ltr, rtl, tolerancePx = 0.5) {
  const close = (left, right) => Math.abs(left - right) <= tolerancePx;
  const boxes = [ltr, rtl];
  if (
    !boxes.every(
      measurement =>
        measurement?.count === 1 &&
        measurement.visible === true &&
        Number.isFinite(measurement.width) &&
        Number.isFinite(measurement.height) &&
        measurement.width > 0 &&
        measurement.height > 0,
    )
  ) {
    return {
      verdict: 'fail',
      reason: 'logical inline-edge subject is not one visible non-zero box',
    };
  }

  const values = boxes.flatMap(measurement => [
    measurement.inlineStart,
    measurement.inlineEnd,
    measurement.top,
    measurement.right,
    measurement.bottom,
    measurement.left,
  ]);
  if (!values.every(Number.isFinite)) {
    return {
      verdict: 'fail',
      reason: 'logical inline-edge measurements are incomplete',
    };
  }
  if (ltr.direction !== 'ltr' || rtl.direction !== 'rtl') {
    return {
      verdict: 'fail',
      reason:
        'logical inline-edge measurements did not use LTR and RTL directions',
    };
  }
  if (
    typeof ltr.writingMode !== 'string' ||
    ltr.writingMode !== rtl.writingMode
  ) {
    return {
      verdict: 'fail',
      reason:
        'logical inline-edge writing mode is missing or changed between directions',
    };
  }

  const writingMode = ltr.writingMode.toLowerCase();
  const inlineEdges = writingMode.startsWith('horizontal')
    ? ['left', 'right']
    : writingMode.startsWith('vertical') || writingMode.startsWith('sideways')
      ? ['top', 'bottom']
      : null;
  if (inlineEdges == null) {
    return {
      verdict: 'fail',
      reason: `unsupported writing mode: ${ltr.writingMode}`,
    };
  }
  if (close(ltr.inlineStart, ltr.inlineEnd)) {
    return {
      verdict: 'fail',
      reason: 'fixture is symmetric and cannot prove inline-edge mirroring',
    };
  }

  const [physicalStart, physicalEnd] = inlineEdges;
  const orthogonalEdges =
    physicalStart === 'left' ? ['top', 'bottom'] : ['left', 'right'];
  const logicalStable =
    close(ltr.inlineStart, rtl.inlineStart) &&
    close(ltr.inlineEnd, rtl.inlineEnd);
  const physicalMirrored =
    close(ltr[physicalStart], rtl[physicalEnd]) &&
    close(ltr[physicalEnd], rtl[physicalStart]);
  const orthogonalStable = orthogonalEdges.every(edge =>
    close(ltr[edge], rtl[edge]),
  );

  return logicalStable && physicalMirrored && orthogonalStable
    ? {
        verdict: 'pass',
        reason:
          `logical start/end stay stable and resolved ${physicalStart}/${physicalEnd} ` +
          `sides swap for ${writingMode}`,
      }
    : {
        verdict: 'fail',
        reason:
          `logical start/end did not mirror on the ${physicalStart}/${physicalEnd} ` +
          `inline axis for ${writingMode}`,
      };
}

/**
 * Classify a first/middle/last group whose tightened corners belong to one
 * logical inline side. The contracted corner sequence must be end/both/start,
 * its opposite corners must stay full, and the physical side must mirror.
 */
export function classifyLogicalGroupedCorners(
  ltr,
  rtl,
  logicalSide,
  tolerancePx = 0.5,
) {
  const close = (left, right) => Math.abs(left - right) <= tolerancePx;
  if (!['inline-start', 'inline-end'].includes(logicalSide)) {
    return {verdict: 'fail', reason: 'grouped corners need a logical side'};
  }

  const measurements = [ltr, rtl];
  if (
    !measurements.every(
      measurement =>
        measurement?.boxes?.length === 3 &&
        measurement.writingMode === 'horizontal-tb' &&
        measurement.boxes.every(
          box =>
            box?.visible === true &&
            Number.isFinite(box.width) &&
            Number.isFinite(box.height) &&
            box.width > 0 &&
            box.height > 0 &&
            ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].every(corner =>
              Number.isFinite(box.corners?.[corner]),
            ),
        ),
    ) ||
    ltr.direction !== 'ltr' ||
    rtl.direction !== 'rtl'
  ) {
    return {
      verdict: 'fail',
      reason:
        'grouped-corner subjects must be three visible horizontal LTR/RTL boxes',
    };
  }

  const evaluateDirection = measurement => {
    const physicalSide =
      (logicalSide === 'inline-start') === (measurement.direction === 'ltr')
        ? 'left'
        : 'right';
    const oppositeSide = physicalSide === 'left' ? 'right' : 'left';
    const sideTop = physicalSide === 'left' ? 'topLeft' : 'topRight';
    const sideBottom = physicalSide === 'left' ? 'bottomLeft' : 'bottomRight';
    const oppositeTop = oppositeSide === 'left' ? 'topLeft' : 'topRight';
    const oppositeBottom =
      oppositeSide === 'left' ? 'bottomLeft' : 'bottomRight';
    const [first, middle, last] = measurement.boxes;
    const inset = [
      first.corners[sideBottom],
      middle.corners[sideTop],
      middle.corners[sideBottom],
      last.corners[sideTop],
    ];
    const full = [
      first.corners[sideTop],
      last.corners[sideBottom],
      ...measurement.boxes.flatMap(box => [
        box.corners[oppositeTop],
        box.corners[oppositeBottom],
      ]),
    ];
    const insetConsistent = inset.every(value => close(value, inset[0]));
    const fullConsistent = full.every(value => close(value, full[0]));
    const distinct = full[0] > inset[0] + tolerancePx;
    return {
      pass: insetConsistent && fullConsistent && distinct,
      physicalSide,
      insetRadius: inset[0],
      fullRadius: full[0],
    };
  };

  const ltrResult = evaluateDirection(ltr);
  const rtlResult = evaluateDirection(rtl);
  const mirrored = ltr.boxes.every((box, index) => {
    const other = rtl.boxes[index];
    return (
      close(box.corners.topLeft, other.corners.topRight) &&
      close(box.corners.topRight, other.corners.topLeft) &&
      close(box.corners.bottomRight, other.corners.bottomLeft) &&
      close(box.corners.bottomLeft, other.corners.bottomRight)
    );
  });

  if (!ltrResult.pass || !rtlResult.pass) {
    return {
      verdict: 'fail',
      reason:
        'first/middle/last corners do not preserve the contracted/full sequence',
      ltr: ltrResult,
      rtl: rtlResult,
    };
  }
  if (!mirrored || ltrResult.physicalSide === rtlResult.physicalSide) {
    return {
      verdict: 'fail',
      reason: 'grouped corners stay on a physical side instead of mirroring',
      ltr: ltrResult,
      rtl: rtlResult,
    };
  }
  return {
    verdict: 'pass',
    reason:
      `${logicalSide} grouped corners mirror ${ltrResult.physicalSide}→` +
      `${rtlResult.physicalSide} with ${ltrResult.insetRadius}px inset and ` +
      `${ltrResult.fullRadius}px full radii`,
    ltr: ltrResult,
    rtl: rtlResult,
  };
}

function resultIsApplicable(result) {
  return result?.verdict === 'pass' || result?.verdict === 'fail';
}

function componentName(component) {
  return component.split('/').at(-1)?.toLowerCase() ?? component.toLowerCase();
}

/**
 * Build the component roster for a scoped audit.
 *
 * Storybook can expose an umbrella story whose name matches the PR analyzer's
 * module name even when no source component has that exact name. Chat is the
 * canonical example: the source directory contains ChatComposer, ChatMessage,
 * and related components, while Storybook also has a `Core/Chat` surface. A
 * matching story must satisfy the filter so the roster does not invent a
 * second `unknown/chat` coverage entry for the same surface.
 */
export function buildAuditedComponentRoster({
  sourceComponents = [],
  storyComponents = [],
  filters = [],
}) {
  const normalizedFilters = filters.map(filter => filter.toLowerCase());
  const knownComponents = [...sourceComponents, ...storyComponents];
  const matchesFilter = (component, filter) =>
    component.toLowerCase() === filter || componentName(component) === filter;
  const unmatchedFilters = normalizedFilters
    .filter(
      filter =>
        !knownComponents.some(component => matchesFilter(component, filter)),
    )
    .map(filter => `unknown/${filter}`);

  return Array.from(
    new Map(
      [...knownComponents, ...unmatchedFilters].map(component => [
        component.toLowerCase(),
        component,
      ]),
    ).values(),
  ).filter(
    component =>
      normalizedFilters.length === 0 ||
      normalizedFilters.some(filter => matchesFilter(component, filter)),
  );
}

/**
 * Classify every component in the audited roster. An unexplained all-N/A result
 * is a coverage gap; a verified-N/A declaration is stale if a detector later
 * finds applicable behavior.
 */
export function buildComponentCoverage({
  components,
  autoResults = [],
  positionalResults = [],
  decorationResults = [],
  curatedResults = [],
  verifiedNa = [],
  enforced = true,
}) {
  const byName = new Map();
  for (const component of components) {
    const key = component.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, {component, applicable: []});
    }
  }

  const addApplicable = (result, dimension, isApplicable) => {
    if (!isApplicable) {
      return;
    }
    const key = result.component.toLowerCase();
    const entry = byName.get(key) ?? {
      component: result.component,
      applicable: [],
    };
    entry.applicable.push({dimension, storyId: result.storyId});
    byName.set(key, entry);
  };

  for (const result of autoResults) {
    addApplicable(result, 'D1', resultIsApplicable(result));
  }
  for (const result of positionalResults) {
    addApplicable(result, 'D5', resultIsApplicable(result));
  }
  for (const result of decorationResults) {
    addApplicable(result, 'D6', resultIsApplicable(result));
  }
  for (const result of curatedResults) {
    addApplicable(
      result,
      'curated',
      ['RTL-ready', 'not-RTL', 'partial'].includes(result.rollup),
    );
  }

  const verified = new Map();
  for (const declaration of verifiedNa) {
    if (declaration?.component && declaration?.reason?.trim()) {
      verified.set(
        declaration.component.toLowerCase(),
        declaration.reason.trim(),
      );
    }
  }

  const results = Array.from(byName.values())
    .sort((left, right) => left.component.localeCompare(right.component))
    .map(entry => {
      const reason = verified.get(entry.component.toLowerCase());
      if (entry.applicable.length > 0 && reason) {
        return {
          ...entry,
          status: 'stale-verified-na',
          reason,
          note: 'verified-N/A declaration conflicts with applicable RTL behavior',
        };
      }
      if (entry.applicable.length > 0) {
        return {...entry, status: 'measured'};
      }
      if (reason) {
        return {...entry, status: 'verified-na', reason};
      }
      return {
        ...entry,
        status: 'coverage-gap',
        note: 'all dimensions are N-A and no verified-N/A reason is recorded',
      };
    });

  const count = status =>
    results.filter(result => result.status === status).length;
  return {
    enforced,
    total: results.length,
    measured: count('measured'),
    verifiedNa: count('verified-na'),
    gaps: count('coverage-gap'),
    staleVerifiedNa: count('stale-verified-na'),
    results,
  };
}
