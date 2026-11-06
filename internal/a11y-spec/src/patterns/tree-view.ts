// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tree-view.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Tree View pattern's structure, state, name, and keyboard requirements
 * @output TREE_VIEW_PATTERN — the reusable contract a composite tree binds to when it adopts Tree View (TreeList under component:TreeList AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by TreeList
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/treeview/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_2_4_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.4.3',
  name: 'Focus Order',
  level: 'A',
  url: `${UNDERSTANDING}/focus-order.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const apgReq = (requirement: string, anchor: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'treeview',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteraction';
const APG_TREE_ROLE = apgReq(
  'All tree nodes are contained in or owned by an element with role tree.',
  A,
);
const APG_TREE_NAME = apgReq(
  'The element with role tree has either a visible label referenced by aria-labelledby or a value specified for aria-label.',
  A,
);
const APG_ITEM_ROLE = apgReq(
  'Each element serving as a tree node has role treeitem.',
  A,
);
const APG_GROUP = apgReq(
  'Each parent node contains or owns an element with role group. Each child node is contained in or owned by an element with role group that is contained in or owned by the node that serves as the parent of that child.',
  A,
);
const APG_EXPANDED = apgReq(
  'Each element with role treeitem that serves as a parent node has aria-expanded set to false when the node is in a closed state and set to true when the node is in an open state. End nodes do not have the aria-expanded attribute.',
  A,
);
const APG_MULTISELECT = apgReq(
  'If the tree supports selection of more than one node, the element with role tree has aria-multiselectable set to true. Otherwise, aria-multiselectable is either set to false or the default value of false is implied.',
  A,
);
const APG_LEVEL = apgReq(
  'If the complete set of available nodes is not present in the DOM due to dynamic loading as the user moves focus in or scrolls the tree, each node has aria-level, aria-setsize, and aria-posinset specified.',
  A,
);
const APG_DOWN_UP = apgReq(
  'Down Arrow: Moves focus to the next node that is focusable without opening or closing a node. Up Arrow: Moves focus to the previous node that is focusable without opening or closing a node.',
  K,
);
const APG_RIGHT = apgReq(
  'Right arrow: When focus is on a closed node, opens the node; focus does not move. When focus is on a open node, moves focus to the first child node. When focus is on an end node, does nothing.',
  K,
);
const APG_LEFT = apgReq(
  'Left arrow: When focus is on an open node, closes the node. When focus is on a child node that is also either an end node or a closed node, moves focus to its parent node.',
  K,
);
const APG_HOME_END = apgReq(
  'Home: Moves focus to the first node in the tree without opening or closing a node. End: Moves focus to the last node in the tree that is focusable without opening a node.',
  K,
);
const TREELIST_AR1_LEVEL: AstryxRecord = {
  standard: 'astryx',
  id: 'component:TreeList',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/458a74c2a65a44c1fc7f76266e812e6d47213080/packages/core/src/TreeList/TreeList.spec.md#L155-L157',
  requirement:
    'every row is role="treeitem", named by its label and described by its description, aria-expanded when it has children, aria-selected when it is the selected row, aria-level for its depth, and aria-posinset/aria-setsize among its siblings.',
};
const TREELIST_AR1_ACTIVATION: AstryxRecord = {
  standard: 'astryx',
  id: 'component:TreeList',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/250fd9ac197381ec06900279efc31cbb03544ca9/packages/core/src/TreeList/TreeList.spec.md#L151-L161',
  requirement: 'Enter and Space activate the focused row.',
};
const APG_ENTER = apgReq(
  'Enter: activates a node, i.e., performs its default action. For parent nodes, one possible default action is to open or close the node.',
  K,
);
const APG_TYPEAHEAD = apgReq(
  'Type a character: focus moves to the next node with a name that starts with the typed character.',
  K,
);
const APG_FOCUS_ENTRY = apgReq(
  'When a single-select tree receives focus: if none of the nodes are selected before the tree receives focus, focus is set on the first node; if a node is selected before the tree receives focus, focus is set on the selected node.',
  K,
);
const TREELIST_AR1_RTL: AstryxRecord = {
  standard: 'astryx',
  id: 'component:TreeList',
  clause: 'AR1',
  url: 'https://github.com/meta/astryx/blob/250fd9ac197381ec06900279efc31cbb03544ca9/packages/core/src/TreeList/TreeList.spec.md#L151-L161',
  requirement:
    'ArrowRight expands a closed row, then moves into its first child, and ArrowLeft collapses an open row or moves to the parent — mirrored under RTL.',
};

/**
 * What a binding knows about one tree node (the subject) and the tree around
 * it. Relations: `tree` (the role=tree element), `before` and `after` (the
 * focusable controls around the tree in the page Tab order), and, when the
 * facts say they exist, `group` (the node's child group), `first-child`,
 * `parent`, `next`, `previous`, `first`, `last`, and `typeahead-target`.
 */
export interface TreeViewStateFacts {
  /** Whether this node has children (a parent node). */
  readonly hasChildren: boolean;
  /** Whether a parent node is open in this state. */
  readonly expanded: boolean;
  /** Whether this node can be operated (not disabled). */
  readonly disabled: boolean;
  /** Whether this node is the tree's one Tab stop. */
  readonly tabbable: boolean;
  /** 1-based depth of the node. */
  readonly level: number;
  /** 1-based position among its siblings and the sibling count. */
  readonly position: number;
  readonly setSize: number;
  /** Whether the binding supplies `next` / `previous` / `parent` relations. */
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly hasParent: boolean;
  /** Whether the tree is rendered right-to-left (Right and Left arrows swap). */
  readonly rtl: boolean;
  /** A character whose typeahead target the binding supplies, or null. */
  readonly typeaheadCharacter: string | null;
  /** Whether Enter on this node opens or closes it (a parent without its own action). */
  readonly enterToggles: boolean;
}

const ALWAYS = {
  condition: 'the binding designates a tree node',
  test: () => true,
};

async function authoredExpanded(subject: Subject): Promise<boolean | null> {
  const value = await subject.attribute('aria-expanded');
  return value === 'true' ? true : value === 'false' ? false : null;
}

async function focusOrFail(subject: Subject, forWhat: string): Promise<void> {
  await subject.focus();
  if (!(await subject.isFocused())) {
    throw new Error(
      `the tree node did not take focus, so ${forWhat} never reaches it`,
    );
  }
}

async function expectFocused(target: Subject, after: string): Promise<void> {
  if (!(await target.isFocused())) {
    throw new Error(`${after} did not move focus to the expected node`);
  }
}

function inlineKeys(rtl: boolean): {
  open: 'ArrowRight' | 'ArrowLeft';
  close: 'ArrowRight' | 'ArrowLeft';
} {
  return rtl
    ? {open: 'ArrowLeft', close: 'ArrowRight'}
    : {open: 'ArrowRight', close: 'ArrowLeft'};
}

async function restoreExpansion(
  harness: Harness,
  subject: Subject,
  wanted: boolean,
  key: 'ArrowRight' | 'ArrowLeft',
): Promise<void> {
  if ((await authoredExpanded(subject)) !== wanted) {
    await focusOrFail(subject, 'restoring the node');
    await harness.press(key);
  }
}

export const TREE_VIEW_PATTERN: PatternContract<TreeViewStateFacts> =
  definePattern<TreeViewStateFacts>({
    pattern: 'treeview',
    url: APG_URL,
    scope:
      "A tree's role and name; each node's treeitem role, name, expanded state, child group, and level/position; one Tab stop for the whole tree; Up/Down, Right/Left (mirrored under RTL), Home/End, Enter or Space activation and typeahead movement.",
    expectations: [
      {
        id: 'treeview.tree.role-and-name',
        outcome:
          'The browser exposes the tree as a named tree, so a user hears what the hierarchy is for.',
        sources: [WCAG_4_1_2, APG_TREE_ROLE, APG_TREE_NAME],
        covers: [
          '4.1.2-name-role-value',
          '2.4.6-headings-and-labels',
          'apg-interaction',
        ],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness}) => {
          const tree = await harness.related('tree');
          const {role, name} = await tree.computed();
          if (role !== 'tree') {
            throw new Error(
              `the browser exposes the container as ${role == null ? 'no role' : `"${role}"`}, not as a tree`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for the tree',
            );
          }
        },
      },
      {
        id: 'treeview.item.role-and-name',
        outcome:
          'The browser exposes the node as a named treeitem inside the tree.',
        sources: [WCAG_4_1_2, APG_ITEM_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const {role, name} = await subject.computed();
          if (role !== 'treeitem') {
            throw new Error(
              `the browser exposes this node as ${role == null ? 'no role' : `"${role}"`}, not as a treeitem`,
            );
          }
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this node',
            );
          }
          const tree = await harness.related('tree');
          if (!(await harness.containsSemantically(tree, subject))) {
            throw new Error(
              'the tree does not own this node in the accessibility tree',
            );
          }
        },
      },
      {
        id: 'treeview.item.expanded-state',
        outcome:
          'A parent node reports whether it is open; an end node carries no expanded state, so it is never mistaken for a parent.',
        sources: [WCAG_4_1_2, APG_EXPANDED],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const value = await subject.attribute('aria-expanded');
          if (!facts.hasChildren) {
            if (value != null) {
              throw new Error(`an end node carries aria-expanded="${value}"`);
            }
            return;
          }
          if (value !== String(facts.expanded)) {
            throw new Error(
              `the parent node is ${facts.expanded ? 'open' : 'closed'} but aria-expanded is ${value ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'treeview.item.children-in-group',
        outcome:
          "An open parent's children sit in a group the parent owns, so the hierarchy is programmatic.",
        sources: [WCAG_1_3_1, APG_GROUP],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: {
          condition: 'the node is an open parent',
          test: facts => facts.hasChildren && facts.expanded,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const group = await harness.related('group');
          const firstChild = await harness.related('first-child');
          if ((await group.attribute('role')) !== 'group') {
            throw new Error(
              "the parent's children are not in an element with role group",
            );
          }
          if (!(await harness.contains(subject, group))) {
            throw new Error(
              'the child group is not contained by its parent node',
            );
          }
          if (!(await harness.contains(group, firstChild))) {
            throw new Error("the first child is not inside its parent's group");
          }
        },
      },
      {
        id: 'treeview.item.level-and-position',
        outcome:
          'The node states its depth and its place among its siblings, so a user hears "level 2, 3 of 5" instead of guessing from indentation.',
        sources: [WCAG_1_3_1, APG_LEVEL, TREELIST_AR1_LEVEL],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const level = await subject.attribute('aria-level');
          const pos = await subject.attribute('aria-posinset');
          const size = await subject.attribute('aria-setsize');
          if (level !== String(facts.level)) {
            throw new Error(
              `aria-level is ${level ?? 'absent'}, not ${facts.level}`,
            );
          }
          if (
            pos !== String(facts.position) ||
            size !== String(facts.setSize)
          ) {
            throw new Error(
              `aria-posinset/aria-setsize are ${pos ?? 'absent'}/${size ?? 'absent'}, not ${facts.position}/${facts.setSize}`,
            );
          }
        },
      },
      {
        id: 'treeview.tree.no-multiselect-claim',
        outcome:
          'A tree where at most one node is selected does not claim multiple selection.',
        sources: [WCAG_4_1_2, APG_MULTISELECT],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness}) => {
          const tree = await harness.related('tree');
          if ((await tree.attribute('aria-multiselectable')) === 'true') {
            throw new Error('the tree claims aria-multiselectable="true"');
          }
        },
      },
      {
        id: 'treeview.focus.single-tab-stop',
        outcome:
          'The whole tree is one Tab stop: Tab from before it lands on its one tabbable node, and Tab again leaves the tree.',
        sources: [WCAG_2_1_1, WCAG_2_4_3, APG_FOCUS_ENTRY],
        covers: [
          '2.1.1-keyboard',
          '2.1.2-no-keyboard-trap',
          '2.4.3-focus-order',
          'apg-interaction',
        ],
        appliesWhen: {
          condition: "the node is the tree's Tab stop",
          test: facts => facts.tabbable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = await harness.related('before');
          const after = await harness.related('after');
          if ((await subject.attribute('tabindex')) !== '0') {
            throw new Error('the tabbable node does not carry tabindex="0"');
          }
          await before.focus();
          await harness.press('Tab');
          await expectFocused(subject, 'Tab from before the tree');
          await harness.press('Tab');
          await expectFocused(after, 'Tab from the tree');
        },
      },
      {
        id: 'treeview.keys.down-and-up',
        outcome:
          'ArrowDown moves to the next visible node and ArrowUp back, without opening or closing anything.',
        sources: [WCAG_2_1_1, APG_DOWN_UP],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the node can be operated and a visible node follows it',
          test: facts => !facts.disabled && facts.hasNext,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const next = await harness.related('next');
          const before = await authoredExpanded(subject);
          await focusOrFail(subject, 'ArrowDown');
          await harness.press('ArrowDown');
          await expectFocused(next, 'ArrowDown');
          await harness.press('ArrowUp');
          await expectFocused(subject, 'ArrowUp');
          if (
            facts.hasChildren &&
            (await authoredExpanded(subject)) !== before
          ) {
            throw new Error(
              "ArrowDown or ArrowUp changed the node's expanded state",
            );
          }
        },
      },
      {
        id: 'treeview.keys.open-close-and-descend',
        outcome:
          'On a closed parent the inline-forward arrow opens it without moving focus, pressed again moves into the first child, and the inline-back arrow returns to the parent and then closes it — mirrored under right-to-left.',
        sources: [WCAG_2_1_1, APG_RIGHT, APG_LEFT, TREELIST_AR1_RTL],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the node is a closed parent that can be operated',
          test: facts =>
            facts.hasChildren && !facts.expanded && !facts.disabled,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {open, close} = inlineKeys(facts.rtl);
          const firstChild = await harness.related('first-child');
          try {
            await focusOrFail(subject, open);
            await harness.press(open);
            if ((await authoredExpanded(subject)) !== true) {
              throw new Error(`${open} did not open the closed parent`);
            }
            await expectFocused(
              subject,
              `${open} on a closed parent (focus must stay)`,
            );
            await harness.press(open);
            await expectFocused(firstChild, `${open} on an open parent`);
            await harness.press(close);
            await expectFocused(subject, `${close} on a child`);
            await harness.press(close);
            if ((await authoredExpanded(subject)) !== false) {
              throw new Error(`${close} did not close the open parent`);
            }
          } finally {
            await restoreExpansion(harness, subject, false, close);
          }
        },
      },
      {
        id: 'treeview.keys.home-and-end',
        outcome:
          'Home moves to the first node and End to the last visible node, without opening or closing anything.',
        sources: [WCAG_2_1_1, APG_HOME_END],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the node can be operated',
          test: facts => !facts.disabled,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const first = await harness.related('first');
          const last = await harness.related('last');
          const before = await authoredExpanded(subject);
          await focusOrFail(subject, 'Home');
          await harness.press('End');
          await expectFocused(last, 'End');
          await harness.press('Home');
          await expectFocused(first, 'Home');
          if ((await authoredExpanded(subject)) !== before) {
            throw new Error("Home or End changed the node's expanded state");
          }
        },
      },
      {
        id: 'treeview.keys.enter-or-space-activates',
        outcome:
          "Enter and Space perform the node's default action: a parent without its own action opens on one and closes on the other.",
        sources: [WCAG_2_1_1, APG_ENTER, TREELIST_AR1_ACTIVATION],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'Enter or Space opens or closes this node and it can be operated',
          test: facts => facts.enterToggles && !facts.disabled,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const {close} = inlineKeys(facts.rtl);
          try {
            await focusOrFail(subject, 'Enter and Space');
            await harness.press('Enter');
            if ((await authoredExpanded(subject)) !== !facts.expanded) {
              throw new Error('Enter did not toggle the parent node');
            }
            await harness.press('Space');
            if ((await authoredExpanded(subject)) !== facts.expanded) {
              throw new Error('Space did not toggle the parent node back');
            }
          } finally {
            await restoreExpansion(harness, subject, facts.expanded, close);
          }
        },
      },
      {
        id: 'treeview.keys.typeahead',
        outcome:
          'Typing a character moves focus to the next node whose name starts with it.',
        sources: [WCAG_2_1_1, APG_TYPEAHEAD],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding names a typeahead character and its target, and the node can be operated',
          test: facts => facts.typeaheadCharacter != null && !facts.disabled,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const target = await harness.related('typeahead-target');
          await focusOrFail(subject, 'typing');
          await harness.typeText(subject, facts.typeaheadCharacter ?? '');
          await expectFocused(target, `typing "${facts.typeaheadCharacter}"`);
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'This contract owns tree structure and movement. Chevrons, row icons, and any image a caller places in a row are binding or caller composition.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's row tests and caller content review",
        reason:
          "This contract proves the tree/group/treeitem hierarchy and each node's level and position. Relationships inside a row (a description, start or end content) are the binding's and the caller's.",
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy:
          "the component's DOM-order tests and page-level reading-order review",
        reason:
          'Row order within the tree follows the data the caller supplies; where the tree sits in the page is composition.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "this contract's structure rows (every treeitem is a named navigation node) and source review of caller start and end content",
        reason:
          "A tree row is a navigation node, not an input that collects information about the user; the rows carry no form control of their own, and any control a caller places in start or end content is the caller's to name for autofill.",
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's selected, focused and disabled state tests plus rendered review",
        reason:
          'Selected, focused and disabled cues are paint results owned by the binding and theme; this contract proves the programmatic states.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'Row text contrast is a paint outcome owned by the binding and theme.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the focus indicator, guides and chevrons',
        reason:
          'Focus indicator, guide line and chevron contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          "This contract encodes the tree's keyboard model: one Tab stop, Up/Down, Right/Left, Home/End, Enter or Space and typeahead. Other page keyboard paths remain with the composition.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the composing page',
        verifiedBy:
          'page-level keyboard review; this contract proves Tab leaves the tree after its one stop',
        reason:
          'The single-Tab-stop expectation shows Tab exits the tree; other trap sources are composition.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A tree rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level focus-order review; this contract proves the one Tab stop and where the tree keys move focus',
        reason:
          "The tree's place among surrounding controls depends on composition.",
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy:
          'LINK_PATTERN for rows that navigate, plus caller content review',
        reason:
          "A row with an address renders its own link; the link's purpose is that pattern's and the caller's.",
      },
      '2.4.6-headings-and-labels': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'This contract proves the tree has a name; whether that name and the node labels are descriptive is caller content.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's focus-outline tests and rendered focus review",
        reason:
          "The focused row's indicator is a paint result owned by the binding and theme.",
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level layout review',
        reason:
          'Whether another surface covers the focused row depends on composition.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component',
        verifiedBy: "the component's row press tests",
        reason:
          "A tree node activates on click, not on pointer-down; press cancellation is the row control's generic behavior, outside this keyboard-model contract.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's accessible-name tests",
        reason:
          "Whether a row's accessible name contains its visible label is the binding's row-naming requirement.",
      },
      '2.5.8-target-size': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over rows and chevrons",
        reason:
          'Row and chevron hit areas are geometry owned by the binding and theme.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A tree owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy:
          "integration review of what a node's own action does on Enter or click",
        reason:
          "Moving focus and opening a node are the tree's own keyboard model; any further context change is the caller's action.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing page',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated row labels',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated tree.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and caller content',
        verifiedBy:
          "this contract's structure rows (every treeitem is a named navigation node) and source review of caller start and end content",
        reason:
          'A tree row collects no input of its own, so there is no entry to be in error; a control a caller places in start or end content reports its own errors.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'A tree row collects no input that needs instructions; this contract proves rows are named, and the caller supplies any guidance around the tree.',
      },
      '4.1.2-name-role-value': {
        owner: 'the link and button patterns, and the binding component',
        verifiedBy:
          'LINK_PATTERN and BUTTON_PATTERN for the controls a row renders, plus binding-local name tests',
        reason:
          "This contract encodes the tree and node roles and names, the expanded state, and the multiselect claim. A row's inner link or button keeps its own pattern.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken or braille output',
        reason:
          'Opening a node or moving focus is not a status-message contract, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner: "the binding component's record",
        verifiedBy:
          'component:TreeList AR1 and DEC-2, which adopt the model and name what is left out',
        reason:
          "This contract encodes the Tree View structure and keyboard model. Selection keyboard (Shift/Control combinations) and the optional * key are not adopted by the binding's record; Space is activation here, not selection.",
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's forced-colors tests plus rendered Windows High Contrast review",
        reason:
          'Forced-colors output is a paint result owned by the binding and theme.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion source tests and rendered motion review",
        reason:
          'Expand and collapse motion is binding-specific paint over time and is not part of tree semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the repository i18n catalog check and source review of authored labels',
        reason:
          'The tree contract introduces no string; the tree name and row text come from the binding or caller.',
      },
    },
  });
