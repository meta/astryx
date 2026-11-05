// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests observable template-gallery data and navigation contracts.
 * @input Uses generated registries and the template playground URL helper.
 * @output Verifies source isolation and slug-based playground navigation.
 * @position Docsite regression coverage for `/templates` data boundaries.
 */

import {describe, expect, it} from 'vitest';
import {buildTemplatePlaygroundHref} from '../components/playgroundLink';
import {templateMetadata} from '../generated/templateMetadataRegistry';
import {templates} from '../generated/templateRegistry';

describe('template gallery data boundaries', () => {
  it('keeps source out of the metadata consumed by browse and search surfaces', () => {
    expect(templateMetadata.map(template => template.slug)).toEqual(
      templates.map(template => template.slug),
    );
    for (const template of templateMetadata) {
      expect(template).not.toHaveProperty('source');
    }
  });

  it('links to the playground by encoded template slug', () => {
    expect(buildTemplatePlaygroundHref('table inbox')).toBe(
      '/playground?template=table%20inbox',
    );
  });
});
