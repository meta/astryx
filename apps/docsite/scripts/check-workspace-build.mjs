#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Preflight for the docsite: fail fast when @astryxdesign/core or the neutral
 * theme isn't built.
 *
 * The docsite's `generate` step runs `astryx theme build`, which imports the
 * compiled @astryxdesign/core theme entry (dist/theme/index.js). In a fresh
 * clone/worktree that dist/ doesn't exist until `pnpm build` runs at the repo
 * root, and the raw failure points at an internal node_modules/.../dist path
 * with no hint of the fix. This check runs first in `generate` (so both `dev`
 * and `build` gate on it) and prints a clear, actionable message.
 *
 * `generate` also renders the landing previews inside the neutral and Butter
 * themes (scripts/generate-landing-template-previews.mjs), which reads the
 * neutral theme's built stylesheet and module and Butter's built module. The other theme packages' CSS is
 * a `next dev`/`next build` runtime concern, not a `generate` prerequisite,
 * so it is intentionally not required here.
 *
 * Usage: node scripts/check-workspace-build.mjs
 */

import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts -> docsite -> apps -> repo root
const ROOT = join(__dirname, '..', '..', '..');

// Representative built artifact for the failure `generate` actually hits:
// core's built theme module. `build:theme` (astryx theme build) imports the
// compiled @astryxdesign/core/theme entry, so if this file is missing, the
// very first step of `generate` dies with a cryptic "Cannot find module
// .../dist/theme/index.js".
//
// The landing template previews render inside the neutral theme, so the last
// step of `generate` reads that theme's built stylesheet and module. The
// themes card's store renders inside the Butter theme, so that step also
// reads Butter's built module. Without them it fails inside the page renderer.
//
// We intentionally do NOT require the other theme packages' built theme.css
// here. Their CSS is a runtime/`next build` concern, not a `generate`
// prerequisite.
const REQUIRED = [
  'packages/core/dist/theme/index.js',
  'packages/themes/neutral/dist/theme.css',
  'packages/themes/neutral/dist/neutral.js',
  'packages/themes/butter/dist/butter.js',
];

const missing = REQUIRED.filter(rel => !existsSync(join(ROOT, rel)));

if (missing.length > 0) {
  console.error(
    [
      '',
      "⚠  Astryx workspace packages aren't built yet.",
      '   The docsite consumes the built output of @astryxdesign/core and the neutral theme.',
      '   Run `pnpm build` from the repo root first, then re-run `pnpm run docsite`.',
      `   (missing: ${missing.join(', ')})`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}
