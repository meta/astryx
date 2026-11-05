// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tree-view.fixtures.ts
 * @input Plain HTML trees (one script implements the APG keyboard model; the DOM lane never runs it), conforming and deliberately violating
 * @output TREE_VIEW_FIXTURES, the subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for tree-view.jsdom.test.ts and tree-view.chromium.spec.ts
 */

import type {TreeViewStateFacts} from './tree-view';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const RELATION_SELECTORS = {
  tree: '#tree',
  before: '#before',
  after: '#after',
  group: '#group-docs',
  'first-child': '#node-annual',
  parent: '#node-docs',
  next: '[data-next]',
  previous: '[data-previous]',
  first: '#node-docs',
  last: '#node-trash',
  'typeahead-target': '[data-typeahead-target]',
} as const;

export interface TreeViewFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: TreeViewStateFacts;
  readonly html: string;
}

/**
 * The tree: Documents (parent, closed unless `docsOpen`) › Annual report, Budget;
 * Photos (end node); Trash (end node). The subject is Documents unless
 * `subject` says otherwise. `data-next` / `data-previous` mark the subject's
 * neighbours in visible order.
 */
const SCRIPT = `<script>
(() => {
  const tree = document.getElementById('tree');
  const items = () => Array.from(tree.querySelectorAll('[role="treeitem"]')).filter(el => {
    let p = el.parentElement;
    while (p && p !== tree) { if (p.hidden) return false; p = p.parentElement; }
    return true;
  });
  const focusItem = el => { for (const i of items()) i.tabIndex = -1; el.tabIndex = 0; el.focus(); };
  const level = el => Number(el.getAttribute('aria-level'));
  const toggle = el => { const open = el.getAttribute('aria-expanded') === 'true'; el.setAttribute('aria-expanded', String(!open)); const g = el.querySelector('[role="group"]'); if (g) g.hidden = open; };
  const rtl = tree.getAttribute('dir') === 'rtl';
  tree.addEventListener('keydown', e => {
    const list = items(); const cur = e.target.closest('[role="treeitem"]'); const i = list.indexOf(cur); if (i < 0) return;
    let key = e.key;
    if (rtl && (key === 'ArrowLeft' || key === 'ArrowRight')) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (window.__treeNoRtl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) key = e.key;
    switch (key) {
      case 'ArrowDown': e.preventDefault(); if (list[i+1]) focusItem(list[i+1]); break;
      case 'ArrowUp': e.preventDefault(); if (list[i-1]) focusItem(list[i-1]); break;
      case 'ArrowRight': e.preventDefault(); if (cur.getAttribute('aria-expanded') === 'false') { toggle(cur); if (window.__treeMoveOnOpen) focusItem(items()[i+1]); } else if (cur.getAttribute('aria-expanded') === 'true') { const n = items()[i+1]; if (n && level(n) > level(cur)) focusItem(n); } break;
      case 'ArrowLeft': e.preventDefault(); if (cur.getAttribute('aria-expanded') === 'true') toggle(cur); else { for (let j = i-1; j >= 0; j--) if (level(list[j]) < level(cur)) { focusItem(list[j]); break; } } break;
      case 'Home': e.preventDefault(); focusItem(list[0]); break;
      case 'End': e.preventDefault(); if (window.__treeEndOpens && cur.getAttribute('aria-expanded') === 'false') toggle(cur); focusItem(window.__treeEndIsFirst ? list[0] : list[list.length-1]); break;
      case 'Enter': case ' ': e.preventDefault(); if (cur.hasAttribute('aria-expanded') && !window.__treeEnterInert) toggle(cur); break;
      default:
        if (key.length === 1 && !window.__treeNoTypeahead) { const q = key.toLowerCase(); const ordered = list.slice(i+1).concat(list.slice(0, i+1)); const m = ordered.find(el => (el.querySelector('.label')?.textContent ?? '').trim().toLowerCase().startsWith(q)); if (m) { e.preventDefault(); focusItem(m); } }
    }
  });
})();
</script>`;

function node(
  id: string,
  label: string,
  {
    level,
    pos,
    size,
    subject = false,
    next = false,
    previous = false,
    typeaheadTarget = false,
    tabbable = false,
    expanded,
    children = '',
    role = 'treeitem',
    groupRole = 'group',
    hidden = false,
  }: {
    level: number;
    pos: number;
    size: number;
    subject?: boolean;
    next?: boolean;
    previous?: boolean;
    typeaheadTarget?: boolean;
    tabbable?: boolean;
    expanded?: boolean | null;
    children?: string;
    role?: string;
    groupRole?: string;
    hidden?: boolean;
  },
): string {
  return `<li id="node-${id}" role="${role}"${subject ? ` ${SUBJECT_ATTRIBUTE}` : ''}${next ? ' data-next' : ''}${previous ? ' data-previous' : ''}${typeaheadTarget ? ' data-typeahead-target' : ''} tabindex="${tabbable ? 0 : -1}" aria-level="${level}" aria-posinset="${pos}" aria-setsize="${size}"${expanded == null ? '' : ` aria-expanded="${expanded}"`}><span class="label">${label}</span>${children === '' ? '' : `<ul id="group-${id}" role="${groupRole}"${hidden ? ' hidden' : ''}>${children}</ul>`}</li>`;
}

type SubjectId = 'docs' | 'photos' | 'annual';

function tree({
  subject = 'docs',
  docsOpen = false,
  treeRole = 'tree',
  treeLabel = 'Files',
  groupRole = 'group',
  docsRole = 'treeitem',
  docsExpandedAttr = true,
  photosExpandedAttr = false,
  docsLevel = 1,
  multiselectable = false,
  twoTabStops = false,
  rtl = false,
}: {
  subject?: SubjectId;
  docsOpen?: boolean;
  treeRole?: string;
  treeLabel?: string | null;
  groupRole?: string;
  docsRole?: string;
  docsExpandedAttr?: boolean;
  photosExpandedAttr?: boolean;
  docsLevel?: number;
  multiselectable?: boolean;
  twoTabStops?: boolean;
  rtl?: boolean;
} = {}): string {
  // Visible order: docs, (annual, budget when open), photos, trash.
  const nextOf: Record<SubjectId, string> = {
    docs: docsOpen ? 'annual' : 'photos',
    annual: 'budget',
    photos: 'trash',
  };
  const previousOf: Record<SubjectId, string | null> = {
    docs: null,
    annual: 'docs',
    photos: docsOpen ? 'budget' : 'docs',
  };
  // Typeahead: 't' from Documents reaches Trash; 'd' from Photos wraps to
  // Documents.
  const typeaheadTargetOf: Record<SubjectId, string> = {
    docs: 'trash',
    annual: 'trash',
    photos: 'docs',
  };
  const is = (id: string) => ({
    subject: subject === id,
    next: nextOf[subject] === id,
    previous: previousOf[subject] === id,
    typeaheadTarget: typeaheadTargetOf[subject] === id,
  });
  const tabStop: SubjectId = subject === 'photos' ? 'photos' : 'docs';
  const tabbable = (id: string) => id === tabStop || twoTabStops;
  const children =
    node('annual', 'Annual report', {
      level: 2,
      pos: 1,
      size: 2,
      ...is('annual'),
    }) + node('budget', 'Budget', {level: 2, pos: 2, size: 2, ...is('budget')});
  const docs = node('docs', 'Documents', {
    level: docsLevel,
    pos: 1,
    size: 3,
    ...is('docs'),
    tabbable: tabbable('docs'),
    expanded: docsExpandedAttr ? docsOpen : null,
    children,
    groupRole,
    hidden: !docsOpen,
    role: docsRole,
  });
  const photos = node('photos', 'Photos', {
    level: 1,
    pos: 2,
    size: 3,
    ...is('photos'),
    tabbable: tabbable('photos'),
    expanded: photosExpandedAttr ? false : null,
  });
  const trash = node('trash', 'Trash', {
    level: 1,
    pos: 3,
    size: 3,
    ...is('trash'),
  });
  return `<button type="button" id="before">Before</button><ul id="tree" role="${treeRole}"${treeLabel == null ? '' : ` aria-label="${treeLabel}"`}${multiselectable ? ' aria-multiselectable="true"' : ''}${rtl ? ' dir="rtl"' : ''}>${docs}${photos}${trash}</ul><button type="button" id="after">After</button>${SCRIPT}`;
}

const facts = (
  overrides: Partial<TreeViewStateFacts> = {},
): TreeViewStateFacts => ({
  hasChildren: true,
  expanded: false,
  disabled: false,
  tabbable: true,
  level: 1,
  position: 1,
  setSize: 3,
  hasNext: true,
  hasPrevious: false,
  hasParent: false,
  rtl: false,
  typeaheadCharacter: 't',
  enterToggles: true,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const TREE_VIEW_FIXTURES: readonly TreeViewFixture[] = [
  {
    id: 'conforming-closed-parent',
    summary: "the closed Documents parent, the tree's Tab stop",
    facts: facts(),
    html: tree(),
  },
  {
    id: 'conforming-open-parent',
    summary: 'the open Documents parent with its child group',
    facts: facts({expanded: true}),
    html: tree({docsOpen: true}),
  },
  {
    id: 'conforming-end-node',
    summary: 'the Photos end node, not the Tab stop',
    facts: facts({
      hasChildren: false,
      expanded: false,
      tabbable: false,
      position: 2,
      hasNext: true,
      hasPrevious: true,
      typeaheadCharacter: 'd',
      enterToggles: false,
    }),
    html: tree({subject: 'photos'}),
  },
  {
    id: 'conforming-rtl-closed-parent',
    summary: 'the closed Documents parent in a right-to-left tree',
    facts: facts({rtl: true}),
    html: tree({rtl: true}),
  },
  {
    id: 'violating-tree-role',
    summary: 'a container that is a list, not a tree',
    facts: facts(),
    html: tree({treeRole: 'list'}),
  },
  {
    id: 'violating-tree-name',
    summary: 'a tree with no accessible name',
    facts: facts(),
    html: tree({treeLabel: null}),
  },
  {
    id: 'violating-item-role',
    summary: 'a node that is a listitem, not a treeitem',
    facts: facts(),
    html: tree({docsRole: 'listitem'}),
  },
  {
    id: 'violating-parent-without-expanded',
    summary: 'a parent node with no aria-expanded',
    facts: facts(),
    html: tree({docsExpandedAttr: false}),
  },
  {
    id: 'violating-end-node-expanded',
    summary: 'an end node that claims aria-expanded',
    facts: facts({
      hasChildren: false,
      expanded: false,
      tabbable: false,
      position: 2,
      hasPrevious: true,
      typeaheadCharacter: 'd',
      enterToggles: false,
    }),
    html: tree({subject: 'photos', photosExpandedAttr: true}),
  },
  {
    id: 'violating-children-not-grouped',
    summary: 'an open parent whose children sit in a plain list, not a group',
    facts: facts({expanded: true}),
    html: tree({docsOpen: true, groupRole: 'list'}),
  },
  {
    id: 'violating-wrong-level',
    summary: 'a root node that claims level 2',
    facts: facts(),
    html: tree({docsLevel: 2}),
  },
  {
    id: 'violating-multiselect-claim',
    summary: 'a single-selection tree that claims aria-multiselectable',
    facts: facts(),
    html: tree({multiselectable: true}),
  },
  {
    id: 'violating-two-tab-stops',
    summary: 'a tree with two tabbable nodes',
    facts: facts(),
    html: tree({twoTabStops: true}),
  },
  {
    id: 'violating-no-down-up',
    summary: 'a tree whose Down and Up arrows do nothing',
    facts: facts(),
    html: tree().replace(
      "case 'ArrowDown': e.preventDefault(); if (list[i+1]) focusItem(list[i+1]); break;",
      "case 'ArrowDown': e.preventDefault(); break;",
    ),
  },
  {
    id: 'violating-open-moves-focus',
    summary: 'a tree whose Right arrow opens a parent and moves focus at once',
    facts: facts(),
    html: flag('__treeMoveOnOpen', tree()),
  },
  {
    id: 'violating-rtl-not-mirrored',
    summary: 'a right-to-left tree whose Right and Left arrows are not swapped',
    facts: facts({rtl: true}),
    html: flag('__treeNoRtl', tree({rtl: true})),
  },
  {
    id: 'violating-end-key',
    summary: 'a tree whose End key goes to the first node',
    facts: facts(),
    html: flag('__treeEndIsFirst', tree()),
  },
  {
    id: 'violating-end-opens',
    summary: 'a tree whose End key also opens the focused parent',
    facts: facts(),
    html: flag('__treeEndOpens', tree()),
  },
  {
    id: 'violating-enter-inert',
    summary: 'a parent node that neither Enter nor Space opens',
    facts: facts(),
    html: flag('__treeEnterInert', tree()),
  },
  {
    id: 'violating-no-typeahead',
    summary: 'a tree with no typeahead',
    facts: facts(),
    html: flag('__treeNoTypeahead', tree()),
  },
];

export function fixture(id: string): TreeViewFixture {
  const found = TREE_VIEW_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown tree-view fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = TREE_VIEW_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const TREE_VIEW_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'treeview.tree.role-and-name': [
      'violating-tree-role',
      'violating-tree-name',
    ],
    'treeview.item.role-and-name': ['violating-item-role'],
    'treeview.item.expanded-state': [
      'violating-parent-without-expanded',
      'violating-end-node-expanded',
    ],
    'treeview.item.children-in-group': ['violating-children-not-grouped'],
    'treeview.item.level-and-position': ['violating-wrong-level'],
    'treeview.tree.no-multiselect-claim': ['violating-multiselect-claim'],
    'treeview.focus.single-tab-stop': ['violating-two-tab-stops'],
    'treeview.keys.down-and-up': ['violating-no-down-up'],
    'treeview.keys.open-close-and-descend': [
      'violating-open-moves-focus',
      'violating-rtl-not-mirrored',
    ],
    'treeview.keys.home-and-end': ['violating-end-key', 'violating-end-opens'],
    'treeview.keys.enter-or-space-activates': ['violating-enter-inert'],
    'treeview.keys.typeahead': ['violating-no-typeahead'],
  };
