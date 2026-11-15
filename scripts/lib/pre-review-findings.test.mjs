// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  RENDER_WRITE_EXCEPTIONS,
  SHARED_OWNERS,
  addsDocumentListener,
  authoredLineCount,
  changesetFindings,
  effectFindings,
  mergeFindings,
  recordGapFindings,
  sharedOwnerFindings,
  sizeAdvice,
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
      diffOf('packages/core/src/data.generated.ts', lines(30)),
      diffOf('packages/core/src/A/A.tsx', lines(7)),
    ].join('\n');
    expect(
      authoredLineCount(counted(diff), file => file.endsWith('.generated.ts')),
    ).toBe(7);
  });

  it('counts a removed line that starts with dashes', () => {
    expect(authoredLineCount(counted(diffOf('a.md', ['++ b'], ['-- a'])))).toBe(
      2,
    );
  });
});

describe('sizeAdvice', () => {
  it('says nothing at the guideline', () => {
    expect(sizeAdvice(2000)).toBeNull();
  });

  it('advises a split above the guideline, and is never a finding', () => {
    expect(sizeAdvice(9000)).toBe(
      'Over 2,000 authored lines: consider splitting if a smaller change would review more easily.',
    );
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

  function findingsFor(source, at = file) {
    const sourceLines = source.split('\n');
    return effectFindings(addedLinesOf(at, sourceLines), name =>
      name === at ? source : null,
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

  it('flags an Effect of any kind that only copies a value into a ref', () => {
    const copy = 'The Effect only copies a value into a ref';
    expect(
      findingsFor(
        [
          '// Keeps the committed handler for the gesture callbacks.',
          'useIsomorphicLayoutEffect(() => {',
          '  onPanRef.current = onPan;',
          '});',
          'useInsertionEffect(() => {',
          '  // Keeps the committed getter for the key handlers.',
          '  getPartsRef.current = props.getParts;',
          '});',
          '// Keeps the latest handler.',
          'useEffect(() => {',
          '  onChangeRef.current = onChange;',
          '});',
        ].join('\n'),
      ),
    ).toEqual([
      [2, copy],
      [5, copy],
      [10, copy],
    ]);
  });

  it('points a ref copy at the shared committed-ref hooks', () => {
    const [finding] = effectFindings(
      addedLinesOf(file, [
        'useLayoutEffect(() => {',
        '  onPanRef.current = onPan;',
        '});',
      ]),
      () =>
        ['useLayoutEffect(() => {', '  onPanRef.current = onPan;', '});'].join(
          '\n',
        ),
    );
    expect(finding.fix).toContain('useCommittedRef');
    expect(finding.fix).toContain('useCommittedRefInto');
    expect(finding.fix).toContain('packages/core/src/hooks/useCommittedRef.ts');
  });

  it("accepts the committed-ref hook's own insertion Effect", () => {
    expect(
      findingsFor(
        [
          '  // Stores values only. Refs to DOM nodes are not attached yet when this runs.',
          '  useInsertionEffect(() => {',
          '    ref.current = value;',
          '  });',
        ].join('\n'),
        'packages/core/src/hooks/useCommittedRef.ts',
      ),
    ).toEqual([]);
  });

  it('flags a committed ref read during render or in useMemo', () => {
    expect(
      findingsFor(
        [
          'export function Panel({onPan, label}: Props) {',
          '  const onPanRef = useCommittedRef(onPan);',
          '  const labelRef = useRef(label);',
          '  useCommittedRefInto(labelRef, label);',
          '  const text = labelRef.current;',
          '  const trimmed = useMemo(() => labelRef.current.trim(), []);',
          '  const upper = useMemo(() => {',
          '    return labelRef.current.toUpperCase();',
          '  }, []);',
          '  const onClick = () => onPanRef.current(labelRef.current);',
          '  useEffect(() => {',
          '    // Subscribes to the window pan stream.',
          '    return listen(() => onPanRef.current());',
          '  }, [onPanRef]);',
          '  return null;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      [5, '`labelRef.current` is read during render'],
      [6, '`labelRef.current` is read during render'],
      [8, '`labelRef.current` is read during render'],
    ]);
  });

  it('accepts an Effect that sets a ref and also syncs an external system', () => {
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

  it('flags an Effect that only copies a prop into state', () => {
    expect(
      findingsFor(
        [
          '// Mirrors the value.',
          'useEffect(() => {',
          '  setDraft(value);',
          '}, [value]);',
        ].join('\n'),
      ),
    ).toEqual([[2, 'The Effect only copies a value into state']]);
  });

  it('flags a ref write in a component or hook body', () => {
    expect(
      findingsFor(
        [
          'export function Button({label}: Props) {',
          '  labelRef.current = label;',
          '  return null;',
          '}',
          'export const useLatest = <T,>(value: T) => {',
          '  if (value !== previousRef.current) {',
          '    previousRef.current = value;',
          '  }',
          '};',
          'function useCache(input) {',
          '  return useMemo(() => {',
          '    cacheRef.current = input;',
          '    return input;',
          '  }, [input]);',
          '}',
          'function useCount(reducer, arg) {',
          '  rendersRef.current += 1;',
          '  ++passesRef.current;',
          '  return useReducer(reducer, arg, init => {',
          '    seedRef.current = init;',
          '    return init;',
          '  });',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      [2, '`labelRef.current` is written during render'],
      [7, '`previousRef.current` is written during render'],
      [12, '`cacheRef.current` is written during render'],
      [17, '`rendersRef.current` is written during render'],
      [18, '`passesRef.current` is written during render'],
      [20, '`seedRef.current` is written during render'],
    ]);
  });

  it('reports only the lines a change adds, not existing ones in a touched file', () => {
    const source = [
      'export function Panel({label, next, onPan}: Props) {',
      '  labelRef.current = label;',
      '  const onPanRef = useCommittedRef(onPan);',
      '  const text = onPanRef.current;',
      '  // Keeps the latest handler.',
      '  useLayoutEffect(() => {',
      '    handlerRef.current = onPan;',
      '  });',
      '  nextRef.current = next;',
      '  return null;',
      '}',
    ].join('\n');
    const added = [{file, line: 9, text: '  nextRef.current = next;'}];

    expect(
      effectFindings(added, name => (name === file ? source : null)).map(f => [
        f.line,
        f.rule,
      ]),
    ).toEqual([[9, '`nextRef.current` is written during render']]);
  });

  it('exempts the render-time writes a current record allows, and only those', () => {
    const at = (path, lines) =>
      effectFindings(addedLinesOf(path, lines), () => lines.join('\n')).map(
        f => [f.line, f.rule],
      );
    const markdown = 'packages/core/src/Markdown/Markdown.tsx';
    const sortable =
      'packages/core/src/Table/plugins/sortable/useTableSortable.tsx';
    expect(
      at(markdown, [
        'export function Markdown({children}: Props) {',
        '  boundariesRef.current = next;',
        '  prevBlocksRef.current = blocks;',
        '  prevInlineNodesRef.current = nodes;',
        '  prevMathRef.current = hasMath;',
        '}',
      ]),
    ).toEqual([[5, '`prevMathRef.current` is written during render']]);
    expect(
      at(sortable, [
        'export function useTableSortable(config: Config) {',
        '  configRef.current = config;',
        '}',
      ]),
    ).toEqual([]);
    // The same writes elsewhere stay findings.
    expect(
      at('packages/core/src/List/List.tsx', [
        'export function List({config}: Props) {',
        '  boundariesRef.current = next;',
        '  configRef.current = config;',
        '}',
      ]),
    ).toEqual([
      [2, '`boundariesRef.current` is written during render'],
      [3, '`configRef.current` is written during render'],
    ]);
  });

  it('names a committed-ref module that exists', () => {
    expect(
      fs.existsSync(
        path.join(repoRoot, 'packages/core/src/hooks/useCommittedRef.ts'),
      ),
    ).toBe(true);
  });

  it('names an exception only where its record clause names the site', () => {
    const records = {
      'component:Markdown': 'docs/specs/components/Markdown/Markdown.spec.md',
      'architecture:react-component-runtime':
        'docs/architecture/react-component-runtime.md',
    };
    for (const {file: site, record} of RENDER_WRITE_EXCEPTIONS) {
      const [id, clause] = record.split('/');
      const text = fs.readFileSync(path.join(repoRoot, records[id]), 'utf8');
      expect(text).toMatch(new RegExp(`\\b${clause}\\b`));
      expect(fs.existsSync(path.join(repoRoot, site))).toBe(true);
    }
    const runtime = fs.readFileSync(
      path.join(repoRoot, records['architecture:react-component-runtime']),
      'utf8',
    );
    expect(runtime).toMatch(/INV17[\s\S]*useTableSortable/);
    expect(runtime).toMatch(/INV17[\s\S]*`component:Markdown` DEC-7/);
  });

  it("does not flag Toast's earlier-sibling commit sync", () => {
    const toast = 'packages/core/src/Toast/ToastViewport.tsx';
    const lines = [
      'function ToastRefSync({onCommit}: {onCommit: () => void}): null {',
      "  // Syncs the viewport's rendered list with the committed render.",
      '  useInsertionEffect(() => {',
      '    onCommit();',
      '  });',
      '  return null;',
      '}',
      'export function ToastViewport() {',
      '  const syncRendered = useCallback(() => {',
      '    renderedToastsRef.current = toasts;',
      '  }, [toasts]);',
      '  return null;',
      '}',
    ];
    expect(
      effectFindings(addedLinesOf(toast, lines), () => lines.join('\n')),
    ).toEqual([]);
  });

  it('accepts lazy initialization of a ref during render', () => {
    expect(
      findingsFor(
        [
          'export function useStore() {',
          '  if (storeRef.current == null) {',
          '    storeRef.current = createStore();',
          '  }',
          '  if (!cacheRef.current) cacheRef.current = new Map();',
          '  idsRef.current ??= new Set();',
          '  namesRef.current ||= [];',
          '  if (countRef.current >= 1 && countRef.current <= 9) count();',
          '  if (storeRef.current === null) {',
          '    otherRef.current = createStore();',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([[10, '`otherRef.current` is written during render']]);
  });

  it('accepts a ref write in a handler, a callback ref, or outside a component', () => {
    expect(
      findingsFor(
        [
          'export function Button({label}: Props) {',
          '  const onClick = () => {',
          '    countRef.current += 1;',
          '    pressedRef.current = true;',
          '  };',
          '  const setNode = useCallback(node => {',
          '    nodeRef.current = node;',
          '  }, []);',
          '  const handlers = {',
          '    onKeyDown() {',
          '      keyRef.current = label;',
          '    },',
          '  };',
          '  return (',
          '    <button',
          '      onBlur={() => (blurredRef.current = true)}',
          '      ref={node => {',
          '        elementRef.current = node;',
          '      }}>',
          "      Don't {`${label} {`}",
          '    </button>',
          '  );',
          '}',
          'function createStore() {',
          '  storeRef.current = new Map();',
          '}',
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
