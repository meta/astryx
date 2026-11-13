// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file format-changelogs.test.mjs
 * Unit tests for the changelog line-wrapping normalizer.
 *
 * Guards the behavior that keeps published changelog prose consistently
 * wrapped regardless of how each changeset author wrote their entry.
 */

import {createRequire} from 'node:module';
import {describe, it, expect} from 'vitest';
import {reflowBulletBody, formatVersionBlock} from './format-changelogs.mjs';

const {parseEntry, renderReleaseLine} = createRequire(import.meta.url)(
  './changeset-entry-format.cjs',
);

describe('reflowBulletBody', () => {
  it('collapses a hard-wrapped prose paragraph into a single indented line', () => {
    const input = [
      '  The label and optionalRequired styles never set an explicit lineHeight,',
      '  so both fell back to line-height normal, producing mismatched boxes.',
    ].join('\n');
    expect(reflowBulletBody(input)).toBe(
      '  The label and optionalRequired styles never set an explicit lineHeight, so both fell back to line-height normal, producing mismatched boxes.',
    );
  });

  it('leaves an already single-line paragraph unchanged (aside from indent)', () => {
    expect(reflowBulletBody('  One flowing line already.')).toBe(
      '  One flowing line already.',
    );
  });

  it('preserves paragraph breaks (blank lines)', () => {
    const input = ['  First paragraph', '  wrapped.', '', '  Second one.'].join(
      '\n',
    );
    expect(reflowBulletBody(input)).toBe(
      ['  First paragraph wrapped.', '', '  Second one.'].join('\n'),
    );
  });

  it('keeps sub-bullets on their own lines', () => {
    const input = [
      '  Intro sentence',
      '  continues here.',
      '  - first item',
      '  - second item',
    ].join('\n');
    expect(reflowBulletBody(input)).toBe(
      [
        '  Intro sentence continues here.',
        '  - first item',
        '  - second item',
      ].join('\n'),
    );
  });

  it('preserves fenced code blocks verbatim', () => {
    const input = [
      '  Run this:',
      '  ```sh',
      '  npx astryx upgrade --apply',
      '  ```',
    ].join('\n');
    expect(reflowBulletBody(input)).toBe(
      ['  Run this:', '  ```sh', '  npx astryx upgrade --apply', '  ```'].join(
        '\n',
      ),
    );
  });

  it('returns empty string for empty input', () => {
    expect(reflowBulletBody('')).toBe('');
  });

  it('is idempotent', () => {
    const input = ['  A wrapped', '  paragraph.', '', '  - a bullet'].join(
      '\n',
    );
    const once = reflowBulletBody(input);
    expect(reflowBulletBody(once)).toBe(once);
  });
});

describe('formatVersionBlock line-wrapping', () => {
  it('groups experimental entries separately after breaking changes', () => {
    const body = [
      '### Patch Changes',
      '',
      '- [fix] Preserve the stable path. — thanks @athz',
      '- [experimental] Rename an experimental callback. — thanks @cixzhang',
      '- [breaking] Remove a stable callback. — thanks @joeyfarina',
    ].join('\n');
    const out = formatVersionBlock('0.9.9', body);

    expect(out).toContain('#### Experimental APIs');
    expect(out.indexOf('#### Breaking Changes')).toBeLessThan(
      out.indexOf('#### Experimental APIs'),
    );
    expect(out.indexOf('#### Experimental APIs')).toBeLessThan(
      out.indexOf('#### Fixes'),
    );
  });

  it('normalizes wrapping across entries so hard-wrapped and single-line prose match', () => {
    const body = [
      '### Patch Changes',
      '',
      '- [fix] FieldLabel vertical align. — thanks @athz',
      '  The label styles never set an explicit lineHeight,',
      '  so both fell back to line-height normal.',
      '- [fix] A single flowing line the author wrote on one line (#3466) — thanks @arham766',
    ].join('\n');
    const out = formatVersionBlock('0.9.9', body);
    expect(out).toContain(
      '- FieldLabel vertical align.\n  The label styles never set an explicit lineHeight, so both fell back to line-height normal.',
    );
    expect(out).toContain(
      '- A single flowing line the author wrote on one line (#3466)',
    );
  });

  it('keeps every paragraph of a multi-paragraph entry', () => {
    const body = [
      '### Patch Changes',
      '',
      '- [fix] AppShell: two a11y fixes. — thanks @cixzhang',
      '  The mobile top bar is now a banner landmark.',
      '',
      '  The skip link draws the shared focus ring.',
      '',
      '- [fix] A later, unrelated entry. — thanks @athz',
    ].join('\n');
    const out = formatVersionBlock('0.9.9', body);
    expect(out).toContain('The mobile top bar is now a banner landmark.');
    expect(out).toContain('The skip link draws the shared focus ring.');
    expect(out).toContain('- A later, unrelated entry.');
  });

  it('ends a bullet at a blank line followed by unindented content', () => {
    const body = [
      '### Patch Changes',
      '',
      '- [fix] One entry. — thanks @athz',
      '',
      '#### Contributors',
      '',
      '- @athz',
    ].join('\n');
    const out = formatVersionBlock('0.9.9', body);
    expect(out).toContain('- One entry.');
    expect(out).not.toContain('- One entry.\n\n  #### Contributors');
  });

  it("keeps a Changeset's list of details under its own entry", () => {
    // Abridged from a v0.7.16 Changeset: a headline, then a list of details.
    const changeset = [
      "[experimental] `astryx experimental theme editor`: CSS read with the current specifications' grammar.",
      '',
      "- The editor also reads the current specifications' grammar from `@csstools/css-syntax-patches-for-csstree` (a new dependency, pinned).",
      '- A negative number the current grammar ranges at 0 or more is refused on a part (`line-height -1`, `gap -2px`), with the positive value as the suggestion.',
      '- A `color-mix()` share outside 0% to 100% is refused for tokens, part colors and the color dials, and the mix with the share at its limit is suggested.',
      '',
      '@josephfarina',
    ].join('\n');
    const body = [
      '### Patch Changes',
      '',
      renderReleaseLine(parseEntry(changeset)),
      '- [fix] Another entry. — thanks @cixzhang',
    ].join('\n');
    const out = formatVersionBlock('0.9.9', body);
    const lines = out.split('\n');
    const entry = lines.findIndex(line =>
      line.startsWith('- `astryx experimental theme editor`: CSS read'),
    );
    expect(entry, out).toBeGreaterThan(-1);
    expect(lines.slice(entry + 1, entry + 4)).toEqual([
      "  - The editor also reads the current specifications' grammar from `@csstools/css-syntax-patches-for-csstree` (a new dependency, pinned).",
      '  - A negative number the current grammar ranges at 0 or more is refused on a part (`line-height -1`, `gap -2px`), with the positive value as the suggestion.',
      '  - A `color-mix()` share outside 0% to 100% is refused for tokens, part colors and the color dials, and the mix with the share at its limit is suggested.',
    ]);
    // No detail becomes an entry of its own.
    expect(out).not.toContain('#### Other Changes');
    expect(out).not.toMatch(/^- The editor also reads/m);
  });
});
