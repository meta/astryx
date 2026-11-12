#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

import {pathToFileURL} from 'node:url';
import {defineThemePaletteRefs} from './generate-selected-palette-refs.mjs';

const theme = defineThemePaletteRefs({
  slug: 'butter',
  displayName: 'Butter',
});

export const THEME_SOURCE_REL = theme.themeSourceRel;
export const FULL_PALETTE_REL = theme.fullPaletteRel;
export const SELECTED_REFS_REL = theme.selectedRefsRel;
export const TEMPLATE_REFS_REL = theme.templateRefsRel;

export const generateButterPaletteRefs = theme.generate;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(theme.main());
}
