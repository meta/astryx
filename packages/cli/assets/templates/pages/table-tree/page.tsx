// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A repository you can drill into: folder, subfolder, file, in one table whose
 * folder rows carry the newest commit from everything beneath them.
 *
 * A tree table earns its complexity when the parent rows are *derived from*
 * the children. A plain folder listing does not qualify — a folder with a
 * blank column has nothing to say at its own level, so a tree view is enough,
 * and a table just adds a header row that is true of no row beneath it. What
 * makes a repository qualify is that a folder has a real answer: its last
 * commit is the most recent commit inside it. Then "src changed 2 hours ago"
 * and "src/components is what changed" are the same question at two zoom
 * levels, which is exactly what this shape is for.
 *
 * ## Extending this template
 *
 * **Two hooks, and neither one is the tree.** `useTableTreeState` owns the
 * expanded set and flattens the nested data into the visible rows;
 * `useTableTreeData` is the render plugin that draws the per-level indent and
 * the chevron in the tree column. You pass the first one's `treeConfig`
 * straight into the second. Hand-rolling this — a Set of open ids plus a
 * recursive flatten on every render — is the usual way tree tables get built,
 * and it costs you the ARIA (`aria-level`, `aria-expanded`), the expand-all
 * control, and the guarantee that every level shares one column grid.
 *
 * **Sorting composes with the hierarchy instead of flattening it.**
 * `useTableSortableState` returns an `applySort` that is handed to the tree's
 * `sortSiblings`, so a sort reorders each sibling group in place and children
 * never leave their parent. Sorting by date does not interleave a file with
 * the folder that contains it.
 *
 * **Rollups are computed from the leaves, never stored.** `withRollups` walks
 * the fixture once and gives every folder the newest commit beneath it, so a
 * folder can never disagree with its contents. Message and date are copied
 * from the *same* child rather than reduced separately — taking the newest
 * date and the longest message would describe two different commits on one
 * row. Hardcoding either is the bug this shape exists to prevent.
 *
 * **Search prunes the tree and takes the chevrons with it.** A query keeps any
 * branch with a match anywhere beneath it and force-expands what survives, so
 * results are never hidden behind a collapsed parent. While a query is active
 * the expanded set is derived rather than stored, and manual toggling is
 * suspended; clearing the box restores exactly the expansion state the user had
 * before searching.
 *
 * **A pruned tree has to be re-rolled.** `withRollups` runs again on the
 * pruned result, because removing children changes what every ancestor
 * contains. Skipping that second pass is the subtle bug in most filtered tree
 * tables: the rows are correct, the parents are stale, and a folder quietly
 * advertises a commit that no surviving file beneath it carries. If you add a
 * filter of any kind, re-roll after it.
 *
 * **Ids are paths, and that is load-bearing.** Every node's id is its full
 * path, so the parent lookup for ArrowLeft and the row keys all fall out of
 * string operations instead of a second index. If you swap in data keyed by
 * uuid, you need an explicit `parentId` and the keyboard plugin has to walk
 * that instead.
 *
 * **Arrow keys are a local plugin, not a core one.** `useTableTreeData` gives
 * you the ARIA but no key handling, so `useTreeKeyboardNav` below implements
 * the APG treegrid keys through `transformTable` (one `onKeyDown`) and
 * `transformBodyRow` (roving `tabIndex`). It is written as a real
 * `TablePlugin` rather than a wrapper div so it composes with the other
 * plugins in the same `plugins={{}}` bag. Lift it into core if you need it in
 * more than one place.
 *
 * **The rows carry a cursor and a selection, and they are different things.**
 * The roving `tabIndex` is the cursor — wherever the arrows last left off. The
 * selection is the folder the header trail and the README are describing, and
 * it moves from the name cell or from a breadcrumb, never from an arrow key.
 * The keyboard plugin owns the paint for both because it holds the only
 * `transformBodyRow` in the bag: `aria-selected` and a washed row for the
 * selection, `tabIndex` for the cursor. Because selection is read there, it is
 * also a dependency of that memo — a breadcrumb click changes nothing else the
 * memo watches, so leaving it out strands the tint and the ARIA state on the
 * previously selected row. If you need real multi-row selection, reach for
 * `useTableSelection` rather than widening this one.
 *
 * **The tree column wraps and does not truncate.** That is a documented
 * limitation of `useTableTreeData`: `textOverflow="truncate"` does not reach
 * inside the tree column, because the indent and expander need the cell to be a
 * flex row. Name and the commit subject both take `proportional()` so the two
 * variable-length columns share the slack; the date is `pixel()` because its
 * text has a known ceiling.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Section} from '@astryxdesign/core/Section';
import {SizeProvider} from '@astryxdesign/core/SizeContext';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {Markdown} from '@astryxdesign/core/Markdown';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Link} from '@astryxdesign/core/Link';
import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Token} from '@astryxdesign/core/Token';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {
  Table,
  pixel,
  proportional,
  useTableColumnResize,
  useTableSortable,
  useTableSortableState,
  useTableTreeData,
  useTableTreeState,
} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import * as stylex from '@stylexjs/stylex';
/*
 * Lucide throughout, not Heroicons. A repository page needs a branch and a
 * fork glyph and Heroicons has no git iconography at all, so mixing sets was
 * the only alternative — two libraries drawn on different grids, at different
 * stroke weights, sitting side by side in the same toolbar.
 */
import {
  BookOpen,
  ChartColumn,
  Code,
  Eye,
  File,
  Folder,
  GitBranch,
  GitFork,
  Scale,
  Search,
  ShieldCheck,
  Star,
  Tag,
} from 'lucide-react';

// ============= DATA =============

type EntryKind =
  'folder' | 'typescript' | 'json' | 'yaml' | 'markdown' | 'text';

interface RepoEntry extends Record<string, unknown> {
  /** Full path. Doubles as the ArrowLeft parent link and the row key. */
  id: string;
  name: string;
  kind: EntryKind;
  /** Empty on folders — `withRollups` copies the newest commit beneath them. */
  commitMessage: string;
  /** Epoch ms. Zero on folders — `withRollups` takes the newest descendant. */
  committedAt: number;
  children?: RepoEntry[];
}

/** The repository whose tree fills the table. */
const ROOT_NAME = 'canvas-editor';

/*
 * Every file gets the same glyph. Only one distinction earns its keep in this
 * column — folder or not, because that is what predicts whether a row expands.
 * Splitting files further by extension paints four near-identical shapes that
 * repeat the name sitting next to them.
 */
const KIND_ICON: Record<
  EntryKind,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  folder: Folder,
  typescript: File,
  json: File,
  yaml: File,
  markdown: File,
  text: File,
};

/**
 * A fixed clock. Every age is authored as an offset from it, so "2 hours ago"
 * stays "2 hours ago" in each environment and in the docsite's snapshots —
 * which a real `Date.now()` could not promise.
 */
const NOW = Date.UTC(2026, 8, 9, 16, 0);

const minutesAgo = (count: number): number => NOW - count * 60_000;
const hoursAgo = (count: number): number => NOW - count * 3_600_000;
const daysAgo = (count: number): number => NOW - count * 86_400_000;

function file(
  path: string,
  kind: EntryKind,
  commitMessage: string,
  committedAt: number,
): RepoEntry {
  return {
    id: path,
    name: path.slice(path.lastIndexOf('/') + 1),
    kind,
    commitMessage,
    committedAt,
  };
}

function folder(path: string, children: RepoEntry[]): RepoEntry {
  return {
    id: path,
    name: path.slice(path.lastIndexOf('/') + 1),
    kind: 'folder',
    commitMessage: '',
    committedAt: 0,
    children,
  };
}

const REPO_TREE: RepoEntry[] = [
  folder('.github', [
    folder('.github/workflows', [
      file(
        '.github/workflows/ci.yml',
        'yaml',
        'ci: cache the pnpm store between runs (#412)',
        hoursAgo(3),
      ),
      file(
        '.github/workflows/release.yml',
        'yaml',
        'ci: publish npm provenance on tagged releases (#398)',
        daysAgo(12),
      ),
    ]),
    file(
      '.github/PULL_REQUEST_TEMPLATE.md',
      'markdown',
      'docs: ask for a repro link in bug reports (#377)',
      daysAgo(61),
    ),
  ]),
  folder('docs', [
    folder('docs/architecture', [
      file(
        'docs/architecture/rendering.md',
        'markdown',
        'docs: explain the dirty-rect redraw path (#405)',
        daysAgo(5),
      ),
      file(
        'docs/architecture/state.md',
        'markdown',
        'docs: describe undo stack ownership (#390)',
        daysAgo(21),
      ),
    ]),
    // The one nested README. GitHub renders whichever README sits in the
    // folder you are looking at, so this folder gets a preview and the others
    // get none — which is the behaviour worth showing.
    file(
      'docs/README.md',
      'markdown',
      'docs: add an index for the docs folder (#411)',
      daysAgo(3),
    ),
    file(
      'docs/contributing.md',
      'markdown',
      'docs: document the release checklist (#402)',
      daysAgo(8),
    ),
    file(
      'docs/getting-started.md',
      'markdown',
      'docs: add a first-plugin walkthrough (#369)',
      daysAgo(64),
    ),
  ]),
  folder('src', [
    folder('src/components', [
      // Three levels deep, so the header trail can outgrow the bar and the
      // collapse menu has something to collapse.
      folder('src/components/canvas', [
        file(
          'src/components/canvas/Canvas.tsx',
          'typescript',
          'fix: keep pointer capture through a drag (#417)',
          hoursAgo(2),
        ),
        file(
          'src/components/canvas/layers.ts',
          'typescript',
          'feat: let a group be locked without hiding it (#413)',
          hoursAgo(9),
        ),
        file(
          'src/components/canvas/pointer.ts',
          'typescript',
          'fix: release capture when the window blurs (#417)',
          hoursAgo(2),
        ),
      ]),
      file(
        'src/components/Inspector.tsx',
        'typescript',
        'feat: group the transform fields into one panel (#409)',
        daysAgo(4),
      ),
      file(
        'src/components/Toolbar.tsx',
        'typescript',
        'refactor: derive tool state from the store (#396)',
        daysAgo(14),
      ),
    ]),
    folder('src/lib', [
      file(
        'src/lib/geometry.ts',
        'typescript',
        'perf: stop reallocating the bounds buffer (#414)',
        hoursAgo(20),
      ),
      file(
        'src/lib/serialize.ts',
        'typescript',
        'fix: round-trip empty groups without loss (#401)',
        daysAgo(9),
      ),
      file(
        'src/lib/shapes.ts',
        'typescript',
        'feat: add polygon and star primitives (#411)',
        daysAgo(3),
      ),
    ]),
    file(
      'src/main.ts',
      'typescript',
      'chore: move bootstrap behind a feature flag (#415)',
      daysAgo(1),
    ),
    file(
      'src/ui.tsx',
      'typescript',
      'fix: restore focus after the modal closes (#407)',
      daysAgo(6),
    ),
  ]),
  folder('tests', [
    file(
      'tests/geometry.test.ts',
      'typescript',
      'test: cover degenerate bounding boxes (#414)',
      hoursAgo(20),
    ),
    file(
      'tests/serialize.test.ts',
      'typescript',
      'test: add a fixture for nested groups (#401)',
      daysAgo(9),
    ),
  ]),
  file(
    '.gitignore',
    'text',
    'chore: ignore local coverage output (#380)',
    daysAgo(49),
  ),
  file(
    'LICENSE',
    'text',
    'chore: bump the copyright year (#352)',
    daysAgo(243),
  ),
  file(
    'README.md',
    'markdown',
    'docs: rewrite the install section (#418)',
    minutesAgo(30),
  ),
  file('package.json', 'json', 'chore: bump vite to 6.2 (#416)', hoursAgo(18)),
  file(
    'tsconfig.json',
    'json',
    'build: turn on verbatimModuleSyntax (#393)',
    daysAgo(35),
  ),
];

/**
 * Give every folder the newest commit beneath it — message and date together,
 * taken from the same child so the two columns never describe different
 * commits. Runs bottom-up, so a folder always agrees with what is inside it.
 */
function withRollups(nodes: RepoEntry[]): RepoEntry[] {
  return nodes.map(node => {
    if (!node.children || node.children.length === 0) {
      return node;
    }
    const children = withRollups(node.children);
    const newest = children.reduce((latest, child) =>
      child.committedAt > latest.committedAt ? child : latest,
    );
    return {
      ...node,
      children,
      commitMessage: newest.commitMessage,
      committedAt: newest.committedAt,
    };
  });
}

const ROLLED_UP = withRollups(REPO_TREE);

const DEFAULT_EXPANDED = ['src'];

// ============= README =============

/*
 * Rendered by core's `Markdown`, which parses in-house and draws through the
 * same Heading/Text/List/CodeBlock/Table primitives the rest of the page uses
 * — so the preview inherits the theme instead of shipping its own prose CSS.
 */
const README = `## canvas-editor

A small, embeddable vector canvas. Draw shapes, group them, and serialise the
result to JSON that round-trips without loss.

### Install

\`\`\`bash
npm install canvas-editor
\`\`\`

### Usage

\`\`\`ts
const {Canvas} = await import('canvas-editor');

const canvas = new Canvas(document.querySelector('#root'));
canvas.add({kind: 'rect', x: 0, y: 0, width: 120, height: 80});
\`\`\`

### Status

| Area        | State    | Notes                                  |
| ----------- | -------- | -------------------------------------- |
| Rendering   | Stable   | Dirty-rect redraw, no full repaints    |
| Serialising | Stable   | Round-trips groups and nested shapes   |
| Plugins     | Beta     | API may change before 1.0              |

### Contributing

Read [the contributing guide](#) first. In short:

- One change per pull request, with a test that fails without it.
- Run \`npm test\` before pushing.
- Conventional commits — the changelog is generated from them.

> Issues tagged \`good first issue\` are a reasonable place to start.
`;

const DOCS_README = `## Documentation

How the canvas is put together, and how to work on it.

### Start here

- **getting-started.md** — install the package and draw your first shape.
- **contributing.md** — branch naming, the release checklist, how to get review.

### Architecture

The \`architecture/\` folder covers the parts that are hard to infer from the
source: how the dirty-rect redraw path decides what to repaint, and who owns
the undo stack.
`;

/*
 * Which folders have a README to show. Keyed by folder id, with the empty
 * string standing for the repo root.
 *
 * Whether a preview appears is decided by the tree, not by this map — a
 * folder shows one only if it actually contains a README file. This just
 * supplies the body for the folders that do, so the two cannot disagree
 * about which folders have one.
 */
const READMES: Record<string, string> = {
  '': README,
  docs: DOCS_README,
};

/**
 * The README to show for the folder currently selected, or `null` when that
 * folder has none — the file list stands on its own and the preview card is
 * dropped rather than left empty.
 *
 * Ids are paths, so the folder is reached by walking its segments.
 */
function readmeFor(folderId: string | null): string | null {
  let entries = REPO_TREE;

  if (folderId != null) {
    for (const segment of folderId.split('/')) {
      const next: RepoEntry | undefined = entries.find(
        entry => entry.name === segment && entry.kind === 'folder',
      );
      if (next?.children == null) {
        return null;
      }
      entries = next.children;
    }
  }

  const hasReadme = entries.some(
    entry => entry.kind !== 'folder' && /^readme\.md$/i.test(entry.name),
  );
  return hasReadme ? (READMES[folderId ?? ''] ?? null) : null;
}

// ============= SEARCH =============

/**
 * Shared by `pruneTree` and `countMatches` so the rows on screen and the
 * tally beside the search field can never disagree about what a match is.
 */
function isMatch(node: RepoEntry, needle: string): boolean {
  return (
    node.name.toLowerCase().includes(needle) ||
    node.commitMessage.toLowerCase().includes(needle)
  );
}

/**
 * Counts only true matches. `pruneTree` also keeps ancestors, so the visible
 * row count runs ahead of the number of things actually found.
 */
function countMatches(nodes: RepoEntry[], needle: string): number {
  return nodes.reduce(
    (total, node) =>
      total +
      (isMatch(node, needle) ? 1 : 0) +
      (node.children ? countMatches(node.children, needle) : 0),
    0,
  );
}

/** Keep any branch with a match at or beneath it; drop everything else. */
function pruneTree(nodes: RepoEntry[], needle: string): RepoEntry[] {
  const kept: RepoEntry[] = [];
  for (const node of nodes) {
    const isSelfMatch = isMatch(node, needle);
    const children = node.children ? pruneTree(node.children, needle) : [];
    if (isSelfMatch || children.length > 0) {
      kept.push(
        node.children
          ? {
              ...node,
              children:
                isSelfMatch && children.length === 0 ? node.children : children,
            }
          : node,
      );
    }
  }
  return kept;
}

function collectIds(nodes: RepoEntry[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      into.add(node.id);
      collectIds(node.children, into);
    }
  }
  return into;
}

// ============= FORMATTING =============

/*
 * `numeric: 'auto'` is what turns a single unit into "yesterday", "last week"
 * and "last month" instead of "1 day ago" — the phrasing a repository browser
 * uses. The locale is pinned so the docsite's snapshots do not move with the
 * runner's own.
 */
const relativeFormat = new Intl.RelativeTimeFormat('en-US', {numeric: 'auto'});

// Largest first: the loop reports in the biggest unit that fits.
const AGE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> =
  [
    ['year', 365 * 86_400_000],
    ['month', 30 * 86_400_000],
    ['week', 7 * 86_400_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

function commitAge(epochMs: number): string {
  const elapsed = NOW - epochMs;
  for (const [unit, size] of AGE_UNITS) {
    if (elapsed >= size) {
      return relativeFormat.format(-Math.floor(elapsed / size), unit);
    }
  }
  return 'just now';
}

// ============= KEYBOARD =============

const styles = stylex.create({
  /*
   * Toolbar pads its own contents by 12px, but the table body sits on a 16px
   * content line. The difference is added out here so the two agree.
   */
  headerContainer: {
    paddingInline: '4px',
  },
  /*
   * The wash for the selected folder.
   *
   * `--color-background-blue`, not `--color-accent-muted`: the theme in use
   * neutralises the accent family to grey (#f1f1f1 light, #262626 dark), so an
   * accent wash would be invisible against the zebra stripe. The categorical
   * colours are left chromatic on purpose, which is what makes this read blue.
   *
   * Painted as an inset shadow rather than a background so it survives the
   * zebra stripe, which sets `background-color` on this same row and would
   * otherwise replace it.
   */
  selectedRow: {
    boxShadow: `inset 0 0 0 100vmax ${colorVars['--color-background-blue']}`,
  },
  // Inside the TabList so its divider border keeps spanning the whole card.
  readmeTabs: {
    paddingInline: '4px',
  },
});

/** Header width below which the view switcher and search give up their space. */
const NARROW_HEADER = 720;

/**
 * How many crumbs stay inline before the middle folds into a menu. Three
 * keeps the repo, the parent and the current folder — one more than that and
 * the trail starts competing with the rest of the toolbar for the row.
 */
const MAX_INLINE_CRUMBS = 3;

/** Stands in for the folded-away crumbs while mapping over the trail. */
const ELLIPSIS = Symbol('ellipsis');

/** One entry in the header trail. `id` is null for the repository root. */
interface Crumb {
  label: string;
  id: string | null;
}

/**
 * Reports the observed width of whatever the returned ref is attached to.
 *
 * A container query cannot drive this header. Passing `centerContent` at all
 * is what puts Toolbar into its three-column grid, so hiding the control
 * inside leaves the middle column still holding its share of the row. Whether
 * to pass the slot is a render decision, which puts the breakpoint in JS — and
 * once it is there, the search reads the same number so both halves of the
 * header agree on where narrow starts.
 */
function useMeasuredWidth(
  ref: React.RefObject<HTMLElement | null>,
): number | null {
  // Null until measured, so the first paint is not committed to a guess.
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return;
    }
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

interface TreeKeyboardNavConfig {
  /** The flattened, currently visible rows, in render order. */
  rows: ReadonlyArray<RepoEntry>;
  focusedId: string | null;
  onFocusedIdChange: (id: string) => void;
  expandedIds: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  /** The folder whose contents the header trail is describing, if any. */
  selectedId: string | null;
}

/**
 * APG treegrid keys over the visible rows: Up/Down move, Right expands then
 * descends, Left collapses then ascends, Home/End jump to the ends.
 *
 * Roving `tabIndex` means the table is one tab stop; once inside, the arrows
 * own the movement. Focus itself is moved by the page effect that watches
 * `focusedId`, not from here, so a click and a keypress converge on one path.
 */
function useTreeKeyboardNav({
  rows,
  focusedId,
  onFocusedIdChange,
  expandedIds,
  onExpand,
  onCollapse,
  selectedId,
}: TreeKeyboardNavConfig): TablePlugin<RepoEntry> {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableElement>) => {
      if (event.defaultPrevented || rows.length === 0) {
        return;
      }
      const index = rows.findIndex(row => row.id === focusedId);
      const current = index >= 0 ? rows[index] : undefined;
      const hasChildren = Boolean(current?.children?.length);
      const isExpanded = current != null && expandedIds.has(current.id);

      let nextId: string | undefined;

      switch (event.key) {
        case 'ArrowDown':
          nextId = rows[index + 1]?.id ?? rows[0]?.id;
          break;
        case 'ArrowUp':
          nextId = index > 0 ? rows[index - 1].id : rows[0]?.id;
          break;
        case 'ArrowRight':
          if (current == null) {
            nextId = rows[0]?.id;
          } else if (hasChildren && !isExpanded) {
            onExpand(current.id);
          } else if (hasChildren) {
            // Already open, so Right descends to the first child.
            nextId = rows[index + 1]?.id;
          }
          break;
        case 'ArrowLeft':
          if (current == null) {
            nextId = rows[0]?.id;
          } else if (hasChildren && isExpanded) {
            onCollapse(current.id);
          } else {
            // Ids are paths, so the parent is a prefix of this row's id.
            const cut = current.id.lastIndexOf('/');
            const parentId = cut > 0 ? current.id.slice(0, cut) : undefined;
            nextId = rows.find(row => row.id === parentId)?.id;
          }
          break;
        case 'Home':
          nextId = rows[0]?.id;
          break;
        case 'End':
          nextId = rows[rows.length - 1]?.id;
          break;
        default:
          return;
      }

      // Every branch above either moved focus or toggled a row, so the arrow
      // key must not also scroll the page.
      event.preventDefault();
      if (nextId != null && nextId !== focusedId) {
        onFocusedIdChange(nextId);
      }
    },
    [rows, focusedId, expandedIds, onExpand, onCollapse, onFocusedIdChange],
  );

  return useMemo(
    () => ({
      transformTable: props => ({
        ...props,
        htmlProps: {...props.htmlProps, onKeyDown: handleKeyDown},
      }),
      transformBodyRow: (props, item) => ({
        ...props,
        /*
         * The selected folder is washed rather than outlined, so the row
         * still reads as part of the list. The tint rides on this plugin
         * because it owns the only `transformBodyRow` in the bag — a second
         * plugin transforming the same row would have to be merged by hand.
         */
        xstyle: [...props.xstyle, item.id === selectedId && styles.selectedRow],
        htmlProps: {
          ...props.htmlProps,
          /*
           * Roving tabindex: one stop for the whole table. Selection and the
           * cursor are separate — the cursor is wherever the arrows left off,
           * the selection is the folder the header trail is describing.
           */
          tabIndex: item.id === focusedId ? 0 : -1,
          'data-row-id': item.id,
          'aria-selected': item.id === selectedId ? true : undefined,
          onClick: () => onFocusedIdChange(item.id),
        },
      }),
    }),
    [handleKeyDown, focusedId, selectedId, onFocusedIdChange],
  );
}

// ============= COLUMNS =============

/*
 * A factory, not a constant: the name cell has to reach the handler that
 * moves the trail in the header, and that handler only exists inside the
 * page component.
 */
function buildColumns(
  onSelectFolder: (id: string) => void,
): TableColumn<RepoEntry>[] {
  return [
    {
      key: 'name',
      header: 'Name',
      // Deep rows spend their width on indentation before the name even starts,
      // so this column needs a floor well above the 120px default.
      width: proportional(2, {minWidth: 240}),
      sortable: true,
      renderCell: entry => (
        <HStack gap={2} vAlign="center">
          <Icon
            icon={KIND_ICON[entry.kind]}
            size="sm"
            color={entry.kind === 'folder' ? 'accent' : 'secondary'}
            // Lucide draws strokes only, so filling the folder is the sole way
            // to weight it against the files. `fill` reaches the svg because
            // Icon forwards unknown props through to the component it renders.
            fill={entry.kind === 'folder' ? 'currentColor' : 'none'}
          />
          {entry.kind === 'folder' ? (
            /*
             * A folder is a place rather than a document, so activating it
             * selects it and the header trail follows. The href is what makes
             * it a link for the keyboard and the context menu; the default is
             * suppressed because nothing is actually fetched.
             */
            <Link
              href="#"
              onClick={event => {
                event.preventDefault();
                onSelectFolder(entry.id);
              }}>
              {entry.name}
            </Link>
          ) : (
            <Link href="#">{entry.name}</Link>
          )}
        </HStack>
      ),
    },
    {
      // Subject lines are long and vary a lot, so this column takes the slack
      // rather than truncating at a width picked in advance.
      key: 'message',
      header: 'Last commit message',
      width: proportional(3, {minWidth: 200}),
      sortable: true,
      renderCell: entry => <Text color="secondary">{entry.commitMessage}</Text>,
    },
    {
      key: 'committed',
      header: 'Last commit date',
      width: pixel(160),
      align: 'end',
      sortable: true,
      renderCell: entry => (
        <Text color="secondary">{commitAge(entry.committedAt)}</Text>
      ),
    },
  ];
}

// ============= REPO CHROME =============

/*
 * The supporting detail around the file list. None of it is interactive here —
 * it exists so the table is read in the context a real repository gives it,
 * and so the layout is exercised at its true density rather than with a bare
 * table floating in an empty page.
 */

const REPO_DESCRIPTION =
  'A small, embeddable vector canvas. Draw shapes, group them, and serialise the result to JSON that round-trips without loss.';

const TOPICS = [
  'canvas',
  'vector-graphics',
  'typescript',
  'editor',
  'svg',
  '2d-graphics',
  'wasm',
];

const ABOUT_LINKS = [
  {label: 'Readme', icon: BookOpen},
  {label: 'MIT license', icon: Scale},
  {label: 'Code of conduct', icon: ShieldCheck},
  {label: 'Security policy', icon: ShieldCheck},
  {label: 'Activity', icon: ChartColumn},
];

/** The count reads as a noun; the button beside it has to read as a verb. */
const STAT_ACTION: Record<string, string> = {
  stars: 'Star',
  watching: 'Watch',
  forks: 'Fork',
};

/*
 * The two ref counts beside the branch selector. Tag rather than Tags: the
 * plural glyph reads as a stack at 16px, which is noise next to a branch icon
 * that is already busy.
 */
const REF_COUNTS = [
  {label: '171 Branches', icon: GitBranch},
  {label: '56 Tags', icon: Tag},
];

const REPO_STATS = [
  {label: 'stars', value: '12.6k', icon: Star},
  {label: 'watching', value: '97', icon: Eye},
  {label: 'forks', value: '1.3k', icon: GitFork},
];

const CONTRIBUTORS = [
  'Ada Okafor',
  'Bo Lindqvist',
  'Cass Moreau',
  'Dev Raman',
  'Elif Aydın',
  'Finn Ashworth',
  'Gia Petrova',
  'Hana Sato',
  'Ines Duarte',
  'Jo Mbeki',
  'Kit Nakamura',
  'Lena Voss',
];

/** The sidebar GitHub puts beside the file list. */
function AboutPanel() {
  return (
    <VStack gap={6}>
      <VStack gap={3}>
        <Heading level={3}>About</Heading>
        <Text color="secondary">{REPO_DESCRIPTION}</Text>
        <Link href="#" isExternalLink>
          canvas-editor.dev
        </Link>
        {/*
          Topics are chips you can click, which rules out Badge — its docs
          name clickable badges as an anti-pattern. Token is the chip that
          takes an onClick and paints a hover state to match.
        */}
        <HStack gap={1} wrap="wrap">
          {TOPICS.map(topic => (
            <Token key={topic} size="sm" label={topic} onClick={() => {}} />
          ))}
        </HStack>
        {/*
          Not a List. ListItem is a row with its own inline padding and hit
          area, so it hangs its text further in than the description, the
          topics and the stats above it — the one thing this column needs is
          a single left edge. An icon beside a Link starts where they start.
        */}
        <VStack gap={2}>
          {ABOUT_LINKS.map(link => (
            <HStack key={link.label} gap={2} vAlign="center">
              <Icon icon={link.icon} size="sm" color="secondary" />
              <Link href="#">{link.label}</Link>
            </HStack>
          ))}
        </VStack>
        {/*
          Same row shape as the links above: one per line, icon at sm beside
          a default-size Link. These used to be supporting-size with the count
          bolded and the three of them wrapping two-then-one, which read as a
          different kind of thing sitting in the middle of the same column.
        */}
        <VStack gap={2}>
          {REPO_STATS.map(stat => (
            <HStack key={stat.label} gap={2} vAlign="center">
              <Icon icon={stat.icon} size="sm" color="secondary" />
              <Link href="#">
                {stat.value} {stat.label}
              </Link>
            </HStack>
          ))}
        </VStack>
      </VStack>

      <Divider />

      <VStack gap={3}>
        <Heading level={3}>Releases</Heading>
        <HStack gap={2} vAlign="center">
          <Icon icon={Tag} size="sm" color="success" />
          <Text weight="bold">v2.4.0</Text>
          <Badge label="Latest" variant="success" />
        </HStack>
        <Text type="supporting" color="secondary">
          {commitAge(daysAgo(11))} · 36 releases
        </Text>
      </VStack>

      <Divider />

      <VStack gap={3}>
        <Heading level={3}>Contributors</Heading>
        {/*
          AvatarGroup overlaps its children by design, which fights a wrapping
          grid — so this is a plain wrapped row of avatars, which is the shape
          GitHub uses and the shape the group's own docs point you to here.
        */}
        <HStack gap={1} wrap="wrap">
          {CONTRIBUTORS.map(name => (
            <Avatar key={name} name={name} size={32} />
          ))}
        </HStack>
        <Link href="#">+ 61 contributors</Link>
      </VStack>
    </VStack>
  );
}

/**
 * The bar between the repo header and the file list: which ref you are looking
 * at on the left, and what you can do with it on the right.
 */
function BranchBar({
  query,
  onQueryChange,
  searchRef,
  isSearching,
  matchCount,
  isNarrow,
  isSearchOpen,
  onSearchOpen,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  isSearching: boolean;
  matchCount: number;
  isNarrow: boolean;
  isSearchOpen: boolean;
  onSearchOpen: () => void;
}) {
  return (
    /*
     * One height for the whole row. Toolbar gets this by wrapping its slots in
     * a SizeProvider, and this bar is a plain HStack, so it does the same.
     * Button and TextInput read the context; IconButton and DropdownMenu do
     * not, so those two are told directly — DropdownMenu takes it on its
     * `button` object, where it otherwise defaults to `md`.
     */
    <SizeProvider value="sm">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <DropdownMenu
          button={{
            label: 'main',
            size: 'sm',
            icon: <Icon icon={GitBranch} size="sm" />,
          }}
          hasChevron
          items={[
            {label: 'main', onClick: () => {}},
            {label: 'next', onClick: () => {}},
            {type: 'divider'},
            {label: 'View all branches', onClick: () => {}},
          ]}
        />
        {/*
          Ghost is the flat variant — no fill, no border. The count and the
          noun ride in one `label` because Button takes a string, so the
          number cannot be bolded separately the way it is in the stats row.

          These drop to icons at the same width where the search field
          collapses. `label` carries the full "171 Branches" in both forms, so
          what a screen reader hears does not change with the viewport — only
          whether the text is painted alongside the glyph.
        */}
        <HStack gap={1} vAlign="center">
          {REF_COUNTS.map(ref =>
            isNarrow ? (
              <IconButton
                key={ref.label}
                variant="ghost"
                size="sm"
                icon={<Icon icon={ref.icon} size="sm" />}
                label={ref.label}
                onClick={() => {}}
              />
            ) : (
              <Button
                key={ref.label}
                variant="ghost"
                size="sm"
                label={ref.label}
                onClick={() => {}}
              />
            ),
          )}
        </HStack>
        <StackItem size="fill">
          <HStack gap={2} hAlign="end" vAlign="center">
            {isSearching && matchCount > 0 && (
              <Text type="supporting" color="secondary">
                {matchCount} {matchCount === 1 ? 'result' : 'results'}
              </Text>
            )}
            {isNarrow && !isSearchOpen ? (
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={Search} size="sm" />}
                label="Go to file"
                onClick={onSearchOpen}
              />
            ) : (
              <TextInput
                label="Go to file"
                isLabelHidden
                placeholder="Go to file"
                startIcon={Search}
                value={query}
                onChange={onQueryChange}
                hasClear
                ref={searchRef}
              />
            )}
            <DropdownMenu
              button={{label: 'Add file', size: 'sm'}}
              hasChevron
              items={[
                {label: 'Create new file', onClick: () => {}},
                {label: 'Upload files', onClick: () => {}},
              ]}
            />
            <Button
              label="Code"
              variant="primary"
              icon={<Icon icon={Code} size="sm" />}
            />
          </HStack>
        </StackItem>
      </HStack>
    </SizeProvider>
  );
}

// ============= README =============

/**
 * The repository's own documentation, under the file list.
 *
 * The tabs swap content in place rather than navigating, so they are a real
 * `role="tablist"` and each `Tab` names the panel it controls. `Markdown`
 * takes `headingLevelStart={2}` because the page's h1 is the repository name
 * up in the header — leaving it at 1 would put a second top-level heading in
 * the outline for what is really a section of this page.
 */
function ReadmePanel({
  markdown,
  hasRepoTabs,
}: {
  markdown: string;
  /*
   * Code of conduct, licence and security policy are repository-level files
   * that live at the root, so they are not offered while you are looking
   * inside a folder — only that folder's own README is.
   */
  hasRepoTabs: boolean;
}) {
  const [tab, setTab] = useState('readme');
  const activeTab = hasRepoTabs ? tab : 'readme';

  return (
    <Card padding={0}>
      {/*
        `hasDivider` is a border on the TabList itself, so the inset has to go
        inside it: padding moves the tabs in 4px while the border still runs
        the full width of the card. Putting that padding on the Section
        instead would carry the rule in with it and stop it short at both ends.
      */}
      <Section variant="transparent" padding={0} paddingBlockStart={1}>
        <TabList
          value={activeTab}
          onChange={setTab}
          role="tablist"
          size="sm"
          hasDivider
          xstyle={styles.readmeTabs}>
          <Tab value="readme" label="Readme" panelId="repo-readme" />
          {hasRepoTabs && (
            <Tab
              value="conduct"
              label="Code of conduct"
              panelId="repo-conduct"
            />
          )}
          {hasRepoTabs && (
            <Tab value="license" label="MIT license" panelId="repo-license" />
          )}
          {hasRepoTabs && (
            <Tab value="security" label="Security" panelId="repo-security" />
          )}
        </TabList>
      </Section>
      <Section variant="transparent" padding={6} id={`repo-${activeTab}`}>
        {activeTab === 'readme' ? (
          // Prose already caps at Markdown's default 680px measure; centring
          // it stops that column hugging the left edge of a much wider card.
          <Markdown headingLevelStart={2} contentAlign="center">
            {markdown}
          </Markdown>
        ) : (
          <Text color="secondary">
            {TAB_PLACEHOLDER[activeTab as keyof typeof TAB_PLACEHOLDER]}
          </Text>
        )}
      </Section>
    </Card>
  );
}

/*
 * The other three tabs exist to show the shape of the control; a template that
 * shipped four full documents would be teaching markdown, not layout.
 */
const TAB_PLACEHOLDER = {
  conduct: 'The Contributor Covenant, version 2.1, applies to this project.',
  license: 'MIT. Do what you like, keep the notice, expect no warranty.',
  security: 'Report vulnerabilities privately through a security advisory.',
};

// ============= PAGE =============

export default function FileTreeTemplate() {
  const [query, setQuery] = useState('');
  const [manualExpandedIds, setManualExpandedIds] = useState<
    ReadonlySet<string>
  >(() => new Set(DEFAULT_EXPANDED));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /*
   * Two regions, two numbers. The header spans the whole page, so it is what
   * decides whether the repo actions keep their labels. The branch bar sits in
   * the content column beside the sidebar and can be far narrower than the
   * page — measuring the header for it would leave the search field expanded
   * in a column that cannot hold it.
   */
  const headerRef = useRef<HTMLDivElement>(null);
  const headerWidth = useMeasuredWidth(headerRef);
  const isNarrowHeader = headerWidth != null && headerWidth <= NARROW_HEADER;

  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyWidth = useMeasuredWidth(bodyRef);
  const isNarrowBody = bodyWidth != null && bodyWidth <= NARROW_HEADER;

  /*
   * Below this the sidebar would starve the table — 296px off an already
   * short page leaves the commit column clipped. It moves under the README
   * instead, which is where GitHub puts it at the same size.
   */
  const isSidebarInline = useMediaQuery('(min-width: 1024px)');

  /*
   * The field is only hidden, never unmounted, so `hasAutoFocus` would not
   * fire on the way back in — the button reveals an existing element rather
   * than mounting a new one.
   */
  useEffect(() => {
    if (isSearchOpen) {
      searchRef.current?.focus();
    }
  }, [isSearchOpen]);

  /*
   * Collapsing with a query still applied would hide the reason the tree is
   * pruned, so an empty field is the only way back to the button. Bound
   * natively because blur does not bubble and TextInput takes no `onBlur`.
   */
  useEffect(() => {
    const input = searchRef.current;
    if (input == null) {
      return;
    }
    const collapseIfEmpty = () => {
      if (query === '') {
        setIsSearchOpen(false);
      }
    };
    input.addEventListener('blur', collapseIfEmpty);
    return () => input.removeEventListener('blur', collapseIfEmpty);
    // `isSearchOpen` mounts and unmounts the field, so the listener has to be
    // rebound onto whichever element is currently there.
  }, [query, isSearchOpen]);

  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;

  // Pruning changes what a folder contains, so the rollups have to be
  // recomputed from the survivors. Reusing the unpruned totals would leave a
  // folder claiming more bytes than the files visible underneath it add up to.
  const data = useMemo(
    () => (isSearching ? withRollups(pruneTree(ROLLED_UP, needle)) : ROLLED_UP),
    [isSearching, needle],
  );

  // While searching, expansion is derived from the pruned tree so no match can
  // hide behind a collapsed parent; manual state is parked, not overwritten.
  const searchExpandedIds = useMemo(
    () => (isSearching ? collectIds(data, new Set<string>()) : null),
    [isSearching, data],
  );
  const expandedIds = searchExpandedIds ?? manualExpandedIds;

  const sortable = useTableSortableState<RepoEntry>({
    data,
    comparators: {
      // Folders first, then by name — the ordering every repo browser uses.
      name: (a, b) =>
        Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
        a.name.localeCompare(b.name),
      message: (a, b) => a.commitMessage.localeCompare(b.commitMessage),
      committed: (a, b) => a.committedAt - b.committedAt,
    },
  });

  const {visibleData, treeConfig} = useTableTreeState<RepoEntry>({
    data,
    idKey: 'id',
    expandedIds,
    onExpandedIdsChange: isSearching ? () => {} : setManualExpandedIds,
    // Reorders each sibling group in place, so children never leave their
    // parent — this is what keeps sorting and hierarchy compatible.
    sortSiblings: sortable.applySort,
  });

  const setExpanded = useCallback(
    (id: string, shouldExpand: boolean) => {
      if (isSearching) {
        return;
      }
      setManualExpandedIds(previous => {
        const next = new Set(previous);
        if (shouldExpand) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    },
    [isSearching],
  );

  const expandRow = useCallback(
    (id: string) => setExpanded(id, true),
    [setExpanded],
  );
  const collapseRow = useCallback(
    (id: string) => setExpanded(id, false),
    [setExpanded],
  );

  /*
   * Selecting a folder is what the header trail reads from. Ids are paths, so
   * the trail is the id split on '/' — there is no second structure to keep in
   * step with the tree.
   */
  const selectFolder = useCallback(
    (id: string) => {
      setSelectedFolderId(id);
      // Selecting a folder you cannot see into is a dead end, so open it.
      setExpanded(id, true);
    },
    [setExpanded],
  );

  /*
   * The header trail, root first. Ids are paths, so each crumb's target is
   * just the prefix up to that segment — there is no second structure to keep
   * in step with the tree.
   */
  const crumbs = useMemo((): Crumb[] => {
    const segments =
      selectedFolderId == null ? [] : selectedFolderId.split('/');
    return [
      {label: ROOT_NAME, id: null},
      ...segments.map((segment, index) => ({
        label: segment,
        id: segments.slice(0, index + 1).join('/'),
      })),
    ];
  }, [selectedFolderId]);

  /*
   * Keep the first crumb and the last two; everything between them goes to
   * the menu. The first is the repo, the last is where you are, and the one
   * before it is the usual "up one level" target — those three carry almost
   * all the navigation, so the middle is what can afford to fold away.
   */
  const hiddenCrumbs = useMemo(
    () =>
      crumbs.length > MAX_INLINE_CRUMBS
        ? crumbs.slice(1, crumbs.length - 2)
        : [],
    [crumbs],
  );

  const collapsedCrumbs = useMemo(
    (): Array<Crumb | typeof ELLIPSIS> =>
      hiddenCrumbs.length === 0
        ? crumbs
        : [crumbs[0], ELLIPSIS, ...crumbs.slice(crumbs.length - 2)],
    [crumbs, hiddenCrumbs],
  );

  const columns = useMemo(() => buildColumns(selectFolder), [selectFolder]);

  const readme = useMemo(() => readmeFor(selectedFolderId), [selectedFolderId]);

  // Focus follows `focusedId`, whether it moved by arrow key or by click, so
  // there is one path to keep the roving tabindex and the DOM in agreement.
  const shouldFocusRef = useRef(false);
  const moveFocus = useCallback((id: string) => {
    shouldFocusRef.current = true;
    setFocusedId(id);
  }, []);

  useEffect(() => {
    if (!shouldFocusRef.current || focusedId == null) {
      return;
    }
    shouldFocusRef.current = false;
    bodyRef.current
      ?.querySelector<HTMLElement>(`tr[data-row-id="${CSS.escape(focusedId)}"]`)
      ?.focus();
  }, [focusedId, visibleData]);

  const tree = useTableTreeData({...treeConfig, hasExpandAllControl: true});
  const sort = useTableSortable<RepoEntry>(sortable.sortConfig);
  const resize = useTableColumnResize<RepoEntry>({
    columnWidths,
    onColumnResizeEnd: updates =>
      setColumnWidths(previous => ({...previous, ...updates})),
    columns: columns as TableColumn<Record<string, unknown>>[],
    /*
     * No global `minWidth` on purpose: it takes precedence over every column's
     * own floor, so setting one here would flatten Name's 240px down to a
     * single shared number. Each column carries its own instead — the fixed
     * ones floor at their declared width, Name at the minimum that still fits
     * an indented filename.
     */
  });
  const keyboard = useTreeKeyboardNav({
    rows: visibleData,
    focusedId,
    onFocusedIdChange: moveFocus,
    expandedIds,
    onExpand: expandRow,
    onCollapse: collapseRow,
    selectedId: selectedFolderId,
  });

  const matchCount = useMemo(
    () => (isSearching ? countMatches(ROLLED_UP, needle) : 0),
    [isSearching, needle],
  );

  return (
    <Layout
      /*
       * `fill` — the default — pins the layout to the viewport and scrolls the
       * content area internally, which would trap the README below the fold
       * with no way to reach it. `auto` lets the page itself scroll.
       */
      height="auto"
      /*
       * Past this the commit column strands its date miles from its message.
       * Layout centres each slot inside the cap and leaves dividers
       * full-bleed, so the page keeps its edge-to-edge rules on a wide screen.
       */
      contentWidth={1440}
      end={
        !isSidebarInline ? undefined : (
          <LayoutPanel
            width={296}
            padding={4}
            role="complementary"
            label="About this repository"
            /*
             * One scroller for the page, as on the reference: the sidebar
             * travels with the README rather than holding its own scrollbar
             * next to the page's.
             */
            isScrollable={false}>
            <AboutPanel />
          </LayoutPanel>
        )
      }
      header={
        <Toolbar
          label="Repository"
          size="sm"
          dividers={['bottom']}
          xstyle={styles.headerContainer}
          startContent={
            <HStack gap={2} vAlign="center">
              {/*
                The repo name is the first crumb rather than a heading sitting
                beside the trail. As a heading it was 17px against the
                segments' 14px, so selecting a folder put two type sizes on one
                line; as a crumb it cannot drift from them. The page still owes
                the outline an h1, which no longer has anything to attach to,
                so it is supplied for assistive tech only.
              */}
              <VisuallyHidden>
                <Heading level={1}>{ROOT_NAME}</Heading>
              </VisuallyHidden>
              <Breadcrumbs label="Folder path">
                {/*
                  Breadcrumbs wraps rather than truncates when it runs out of
                  room, which in a single-row toolbar pushes the whole header
                  taller. Past MAX_INLINE_CRUMBS the middle folds into a menu
                  on a "…" item, so the trail keeps its height and the ends —
                  the repo you are in and the folder you are looking at — stay
                  visible, which are the two you navigate from.
                */}
                {collapsedCrumbs.map((crumb, index) =>
                  crumb === ELLIPSIS ? (
                    <BreadcrumbItem
                      key="ellipsis"
                      menu={hiddenCrumbs.map(hidden => ({
                        label: hidden.label,
                        onClick: () => setSelectedFolderId(hidden.id),
                      }))}>
                      &hellip;
                    </BreadcrumbItem>
                  ) : (
                    <BreadcrumbItem
                      key={crumb.id ?? ROOT_NAME}
                      isCurrent={index === collapsedCrumbs.length - 1}
                      onClick={
                        index === collapsedCrumbs.length - 1
                          ? undefined
                          : () => setSelectedFolderId(crumb.id)
                      }>
                      {crumb.label}
                    </BreadcrumbItem>
                  ),
                )}
              </Breadcrumbs>
              {/*
                Badge has no outline variant, so GitHub's grey-ringed pill is
                a filled neutral one here. It is also read-only by contract,
                which suits a status word that is not a control.
              */}
              <Badge label="Public" variant="neutral" />
            </HStack>
          }
          ref={headerRef}
          endContent={
            /*
             * GitHub's three social counts. The leading slot on Button is
             * `icon`, not `startContent`, and `endContent` is documented to
             * take a Badge — which is exactly the attached-count shape.
             * Narrow drops the labels rather than wrapping the row.
             */
            <>
              {REPO_STATS.map(stat =>
                isNarrowHeader ? (
                  <IconButton
                    key={stat.label}
                    variant="secondary"
                    size="sm"
                    icon={<Icon icon={stat.icon} size="sm" />}
                    label={`${stat.label}: ${stat.value}`}
                    onClick={() => {}}
                  />
                ) : (
                  <Button
                    key={stat.label}
                    size="sm"
                    label={STAT_ACTION[stat.label]}
                    icon={<Icon icon={stat.icon} size="sm" />}
                    endContent={<Badge label={stat.value} />}
                  />
                ),
              )}
            </>
          }
        />
      }
      content={
        <LayoutContent padding={4}>
          {data.length === 0 ? (
            <EmptyState
              title="No matching files"
              description="No file or folder in this project matches your search."
              actions={
                <Button
                  label="Clear search"
                  variant="secondary"
                  onClick={() => setQuery('')}
                />
              }
            />
          ) : (
            <VStack gap={6} ref={bodyRef}>
              <BranchBar
                query={query}
                onQueryChange={setQuery}
                searchRef={searchRef}
                isSearching={isSearching}
                matchCount={matchCount}
                isNarrow={isNarrowBody}
                isSearchOpen={isSearchOpen}
                onSearchOpen={() => setIsSearchOpen(true)}
              />
              {/*
                The file list reads as one bounded object, the way GitHub
                boxes it. `padding={0}` matters twice: it lets rows reach the
                border so the zebra stripes are full-bleed inside the card,
                and it zeroes the container padding variables that Table's own
                edge-bleed subtracts from its margins.
              */}
              <Card padding={0}>
                <Table<RepoEntry>
                  data={visibleData}
                  columns={columns}
                  idKey="id"
                  density="compact"
                  // Rows are separated by tint, not by rule.
                  dividers="none"
                  isStriped
                  // Without this a narrowed column wraps mid-word and the row
                  // heights go ragged. It does not reach the tree column,
                  // which wraps by design — see the note at the top.
                  textOverflow="truncate"
                  plugins={{tree, sort, resize, keyboard}}
                />
              </Card>
              {readme != null && (
                <ReadmePanel
                  markdown={readme}
                  hasRepoTabs={selectedFolderId == null}
                />
              )}
              {/*
                Same panel, different slot: once the layout drops the sidebar
                the metadata is not discarded, it just stacks under the file
                list and its README the way it does on a phone.
              */}
              {!isSidebarInline && (
                <>
                  <Divider />
                  <AboutPanel />
                </>
              )}
            </VStack>
          )}
        </LayoutContent>
      }
    />
  );
}
