// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes/generate-a-palette`:
 * turn a few seed colors into a full light and dark color palette.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'generate-a-palette',
  placement: {parent: 'namespace:themes', slot: 'guides', order: 20},
  title: 'Generate a palette',
  category: 'guide',
  description:
    'Turn a few seed colors into full light and dark color ramps, saved in the theme folder.',
  sections: [
    {
      id: 'generate-a-palette',
      title: 'Generate a palette',
      content: [
        {
          type: 'prose',
          text: 'A theme needs dozens of related colors — shades of each brand color for backgrounds, borders, text, and states, in both light and dark mode. A palette is that full set of shades. Rather than hand-pick every one, you name a few seed colors and generate the rest, so the shades stay consistent.',
        },
        {
          type: 'prose',
          text: 'You write a short config naming each color family and its seed, then run `theme palette generate`. It expands each seed into a full light and dark ramp — the scale of shades — and writes the result into the theme folder, where your theme tokens point at it (see {@link generic:define-the-theme}). Keep the config and the generated palette together in that folder.',
        },
        {
          type: 'prose',
          text: 'The smallest config is one color family: an `id` to name it and a `seed` color to grow it from. Save it as `themes/ocean/palette.config.json`:',
        },
        {
          type: 'code',
          lang: 'json',
          code: '{"families": [{"id": "ocean", "seed": "#0074e2"}]}',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `# Print the palette without writing files
{@command theme palette generate themes/ocean/palette.config.json}
# Write the palette and its receipt
astryx theme palette generate themes/ocean/palette.config.json \\
  --out themes/ocean/tokens/ocean.palette.ts`,
        },
        {
          type: 'code',
          lang: 'text',
          code: `[ok] Wrote themes/ocean/tokens/ocean.palette.ts

[ok] Wrote themes/ocean/tokens/ocean.palette.receipt.json

Review and edit the candidate before adopting it as theme-owned palette data.`,
        },
        {
          type: 'prose',
          text: 'The command writes two files. `ocean.palette.ts` is the palette your theme tokens will read: it exports `black`, `white`, and `palette` — a ramp of 21 shades (stops `0` to `100`) for both `light` and `dark`. The `.receipt.json` beside it records the exact seeds and settings, so you can regenerate the same palette later. A second run leaves both files alone unless you pass `--overwrite`.',
        },
        {
          type: 'prose',
          text: 'Add `--preview <file>.html` to also get a web page showing every shade, so you can eyeball the palette in a browser. Write it outside `themes/` so it does not ship in your package. Every option is in {@link command:theme palette generate}, and the config it reads is described in {@link function:generateTonalPalette}.',
        },
      ],
    },
  ],
};
