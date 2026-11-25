// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playground-preview-fonts.test.tsx
 * @input The layout of the playground's preview frame
 * @output Proof that the frame's document has a stylesheet for the weight
 *   range of Playwrite US Trad, before its content
 * @position Docsite unit tests. e2e/font-loading.spec.ts proves that the
 *   stylesheet comes after the font stylesheet of the site.
 * Run: pnpm -F @astryxdesign/docsite test playground-preview-fonts
 */

import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import PreviewLayout from '../app/playground/preview/layout';

it('the preview frame asks for Playwrite US Trad at each weight from 100 to 400', () => {
  expect(
    renderToStaticMarkup(
      <PreviewLayout>
        <main />
      </PreviewLayout>,
    ),
  ).toBe(
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playwrite+US+Trad:wght@100..400&amp;display=swap"/><main></main>',
  );
});
