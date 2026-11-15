#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

/**
 * @file Stone-specific entry point for selected palette-reference generation.
 * @input Stone's theme source and committed full palette.
 * @output Stone's package palette refs and matching CLI theme template copy.
 * @position Thin theme wrapper around the shared selected-reference generator.
 */

import {pathToFileURL} from 'node:url';
import {defineThemePaletteRefs} from './generate-selected-palette-refs.mjs';

const theme = defineThemePaletteRefs({
  slug: 'stone',
  displayName: 'Stone',
});

export const THEME_SOURCE_REL = theme.themeSourceRel;
export const FULL_PALETTE_REL = theme.fullPaletteRel;
export const SELECTED_REFS_REL = theme.selectedRefsRel;
export const TEMPLATE_REFS_REL = theme.templateRefsRel;

export const generateStonePaletteRefs = theme.generate;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(theme.main());
}
