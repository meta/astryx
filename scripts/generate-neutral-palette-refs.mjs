#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

/**
 * @file Generates Neutral's runtime-sized palette reference module from the
 * palette stops used by the theme source and the values in the committed full
 * palette. The default mode writes both the package artifact and its CLI theme
 * template copy; `--check` compares both without writing.
 * @input Neutral's theme source and committed full palette.
 * @output The selected runtime palette-reference module and matching CLI copy.
 * @position Repository maintenance command and Neutral build drift guard.
 */

import {pathToFileURL} from 'node:url';
import {
  defineThemePaletteRefs,
  countSelectedRefs,
  syncOutputs,
} from './generate-selected-palette-refs.mjs';

const theme = defineThemePaletteRefs({
  slug: 'neutral',
  displayName: 'Neutral',
});

export const THEME_SOURCE_REL = theme.themeSourceRel;
export const FULL_PALETTE_REL = theme.fullPaletteRel;
export const SELECTED_REFS_REL = theme.selectedRefsRel;
export const TEMPLATE_REFS_REL = theme.templateRefsRel;

export const parseFullPalette = theme.generator.parseFullPalette;
export const discoverSelectedRefs = theme.generator.discoverSelectedRefs;
export const renderSelectedRefs = theme.generator.renderSelectedRefs;
export {countSelectedRefs, syncOutputs};

export const generateNeutralPaletteRefs = theme.generate;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(theme.main());
}
