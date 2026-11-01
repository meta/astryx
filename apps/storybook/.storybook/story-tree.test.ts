// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The story tree has one shape, and this holds it.
 *
 * ```
 * <Package>/<Component>/(Default | Theme Sheet | …)
 * <Package>/Hooks/<hook>
 * <Package>/Themes/<theme feature>
 * <Package>/Internationalization/<page>
 * A11y/<pattern or component>
 * ```
 *
 * Conventions that live only in a README drift: `Hooks/useClipboard` and
 * `Components/ChatComposer/Custom Input` both sat outside the pattern for
 * months because nothing but a reader could notice. This reads the built
 * index, so it judges what Storybook actually renders rather than what the
 * source appears to say.
 *
 * Requires a built Storybook; skips itself when there is none, because a
 * fresh clone has no dist and this must not be the test that fails there. CI
 * runs it in `build-storybook`, right after the build, so a title outside the
 * shape fails the pull request that adds it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'dist', 'index.json');

/** The packages a story can ship from. Not categories — packages. */
const PACKAGES = ['Core', 'Lab', 'Charts', 'Vega', 'RichText'];

/**
 * The root of the accessibility contract fixtures: test fixtures the a11y
 * audit and its browser specs open by story id, not component docs. Compared
 * without case: Storybook ids lowercase titles, so `A11y/` and `a11y/` already
 * share ids.
 */
const FIXTURE_ROOT = 'a11y';

/** Groups that are deliberately not components. */
const NON_COMPONENT_GROUPS = ['Hooks', 'Themes', 'Internationalization'];

type StoryIndex = {entries: Record<string, {title: string}>};

const built = fs.existsSync(INDEX);
const titles = built
  ? [
      ...new Set(
        Object.values(
          (JSON.parse(fs.readFileSync(INDEX, 'utf8')) as StoryIndex).entries,
        ).map(entry => entry.title),
      ),
    ].sort()
  : [];

describe.skipIf(!built)('story tree shape', () => {
  it('has stories to check', () => {
    expect(titles.length).toBeGreaterThan(0);
  });

  it('files every story under a package, never a category', () => {
    const stray = titles.filter(title => {
      const root = title.split('/')[0];
      return !PACKAGES.includes(root) && root.toLowerCase() !== FIXTURE_ROOT;
    });
    expect(
      stray,
      `not under one of ${PACKAGES.join(', ')}, or A11y/ for a11y fixtures`,
    ).toEqual([]);
  });

  it('keeps hooks under <Package>/Hooks/, not beside components', () => {
    const misfiled = titles.filter(title => {
      const segments = title.split('/');
      const isHook = /^use[A-Z]/.test(segments[segments.length - 1]);
      return isHook && segments[1] !== 'Hooks';
    });
    expect(
      misfiled,
      'a hook is not a component — file it under <Package>/Hooks/',
    ).toEqual([]);
  });

  it('keeps theme-level features under <Package>/Themes/', () => {
    // A component may legitimately carry "Theme" in its name, so this looks
    // for the theme FEATURES the repo actually ships rather than a substring.
    const features = [
      'Theme',
      'MediaTheme',
      'MediaTheme Auto',
      'CodeTheme',
      'CodeEditorTheme',
    ];
    const misfiled = titles.filter(title => {
      const segments = title.split('/');
      return (
        features.includes(segments[segments.length - 1]) &&
        segments[1] !== 'Themes'
      );
    });
    expect(
      misfiled,
      'theme features are not components — file them under <Package>/Themes/',
    ).toEqual([]);
  });

  it('never nests a component deeper than <Package>/<Component>', () => {
    // Charts/Chrome/*, Lab/3DChart/* and Lab/ChartTheming/* (one feature in
    // four renderers) are deliberate sub-grouping; anything else three deep is
    // a story name that leaked into the title.
    const allowedGroups = [
      ...NON_COMPONENT_GROUPS,
      'Chrome',
      '3DChart',
      'Chart Interactions',
      'ChartTheming',
    ];
    const tooDeep = titles.filter(title => {
      const segments = title.split('/');
      return segments.length > 2 && !allowedGroups.includes(segments[1]);
    });
    expect(tooDeep, 'put the story name in the story, not the title').toEqual(
      [],
    );
  });
});
