// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeList.a11y.states.ts
 * @input TreeList's representative tree-view states and the facts TREE_VIEW_PATTERN reads
 * @output TREE_LIST_BINDING_STATES, the shared item data, and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:TreeList AR1)
 */

import type {TreeViewStateFacts} from '@astryxdesign/a11y-spec';

export interface TreeListBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** `data-tree-id` of the subject row. */
  readonly subject: string;
  /** `data-tree-id` of each relation row the facts say exists. */
  readonly relations: Readonly<
    Partial<
      Record<
        'first-child' | 'parent' | 'next' | 'previous' | 'typeahead-target',
        string
      >
    >
  > & {readonly first: string; readonly last: string};
  readonly facts: TreeViewStateFacts;
  /** Which parent rows start expanded. */
  readonly expanded: ReadonlyArray<string>;
  /** Which rows are disabled. */
  readonly disabled?: ReadonlyArray<string>;
  readonly direction?: 'ltr' | 'rtl';
}

export const TREE_LIST_LABEL = 'Files';

function facts(
  overrides: Partial<TreeViewStateFacts> = {},
): TreeViewStateFacts {
  return {
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
  };
}

const story = (id: string) => `a11y-treelist-tree-view--${id}`;

export const TREE_LIST_BINDING_STATES = [
  {
    id: 'closed-parent-tab-stop',
    summary: "the closed Documents parent, the tree's one Tab stop",
    storyId: story('closed-parent-tab-stop'),
    subject: 'docs',
    relations: {
      next: 'photos',
      first: 'docs',
      last: 'trash',
      'first-child': 'annual',
      'typeahead-target': 'trash',
    },
    facts: facts(),
    expanded: [],
  },
  {
    id: 'open-parent-tab-stop',
    summary: 'the open Documents parent with its child group',
    storyId: story('open-parent-tab-stop'),
    subject: 'docs',
    relations: {
      next: 'annual',
      first: 'docs',
      last: 'trash',
      'first-child': 'annual',
      'typeahead-target': 'trash',
    },
    facts: facts({expanded: true}),
    expanded: ['docs'],
  },
  {
    id: 'end-node',
    summary: 'the Photos end node, which is not the Tab stop',
    storyId: story('end-node'),
    subject: 'photos',
    relations: {
      next: 'trash',
      previous: 'docs',
      first: 'docs',
      last: 'trash',
      'typeahead-target': 'docs',
    },
    facts: facts({
      hasChildren: false,
      tabbable: false,
      position: 2,
      hasPrevious: true,
      typeaheadCharacter: 'd',
      enterToggles: false,
    }),
    expanded: [],
  },
  {
    id: 'closed-parent-rtl',
    summary: 'the closed Documents parent in a right-to-left tree',
    storyId: story('closed-parent-rtl'),
    subject: 'docs',
    relations: {
      next: 'photos',
      first: 'docs',
      last: 'trash',
      'first-child': 'annual',
      'typeahead-target': 'trash',
    },
    facts: facts({rtl: true}),
    expanded: [],
    direction: 'rtl',
  },
  {
    id: 'disabled-end-node',
    summary:
      'the disabled Trash end node: exposed and positioned, not operable',
    storyId: story('disabled-end-node'),
    subject: 'trash',
    relations: {previous: 'photos', first: 'docs', last: 'trash'},
    facts: facts({
      hasChildren: false,
      disabled: true,
      tabbable: false,
      position: 3,
      hasNext: false,
      hasPrevious: true,
      typeaheadCharacter: null,
      enterToggles: false,
    }),
    expanded: [],
    disabled: ['trash'],
  },
] as const satisfies ReadonlyArray<TreeListBindingState>;

export const TREE_LIST_EXCLUSIONS = [
  {
    id: 'row-name-composition',
    owner: 'component:TreeList AR1 and TreeList.test.tsx',
    reason:
      "This binding proves each row has a treeitem role and a non-empty name. Which text makes up that name — the label alone, without the chevron toggle, description, or start and end content — is the record's row-naming requirement, proven by TreeList's own name tests and browser evidence rather than by the shared pattern.",
  },
  {
    id: 'selection-keyboard',
    owner: 'component:TreeList AR1 and DEC-2',
    reason:
      'Selection is caller-owned (isSelected) with at most one row selected; the tree adopts no selection keyboard (Shift or Control combinations; Space is activation, covered by the contract) and not the optional * key, so the contract asserts only that the tree makes no multiselect claim.',
  },
] as const;
