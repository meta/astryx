// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themePaletteGenerate',
  namespace: 'cli/api',
  displayName: 'themePaletteGenerate()',
  summary: 'Generate an author-reviewable palette candidate from JSON input.',
  description:
    'Runs the versioned astryx-oklch-v1 recipe against an explicit generation request. ' +
    'It always emits standalone `black` and `white` values that generated TypeScript can import ' +
    'directly into semantic theme tokens; those names are reserved from tonal family IDs. It also ' +
    'defaults family ramps to 21 stops from 0 through 100, repeating exact black and white ' +
    'as endpoints, but accepts any non-empty ordered numeric stop list. Authors may omit ' +
    'those repeated endpoints while retaining the standalone values. The result is ' +
    'a candidate, not an adopted theme palette or an accessibility claim. With an output path ' +
    'it writes the candidate and a detached reproducibility receipt, and leaves existing ' +
    'author-owned files untouched unless overwrite is true. Shared stop numbers keep the same ' +
    'value across layouts, and decimal stops become explicit keys in generated output.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themePaletteGenerate(configPath: string, options?: {out?: string, preview?: string, overwrite?: boolean}, ctx?: {cwd?: string}): ThemePaletteGenerateResponse',
  keywords: ['theme', 'palette', 'generate', 'OKLCH', 'candidate', 'color'],
  params: [
    {
      name: 'configPath',
      type: 'string',
      description:
        'Path to a JSON file holding a TonalPaletteGenerationInput (the object generateTonalPalette() takes), resolved within cwd.',
      required: true,
    },
    {
      name: 'options.out',
      type: 'string',
      description:
        'Where to write the candidate: a path ending in .ts (a TypeScript module) or .json. A sibling <name>.receipt.json is written next to it.',
    },
    {
      name: 'options.preview',
      type: 'string',
      description:
        'Optional path, ending in .html, for a self-contained HTML review page.',
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description:
        "Replace existing candidate, receipt and preview files. Without it, if any target exists, nothing is written and the result has written: false, reason: 'exists'.",
      default: 'false',
    },
    {
      name: 'ctx.cwd',
      type: 'string',
      description: 'Directory used to resolve the input and output paths.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'theme.palette.generate',
      description:
        'The candidate, summary counts, optional file-write result, and generationReceipt. The generationReceipt identifies generatorVersion `palette-generator-v1` and candidateFormatVersion `palette-typescript-v1` or `palette-json-v1` beside the candidate digest.',
    },
  ],
  throws: [
    {code: 'ERR_FILE_NOT_FOUND', when: 'the config file does not exist'},
    {
      code: 'ERR_PALETTE_GENERATION',
      when: 'the config is not valid JSON; the request, seed, stop layout, mode or anchor is invalid; out does not end in .ts or .json; or preview does not end in .html',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'an input or output path escapes cwd, or output would replace input',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the candidate, receipt or preview file cannot be written',
    },
  ],
  examples: [
    {
      label: 'Generate a candidate without writing files',
      code: "themePaletteGenerate('palette.config.json');",
    },
    {
      label: 'Write candidate files',
      code: "themePaletteGenerate('palette.config.json', {out: 'ocean.palette.ts', preview: 'ocean.palette.html'});",
    },
  ],
  command: 'theme palette generate',
  related: ['generateTonalPalette', 'themeBuild', 'themeTemplate'],
};
