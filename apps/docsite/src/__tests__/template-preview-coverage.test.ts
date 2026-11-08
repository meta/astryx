// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards that every template the gallery lists can actually render.
 * @input The generated template registry and the shared preview component map.
 * @output An invariant pairing each gallery-visible slug with a lazy component.
 * @position Docsite regression test for `/templates` and the preview dialog.
 */

import {describe, expect, it} from 'vitest';
import {templates} from '../generated/templateRegistry';
import {TEMPLATE_COMPONENTS} from '../components/templateComponents';

describe('template preview coverage', () => {
  it('gives every gallery-visible template a preview component', () => {
    // Adding a template takes two edits — the page plus a registry entry — and
    // only the first is obvious. Miss the second and nothing errors: the card
    // still lists from doc metadata, but TemplateThumbnail and
    // TemplatePreviewSurface both bail on the missing slug, so the tile renders
    // empty and the dialog apologises. Mirror the gallery's own filter so this
    // fails for exactly the templates a reader would see broken.
    const missing = templates
      .filter(template => template.isReady && !template.isHiddenFromOverview)
      .map(template => template.slug)
      .filter(slug => !TEMPLATE_COMPONENTS[slug]);

    expect(missing).toEqual([]);
  });
});
