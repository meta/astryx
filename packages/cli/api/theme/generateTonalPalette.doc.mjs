// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'generateTonalPalette',
  namespace: 'cli/api',
  displayName: 'generateTonalPalette()',
  summary: 'Generate candidate tonal palette data without filesystem effects.',
  description:
    'Runs the versioned astryx-oklch-v1 authoring recipe. The returned candidate ' +
    'contains exact hex values for review; it does not modify a theme, write files, ' +
    'perform semantic mapping, or make accessibility claims. Stop numbers remain ' +
    'stable across layouts, and requested decimal stops are emitted explicitly. ' +
    'Anchor policies are intentional: exact preserves the chosen color at its stop; ' +
    'bounded permits movement within maxDeltaE; flexible treats it as guidance. ' +
    'An anchor needs a mode and stop. Stops apply to every family in one request. ' +
    'The candidate always exposes standalone black and white values for direct theme authoring. ' +
    'Generated TypeScript exports them as `black` and `white`, so they can be assigned directly ' +
    'to semantic theme tokens. Those names are reserved and cannot be used as tonal family IDs. ' +
    'The default 0–100 layout also repeats them as family endpoints; a custom stop list can omit those repeated endpoints.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'generateTonalPalette(input: TonalPaletteGenerationInput): TonalPaletteCandidate',
  keywords: ['palette', 'generate', 'OKLCH', 'authoring', 'candidate'],
  params: [
    {
      name: 'input',
      type: 'TonalPaletteGenerationInput',
      description:
        'Families and seeds plus optional modes, shared stops, anchors, vibrancy from 0 to 100 (default 50), and neutral profile.',
      required: true,
    },
  ],
  returns: [
    {
      type: 'TonalPaletteCandidate',
      description:
        'Deterministic candidate data for author review, including a stops array that defines ramp iteration order and standalone black and white values outside the tonal families.',
    },
  ],
  throws: [
    {
      code: 'Error',
      when: 'the request, family, seed, stop layout, mode, or anchor is invalid',
    },
  ],
  examples: [
    {
      label: 'Generate one family',
      code: "generateTonalPalette({families: [{id: 'blue', seed: '#0074e2'}]});",
    },
    {
      label: 'Preserve a required brand color',
      code: "generateTonalPalette({stops: [50], families: [{id: 'brand', seed: '#0074e2', anchors: [{mode: 'light', stop: 50, color: '#1682d5', policy: 'exact'}]}]});",
    },
    {
      label: 'Allow limited anchor movement',
      code: "generateTonalPalette({stops: [50], families: [{id: 'brand', seed: '#0074e2', anchors: [{mode: 'light', stop: 50, color: '#1682d5', policy: 'bounded', maxDeltaE: 2}]}]});",
    },
    {
      label: 'Use an anchor as guidance',
      code: "generateTonalPalette({stops: [50], families: [{id: 'pink', seed: '#ff4db8', anchors: [{mode: 'light', stop: 50, color: '#ff4db8', policy: 'flexible'}]}]});",
    },
    {
      label: 'Generate an optional accent family',
      code: "generateTonalPalette({families: [{id: 'accent', seed: '#ff4db8'}]});",
    },
    {
      label: 'Generate an explicit intermediate stop',
      code: "generateTonalPalette({stops: [12.5, 50], families: [{id: 'blue', seed: '#0074e2'}]});",
    },
  ],
  related: ['themePaletteGenerate'],
};
