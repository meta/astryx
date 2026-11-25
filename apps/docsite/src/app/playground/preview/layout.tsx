// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layout.tsx
 * @output The playground preview route, rendered bare (no docsite chrome),
 *   with the weight range of Playwrite US Trad.
 * @position Playground preview iframe — loads the document reset.
 *
 * The preview renders inside an iframe, so it deliberately adds no nav/footer.
 * previewReset.css gives the iframe document full height; the targeting-overlay
 * styles live with their code (propertyEditor/targetingOverlay.css).
 */

import './previewReset.css';

// A preview can ask Playwrite US Trad for a weight below 400: a visitor can
// type the weight of a heading in the theme editor or in the code. The font
// stylesheet of the site (app/layout.tsx) has the family at weight 400 only.
// This stylesheet comes after it in the document. Chromium, Firefox and
// WebKit then draw each weight of the family from the file for the range.
const PLAYWRITE_WEIGHT_RANGE =
  'https://fonts.googleapis.com/css2?family=Playwrite+US+Trad:wght@100..400&display=swap';

export default function PreviewLayout({children}: {children: React.ReactNode}) {
  return (
    <>
      <link rel="stylesheet" href={PLAYWRITE_WEIGHT_RANGE} />
      {children}
    </>
  );
}
