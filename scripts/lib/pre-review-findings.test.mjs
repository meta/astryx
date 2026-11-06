// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  SHARED_OWNERS,
  addsDocumentListener,
  authoredLineCount,
  changesetFindings,
  effectFindings,
  mergeFindings,
  recordGapFindings,
  sharedOwnerFindings,
  sizeFindings,
} from './pre-review-findings.mjs';
import {readDiff} from './review-diff.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** A unified diff that adds `added` and removes `removed` lines in `file`. */
function diffOf(file, added, removed = []) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
  ].join('\n');
}

const counted = diff => readDiff(diff).changedCountByFile;

function addedLinesOf(file, lines) {
  return readDiff(diffOf(file, lines)).addedLines;
}

const lines = count => Array.from({length: count}, (_, i) => `line ${i}`);

describe('authoredLineCount', () => {
  it('counts added and removed lines', () => {
    expect(authoredLineCount(counted(diffOf('a.ts', lines(3), lines(2))))).toBe(
      5,
    );
  });

  it('leaves out lockfiles, snapshots, and generated files', () => {
    const diff = [
      diffOf('pnpm-lock.yaml', lines(50)),
      diffOf('packages/core/src/__snapshots__/A.test.tsx.snap', lines(40)),
      diffOf('packages/core/api-report.md', lines(30)),
      diffOf('packages/core/src/A/A.tsx', lines(7)),
    ].join('\n');
    expect(
      authoredLineCount(counted(diff), file => file.endsWith('api-report.md')),
    ).toBe(7);
  });

  it('counts a removed line that starts with dashes', () => {
    expect(authoredLineCount(counted(diffOf('a.md', ['++ b'], ['-- a'])))).toBe(
      2,
    );
  });
});

describe('sizeFindings', () => {
  it('passes at the limit', () => {
    expect(sizeFindings(2000, null)).toEqual([]);
  });

  it('warns above the limit and asks for the description when it is not read', () => {
    const [finding] = sizeFindings(2001, null);
    expect(finding.item).toBe('h');
    expect(finding.rule).toBe('2001 authored lines, over 2000');
    expect(finding.fix).toContain('--body-file');
  });

  it('accepts a declared behavior module at any size', () => {
    for (const body of [
      'Behavior module: the gesture host wheel module',
      'This behavior-module pull request adds the wheel module.',
    ]) {
      expect(sizeFindings(20000, body)).toEqual([]);
    }
    for (const body of [
      "This isn't a behavior-module PR.",
      'This is not a behavior-module pull request.',
      'One fix.',
    ]) {
      expect(sizeFindings(5000, body)).toHaveLength(1);
    }
  });

  it('raises the limit to 8,000 for a Batch row', () => {
    const body = 'Batch: Slider · finger tracking';
    expect(sizeFindings(8000, body)).toEqual([]);
    const [finding] = sizeFindings(8001, body);
    expect(finding.rule).toBe('8001 authored lines, over 8000 for a batch');
  });

  it('counts a stacked pull request, and names the base to count against', () => {
    const [finding] = sizeFindings(5000, '- Stack: 2 of 3, above #123');
    expect(finding.fix).toContain('pass --base the branch below it');
  });
});

describe('sharedOwnerFindings', () => {
  const file = 'packages/core/src/Slider/useThumb.ts';

  it('flags each concern Core owns, with its owner', () => {
    const findings = sharedOwnerFindings(
      addedLinesOf(file, [
        'const observer = new ResizeObserver(measure);',
        "doc?.addEventListener('selectstart', block, true);",
        'const Observer = node.ownerDocument.defaultView?.ResizeObserver;',
        'const warnedTriggers = new WeakSet<Element>();',
        'const host = (parent as ShadowRoot).host;',
      ]),
    );
    expect(findings.map(f => [f.line, f.fix.split('`')[1]])).toEqual([
      [1, 'observeResize'],
      [2, 'subscribeInput'],
      [3, 'observeResize'],
      [4, 'useDevWarning'],
      [5, 'parentAcrossShadow'],
    ]);
    expect(findings.every(f => f.item === 'i')).toBe(true);
  });

  it('skips element listeners, comments, owners, tests, and other packages', () => {
    expect(
      sharedOwnerFindings([
        ...addedLinesOf(file, [
          "element.addEventListener('pointerdown', onDown);",
          '// A new ResizeObserver here would duplicate observeResize.',
          'const warned = useRef(false);',
          'const shadow = tree instanceof ShadowRoot ? tree : null;',
          'if (node.nodeType === 11) return host;',
        ]),
        ...addedLinesOf('packages/core/src/utils/sharedResizeObserver.ts', [
          'observer = new ResizeObserver(notify);',
        ]),
        ...addedLinesOf('packages/core/src/Slider/Slider.test.tsx', [
          'const observer = new ResizeObserver(measure);',
        ]),
        ...addedLinesOf('packages/lab/src/Thing/Thing.tsx', [
          "window.addEventListener('resize', measure);",
        ]),
      ]),
    ).toEqual([]);
  });

  it('reads a document or window receiver in its usual spellings', () => {
    for (const text of [
      "document.addEventListener('keydown', onKey);",
      "node.ownerDocument.addEventListener('pointerup', onUp);",
      "view?.addEventListener('blur', onBlur);",
      "getWindow(node).addEventListener('scroll', onScroll);",
      "(node.ownerDocument ?? document).addEventListener('click', onClick);",
    ]) {
      expect(addsDocumentListener(text)).toBe(true);
    }
    for (const text of [
      "button.addEventListener('click', onClick);",
      "window.visualViewport?.addEventListener('resize', onResize);",
    ]) {
      expect(addsDocumentListener(text)).toBe(false);
    }
  });

  it('names owners that exist in Core', () => {
    for (const {owner, path: ownerPath} of SHARED_OWNERS) {
      const source = fs.readFileSync(path.join(repoRoot, ownerPath), 'utf8');
      expect(source).toMatch(new RegExp(`export function ${owner}\\b`));
    }
  });
});

describe('effectFindings', () => {
  const file = 'packages/core/src/Tooltip/useTooltip.ts';

  function findingsFor(source) {
    const sourceLines = source.split('\n');
    return effectFindings(addedLinesOf(file, sourceLines), name =>
      name === file ? source : null,
    ).map(f => [f.line, f.rule]);
  }

  it('flags a new Effect with no note', () => {
    expect(
      findingsFor(
        [
          'useEffect(() => {',
          '  return subscribe(onChange);',
          '}, [onChange]);',
        ].join('\n'),
      ),
    ).toEqual([
      [1, 'The new Effect has no note that names the system it syncs'],
    ]);
  });

  it('accepts a note above the Effect or at the top of its body', () => {
    expect(
      findingsFor(
        [
          '// Syncs the open state to the browser popover.',
          '// eslint-disable-next-line react-hooks/exhaustive-deps',
          'useLayoutEffect(() => {',
          '  popover.togglePopover(isOpen);',
          '}, [isOpen]);',
          '',
          'useEffect(() => {',
          '  // Subscribes to the document input stream.',
          '  return subscribe(onChange);',
          '}, [onChange]);',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('flags an Effect that only copies a value into a ref', () => {
    expect(
      findingsFor(
        [
          '// Keeps the latest handler.',
          'useEffect(() => {',
          '  onChangeRef.current = onChange;',
          '});',
        ].join('\n'),
      ),
    ).toEqual([[2, 'The Effect only copies a value into a ref']]);
    expect(
      findingsFor(
        [
          '// Keeps the getter current for gesture callbacks.',
          'useIsomorphicLayoutEffect(() => {',
          '  getPartsRef.current = getParts;',
          '});',
        ].join('\n'),
      ),
    ).toEqual([[2, 'The Effect only copies a value into a ref']]);
    expect(
      findingsFor(
        [
          '// Syncs the handler to the native listener.',
          'useEffect(() => {',
          '  onChangeRef.current = onChange;',
          "  node.addEventListener('input', onInput);",
          '}, [onChange]);',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('flags a DOM node in state, but not a React element', () => {
    expect(
      findingsFor(
        [
          'const [trigger, setTrigger] = useState<HTMLElement | null>(null);',
          'const [icon, setIcon] = useState<ReactElement | null>(null);',
          'const [view, setView] = useState<JSX.Element>(fallback);',
        ].join('\n'),
      ),
    ).toEqual([[1, 'A DOM node is kept in React state']]);
  });
});

describe('changesetFindings', () => {
  const core = '@astryxdesign/core';
  const changeset = category => ({
    file: '.changeset/a.md',
    text: `---\n'${core}': patch\n---\n\n[${category}] A sentence.\n\n@someone\n`,
  });

  function findingsFor({shipped, changesets = [], covered = []}) {
    return changesetFindings({
      coverage: {
        required: shipped.length
          ? new Map([[core, new Map([['source', shipped]])]])
          : new Map(),
        covered: new Set(covered),
      },
      changesets,
    }).map(f => [f.item, f.file, f.line, f.rule]);
  }

  it('flags a package that ships a change with no Changeset', () => {
    expect(
      findingsFor({shipped: ['packages/core/src/Button/Button.tsx']}),
    ).toEqual([
      [
        'k',
        'packages/core/src/Button/Button.tsx',
        null,
        `${core} ships a change, and no Changeset names it`,
      ],
    ]);
  });

  it('flags a [fix] when nothing the package ships changes', () => {
    expect(findingsFor({shipped: [], changesets: [changeset('fix')]})).toEqual([
      [
        'k',
        '.changeset/a.md',
        5,
        `\`[fix]\` names ${core}, but nothing ${core} ships changes`,
      ],
    ]);
  });

  it('accepts a covered change, and a [chore] with nothing shipped', () => {
    expect(
      findingsFor({
        shipped: ['packages/core/src/utils/hold.ts'],
        changesets: [changeset('fix')],
        covered: [core],
      }),
    ).toEqual([]);
    expect(
      findingsFor({shipped: [], changesets: [changeset('chore')]}),
    ).toEqual([]);
  });
});

describe('recordGapFindings', () => {
  const record = 'docs/specs/components/HoverCard/HoverCard.spec.md';
  const text = [
    '| FR9 | A press pins the card. | DEC-2 |',
    '| FR9, AR3 | Evidence gap until built: a press suite in `HoverCard.test.tsx` | Click |',
    '| FR12 | Evidence gap until built: a second-press case | Click |',
    '| FR14 | Holds. Implementation gap: `useHold.ts` keeps the old timer. | DEC-4 |',
    '| FR5 | `Tooltip.test.tsx` touch suite, with tap cases an evidence gap until built | Tap |',
    '| FR15 | Implementation gap: not shipped yet (Current-state impact). | DEC-5 |',
  ].join('\n');
  const readHead = file => (file === record ? text : null);

  function findingsFor({changed, added = [], linked = []}) {
    return recordGapFindings({
      records: [record],
      changedFiles: new Set(changed),
      addedByFile: {[record]: added},
      linkedRecords: new Set(linked),
      readHead,
    }).map(f => [f.line, f.rule]);
  }

  it('flags a gap whose own text names a file the change edits', () => {
    expect(
      findingsFor({
        changed: [
          'packages/core/src/HoverCard/HoverCard.test.tsx',
          'packages/core/src/HoverCard/useHold.ts',
          'packages/core/src/Tooltip/Tooltip.test.tsx',
        ],
      }),
    ).toEqual([
      [2, 'A gap row names `HoverCard.test.tsx`, which this change edits'],
      [4, 'A gap row names `useHold.ts`, which this change edits'],
    ]);
  });

  it('flags a gap row for a claim the change edits with its code', () => {
    expect(
      findingsFor({
        changed: [record, 'packages/core/src/HoverCard/HoverCard.tsx'],
        added: ['| FR12 | The card closes on a second press. | DEC-4 |'],
        linked: [record],
      }),
    ).toEqual([
      [
        3,
        'A gap row for FR12 remains, and this change edits FR12 and the code it governs',
      ],
    ]);
  });

  it('leaves a gap alone in a record-only change, and an implementation gap for an edited claim', () => {
    expect(
      findingsFor({
        changed: [record],
        added: [
          '| FR12 | Evidence gap until built: a second-press case | Click |',
        ],
      }),
    ).toEqual([]);
    expect(
      findingsFor({
        changed: [record, 'packages/core/src/HoverCard/HoverCard.tsx'],
        added: ['| FR15 | Implementation gap: not shipped yet. | DEC-5 |'],
        linked: [record],
      }),
    ).toEqual([]);
  });
});

describe('mergeFindings', () => {
  it('lists ten conflicts, then a count of the rest', () => {
    const files = Array.from({length: 12}, (_, i) => `f${i}.ts`);
    const findings = mergeFindings(files, 'origin/main');
    expect(findings).toHaveLength(11);
    expect(findings.at(-1).rule).toBe('2 more files conflict with origin/main');
  });

  it('names each conflicting path', () => {
    expect(mergeFindings(['a.ts'], 'origin/main')).toEqual([
      {
        item: 'l',
        file: 'a.ts',
        line: null,
        rule: 'Conflicts with origin/main',
        fix: 'Merge or rebase onto origin/main, and resolve the conflict.',
      },
    ]);
    expect(mergeFindings([], 'origin/main')).toEqual([]);
  });
});
