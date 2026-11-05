// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The probe theme: a theme that styles every declared theming target.
 *
 * @input  the component docs (via the CLI's own target enumeration)
 * @output a `defineTheme` config covering every target, variant and state the
 *         system documents as themeable
 *
 * Real themes style what their designer cared about, so most of the themeable
 * surface is never exercised by any of them — on this repo the gate found 49
 * such overrides, and a newly added target starts life in that unverified set
 * by default. Nothing tells you when a target stops working, because nothing
 * was ever styling it.
 *
 * The probe theme closes that by construction: it is GENERATED from the target
 * enumeration, so a target added tomorrow is covered the moment its doc lands —
 * no one has to remember to write a case for it. It is a test fixture, never
 * shipped, and it is deliberately garish: every override is a loud, unmistakable
 * value, because the question it answers is "did this override reach the pixels
 * at all", not "does this look good".
 *
 * Each selector gets a DISTINCT colour, derived from a hash of its name. Two
 * targets that are supposed to be different elements but actually resolve to
 * the same element show up as one colour instead of two — which is exactly the
 * bug ("this sub-target isn't really separate") that a uniform hot-pink theme
 * would hide.
 */

/**
 * A stable, well-separated colour per selector name. Deterministic: the same
 * selector is the same colour in every run, so a baseline stays comparable.
 * @param {string} seed
 * @param {{lightness?: number}} [options]
 * @returns {string}
 */
export function probeColor(seed, options = {}) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
  }
  // Golden-angle hue stepping keeps adjacent selectors far apart in hue.
  const hue = Math.abs(hash * 137.508) % 360;
  const saturation = 70 + (Math.abs(hash >> 8) % 25);
  const lightness = options.lightness ?? 45 + (Math.abs(hash >> 16) % 20);
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

/**
 * Prop values from a doc's `type` union — `'a' | 'b' | 'c'` → ['a','b','c'].
 *
 * A named alias (`AvatarSize`) is not a union at this point; `aliases` carries
 * the ones resolved from source, because a doc that says `size: AvatarSize`
 * documents just as real a variant axis as one that spells the union inline,
 * and skipping those left a third of the surface unprobed.
 *
 * A prop whose type is neither (a number, a boolean, an object) contributes
 * nothing: there is no enumerable value set to probe.
 *
 * @param {string | undefined} type
 * @param {Record<string, string[]>} [aliases]
 * @returns {string[]}
 */
export function unionValues(type, aliases = {}) {
  if (typeof type !== 'string') return [];
  const inline = [...type.matchAll(/'([^']+)'/g)].map(match => match[1]);
  // A union of one is a literal type, not a variant axis.
  if (inline.length > 1) return inline;
  const named = aliases[type.trim()];
  return named && named.length > 1 ? named : [];
}

/**
 * Non-colour properties whose ownership must be visible in the probe capture.
 * The colours prove that a target is reachable; these values prove that the
 * target sits on the element that paints the documented property.
 */
const PROPERTY_PROBES = {
  popover: {borderRadius: '32px'},
};

/**
 * Build the probe theme's `components` map.
 *
 * @param {Array<{key: string, component: string, props: string[], states: string[]}>} targets
 * @param {Record<string, Array<{name: string, type?: string}>>} propsByComponent
 * @param {Record<string, string[]>} [aliases] - named type aliases resolved from source
 * @returns {{components: Record<string, Record<string, Record<string, string>>>, coverage: {targets: number, selectors: number, skipped: Array<{key: string, prop: string, reason: string}>}}}
 */
export function buildProbeComponents(targets, propsByComponent, aliases = {}) {
  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const components = {};
  /** @type {Array<{key: string, prop: string, reason: string}>} */
  const skipped = [];
  let selectors = 0;

  for (const target of targets) {
    const styles = (components[target.key] ??= {});

    if (!styles.base) {
      styles.base = {
        ...paint(`${target.key}`),
        ...(PROPERTY_PROBES[target.key] ?? {}),
      };
      selectors += 1;
    }

    for (const prop of target.props) {
      const declared = propsByComponent[target.component]?.find(
        entry => entry.name === prop,
      );
      const values = unionValues(declared?.type, aliases);
      if (values.length === 0) {
        skipped.push({
          key: target.key,
          prop,
          reason: declared
            ? `type "${declared.type}" is not an enumerable string union`
            : 'not a documented prop of the owning component (usually a sub-element derived from another prop)',
        });
        continue;
      }
      for (const value of values) {
        const selector = `${prop}:${value}`;
        if (styles[selector]) continue;
        styles[selector] = paint(`${target.key}.${selector}`);
        selectors += 1;
      }
    }

    for (const state of target.states) {
      if (styles[state]) continue;
      styles[state] = paint(`${target.key}.${state}`);
      selectors += 1;
    }
  }

  return {
    components,
    coverage: {targets: Object.keys(components).length, selectors, skipped},
  };
}

/**
 * Paint a selector so that each property is independently verifiable.
 *
 * Every property gets its own hue derived from the same seed, rather than one
 * flat colour: a single colour for both `backgroundColor` and `color` renders
 * the text invisible, which hides a text-colour regression behind a working
 * background — and makes the diff report unreadable for the human who has to
 * judge it. Lightness is pinned so the text always contrasts with the fill.
 *
 * Exported so the reach check computes expectations from the SAME function
 * that generates the theme — two copies of this mapping would drift, and the
 * check would then report the drift as a broken override.
 *
 * @param {string} seed
 * @returns {{backgroundColor: string, color: string, borderColor: string, outlineColor: string}}
 */
export function paint(seed) {
  return {
    backgroundColor: probeColor(seed),
    color: probeColor(`${seed}/text`, {lightness: 12}),
    borderColor: probeColor(`${seed}/border`, {lightness: 25}),
    outlineColor: probeColor(`${seed}/outline`, {lightness: 25}),
  };
}

/**
 * The generated theme source. Written to disk rather than built in memory so
 * the coverage it claims is reviewable in a diff — when a target is added, the
 * probe theme's diff is the record that it became covered.
 *
 * @param {ReturnType<typeof buildProbeComponents>} built
 * @returns {string}
 */
export function renderProbeTheme({components, coverage}) {
  return `// Copyright (c) Meta Platforms, Inc. and affiliates.
// @generated by .github/scripts/visual-gate/generate-probe-theme.mjs — do not edit.
//
// A theme that exercises EVERY axis of the theme contract, so the visual gate
// can prove each one still reaches the pixels. Not shipped; not published; a
// test fixture. Regenerate with: pnpm visual:probe-theme
//
// defineTheme takes six things and this covers all six:
//   components  ${coverage.targets} targets, ${coverage.selectors} selectors (generated from the docs)
//   tokens      custom properties, read back off the themed element
//   icons       every registry entry swapped for a marked glyph
//   indicators  check / radio / checkbox swapped — the swap that reaches furthest
//   fonts       a family name nothing else could produce
//   syntax      one unmistakable colour per code token
//
// Only \`components\` is generated; the rest are fixed values that live in
// probeConfig.ts, because they are a contract to assert against rather than a
// projection of the component docs.

import {defineSyntaxTheme, defineTheme} from '@astryxdesign/core/theme';

import {PROBE_FONT, PROBE_SYNTAX, PROBE_TOKENS} from './probeConfig';
import {probeIconRegistry, probeIndicatorRegistry} from './registries';

export const probeTheme = defineTheme({
  name: 'probe',
  tokens: PROBE_TOKENS,
  typography: {
    body: {family: 'AstryxProbeFace', fallbacks: 'monospace'},
    heading: {family: 'AstryxProbeFace', fallbacks: 'monospace'},
    code: {family: 'AstryxProbeFace', fallbacks: 'monospace'},
  },
  syntax: defineSyntaxTheme({name: 'probe', tokens: PROBE_SYNTAX}),
  icons: probeIconRegistry,
  indicators: probeIndicatorRegistry,
  components: ${JSON.stringify(components, null, 2).replace(/\n/g, '\n  ')},
});

// Re-exported so a consumer of the fixture (the gate, a story) can assert
// against the same values the theme was built from, rather than a copy.
export {PROBE_FONT, PROBE_SYNTAX, PROBE_TOKENS};
`;
}
