// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused contract tests for the payment-form page template
 * @input Reads the shipped single-file template
 * @output Guards that the checkout columns fit a phone before any script runs
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(dirname, '../../assets/templates/pages/payment-form/page.tsx'),
  'utf8',
);

describe('payment form template contract', () => {
  // A media-query hook answers "not a phone" on the server and in a file that
  // runs no script, so a layout chosen from it paints two narrow columns on a
  // phone. The columns must fold in CSS instead.
  it('folds the form and order summary into one column with CSS', () => {
    expect(source).toMatch(
      /<Grid columns=\{\{minWidth: \d+, max: 2\}\}[^>]*>\s*<VStack gap=\{8\}>\s*\{\/\* Sign in \*\/\}/u,
    );
  });

  // Spacing steps are 4px each. The fold must land where the hook switches to
  // the phone layout, or a band of widths gets two columns in phone order.
  it('folds at the same width the media-query hook treats as a phone', () => {
    const minWidth = Number(
      source.match(/<Grid columns=\{\{minWidth: (\d+)/u)?.[1],
    );
    const gap = Number(
      source.match(/<Grid columns=\{[^>]*gap=\{(\d+)\}/u)?.[1],
    );
    const padding = Number(
      source.match(/<Section[^>]*?padding=\{(\d+)\}/su)?.[1],
    );
    const phoneMax = Number(
      source.match(/useMediaQuery\('\(max-width: (\d+)px\)'\)/u)?.[1],
    );
    expect(2 * minWidth + gap * 4 + 2 * padding * 4).toBe(phoneMax + 1);
  });

  it('chooses no layout direction or column width from the media-query hook', () => {
    expect(source).not.toMatch(/direction=\{isMobile/u);
    expect(source).not.toMatch(/flexBasis/u);
  });
});
