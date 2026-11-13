// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Slot kinds in the published template types. Core's own docs name only the
 * kinds this release knows. An integration's template can name a kind a
 * later release adds, because the loader accepts it and skips it.
 */

import type {IntegrationTemplateDoc} from '@astryxdesign/cli/authoring';
import type {BlockTemplateDoc, PageTemplateDoc} from '@astryxdesign/cli/doc';

export const integrationBlock = {
  type: 'block',
  name: 'acme-filter-bar',
  displayName: 'Acme filter bar',
  aspectRatio: 4,
  fits: ['toolbar', 'hologram'],
} satisfies IntegrationTemplateDoc;

export const integrationPage = {
  type: 'page',
  name: 'acme-dashboard',
  displayName: 'Acme dashboard',
  slots: [
    {name: 'filters', kind: 'toolbar'},
    {name: 'deck', kind: 'hologram'},
  ],
} satisfies IntegrationTemplateDoc;

export const coreBlock = {
  type: 'block',
  name: 'filter-bar',
  displayName: 'Filter bar',
  aspectRatio: 4,
  // @ts-expect-error Core's own docs name only the kinds this release knows.
  fits: ['hologram'],
} satisfies BlockTemplateDoc;

export const corePage = {
  type: 'page',
  name: 'dashboard',
  displayName: 'Dashboard',
  // @ts-expect-error Core's own docs name only the kinds this release knows.
  slots: [{name: 'deck', kind: 'hologram'}],
} satisfies PageTemplateDoc;
