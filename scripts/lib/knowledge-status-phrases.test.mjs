// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the temporary-project-status warning in records.
 * @input Fixture record bodies and record paths
 * @output Which lines warn, which stay silent, and which paths are read
 * @position Regression tests for `scripts/lib/knowledge-status-phrases.mjs`
 */

import {describe, expect, it} from 'vitest';
import {
  findStatusPhrases,
  isStatusCheckedPath,
} from './knowledge-status-phrases.mjs';

const record = (...lines) =>
  ['---', 'kind: architecture', '---', '', '# Record', '', ...lines].join('\n');

const phrases = text => findStatusPhrases(text).map(hit => hit.phrase);

describe('status phrases', () => {
  it('warns on each build-status or sequencing phrase', () => {
    const hits = findStatusPhrases(
      record(
        'The module has not started. Table is the First Consumer.',
        '',
        'The adoption order puts Selector next.',
      ),
    );
    expect(hits.map(hit => [hit.line, hit.phrase])).toEqual([
      [7, 'has not started'],
      [7, 'first consumer'],
      [9, 'adoption order'],
    ]);
  });

  it('matches whole words only', () => {
    expect(
      phrases(record('The firstconsumer field and preadoption order.')),
    ).toEqual([]);
  });

  it('allows one Status line', () => {
    expect(
      phrases(record('**Status:** in progress', '', 'Rows window.')),
    ).toEqual([]);
    expect(phrases(record('Status: not built yet'))).toEqual([]);
  });

  it('allows one in-progress statement, and warns on a second status line', () => {
    expect(phrases(record('Windowing is in progress.'))).toEqual([]);
    expect(
      phrases(
        record('Status: in progress', '', 'Sorting is also in progress.'),
      ),
    ).toEqual(['in progress']);
  });

  it('warns on a second in-progress sentence with no Status line', () => {
    expect(
      phrases(
        record('Windowing is in progress.', '', 'Sorting work in progress.'),
      ),
    ).toEqual(['in progress']);
    expect(
      phrases(
        record(
          'Windowing is in progress.',
          '',
          'Sorting is still in progress.',
        ),
      ),
    ).toEqual(['in progress']);
  });

  it('does not count a state of the system as a status line', () => {
    expect(
      phrases(
        record(
          'A drag in progress keeps its column.',
          'A press in progress stays.',
          'The step shows a ring while in progress.',
        ),
      ),
    ).toEqual([]);
  });

  it('stays silent inside code spans, fences, quotes, and block quotes', () => {
    expect(
      phrases(
        record(
          'Flag text such as `no code yet` in a record.',
          'Reject wording like "has not started" or “second consumer”.',
          '> The adoption order is A, then B.',
          '```text',
          'not built yet',
          '```',
        ),
      ),
    ).toEqual([]);
  });

  it('ignores frontmatter', () => {
    expect(
      phrases('---\nsummary: no code yet\n---\n\n# Record\n\nRows window.\n'),
    ).toEqual([]);
  });
});

describe('gap sections', () => {
  it('stays silent on a line that names a claim and states the mismatch', () => {
    expect(
      phrases(
        record(
          '## Known gaps',
          '',
          '- FR7 gap: Table windows only inside its own viewport, so a page scroll mounts every row; not built yet.',
        ),
      ),
    ).toEqual([]);
  });

  it('warns on a claim line whose other words are build status or sequencing', () => {
    expect(
      phrases(
        record(
          '## Known gaps',
          '',
          '- FR7 gap: no code yet.',
          '- FR7 gap: the module has no code yet and lands after the Table work.',
          '- INV12 gap: no module exists; Selector adopts it once the engine ships.',
          '- FR7 gap: Table windows only inside its own viewport.',
        ),
      ),
    ).toEqual(['no code yet', 'no code yet', 'no module exists']);
  });

  it('warns on general build status inside a gap section', () => {
    expect(
      phrases(
        record(
          '## Known conformance gaps',
          '',
          '- No code yet.',
          '- INV12: not built yet.',
          '',
          '## Implementation gap',
          '',
          'Selector adopts first.',
        ),
      ),
    ).toEqual(['no code yet', 'not built yet', 'adopts first']);
  });

  it('ends the gap section at the next heading of the same or higher level', () => {
    expect(
      phrases(
        record(
          '## Current-state impact',
          '',
          '- FR2 gap: the menu closes on scroll, so a reader loses the selection; no module exists.',
          '',
          '## Behavior',
          '',
          '- FR2 gap: the menu closes on scroll, so a reader loses the selection; no module exists.',
        ),
      ),
    ).toEqual(['no module exists']);
  });
});

describe('paths', () => {
  it('reads spec and architecture records, never plans', () => {
    expect(isStatusCheckedPath('docs/specs/AST-001/spec.md')).toBe(true);
    expect(
      isStatusCheckedPath('docs/specs/components/Table/Table.spec.md'),
    ).toBe(true);
    expect(
      isStatusCheckedPath('docs/architecture/knowledge-contracts.md'),
    ).toBe(true);
    expect(isStatusCheckedPath('docs/specs/AST-001/plan.md')).toBe(false);
    expect(isStatusCheckedPath('docs/families/action-groups.md')).toBe(false);
    expect(isStatusCheckedPath('docs/design/bidirectionality.md')).toBe(false);
  });
});
