// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createRequire} from 'node:module';

const {buildA11ySection, formatWcagTags} = createRequire(import.meta.url)('./a11y-format.js');

const report = (violations) => ({
  components: {Button: {storiesAudited: 4, violations}},
});

describe('buildA11ySection', () => {
  it('says so plainly when there is nothing to report', () => {
    expect(buildA11ySection({components: {}})).toContain('No accessibility violations detected');
  });

  it('says the audit did not run when there is no report', () => {
    expect(buildA11ySection(null)).toContain('did not run on this pull request');
  });

  it('lists a violation with its rule, story count, and help link', () => {
    const section = buildA11ySection(
      report([
        {
          impact: 'serious',
          description: 'Elements must have sufficient color contrast',
          id: 'color-contrast',
          storyCount: 2,
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
          tags: ['wcag2aa', 'wcag143'],
        },
      ]),
    );
    expect(section).toContain('**serious**: Elements must have sufficient color contrast');
    expect(section).toContain('Rule: `color-contrast`');
    expect(section).toContain('Affects 2/4 stories');
    expect(section).toContain('[Learn more](https://dequeuniversity.com/rules/axe/4.10/color-contrast)');
    expect(section).toContain('WCAG: 1.4.3 (Level AA)');
  });

  it('renders report strings as text, one line, markup kept literal', () => {
    const section = buildA11ySection(
      report([
        {
          impact: 'minor',
          description: 'line one\nline two with <em>markup</em> and [brackets]',
          id: 'rule`odd`name',
          helpUrl: 'not a url',
        },
      ]),
    );
    expect(section).toContain('line one line two with &lt;em&gt;markup&lt;/em&gt; and \\[brackets\\]');
    // Rule ids keep their own alphabet only, so the code span stays a code span.
    expect(section).toContain('Rule: `ruleoddname`');
    // A help value that is not a plain https URL renders no link at all.
    expect(section).not.toContain('Learn more');
  });
});

describe('formatWcagTags', () => {
  it('extracts dotted criteria from axe tags', () => {
    expect(formatWcagTags(['wcag412', 'wcag2a'])).toBe('WCAG: 4.1.2 (Level A)');
    expect(formatWcagTags(['wcag1411'])).toBe('WCAG: 1.4.11');
    expect(formatWcagTags([])).toBe('');
  });
});
