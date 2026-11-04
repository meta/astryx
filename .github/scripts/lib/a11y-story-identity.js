// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

/**
 * @file Canonical owners and audited legacy-baseline aliases for a11y contract stories.
 * @input Stable Storybook IDs from checked-in a11y inventories, audit fixtures, and Lab Chat additions.
 * @output Canonical package owners plus exact prior baseline story identities.
 * @position Migration boundary between reusable contract fixtures and the a11y baseline.
 */

const A11Y_STORY_OWNER_PREFIXES = Object.freeze([
  ['lab-chatadditions--', 'lab/Chat'],
  ['a11y-button-pattern--icon-button-', 'core/IconButton'],
  ['a11y-button-pattern--clickable-card-', 'core/ClickableCard'],
  ['a11y-button-pattern--sidenav-collapse-', 'core/SideNavCollapseButton'],
  ['a11y-button-pattern--chat-send', 'core/ChatSendButton'],
  ['a11y-chatsendbutton-audit--', 'core/ChatSendButton'],
  ['a11y-chatsystemmessage-audit--', 'core/ChatSystemMessage'],
  ['a11y-button-pattern--button-', 'core/Button'],
  ['a11y-checkbox-pattern--list-item-', 'core/CheckboxListItem'],
  ['a11y-checkbox-pattern--menu-item-', 'core/DropdownMenuCheckboxItem'],
  ['a11y-checkbox-pattern--card-', 'core/SelectableCard'],
  ['a11y-checkbox-pattern--input-', 'core/CheckboxInput'],
  ['a11y-radio-group-pattern--radio-list-group-', 'core/RadioList'],
  ['a11y-radio-group-pattern--radio-list-option-', 'core/RadioListItem'],
  ['a11y-radio-group-pattern--segmented-group-', 'core/SegmentedControl'],
  ['a11y-radio-group-pattern--segmented-option-', 'core/SegmentedControlItem'],
  ['a11y-radio-group-pattern--menu-group-', 'core/DropdownMenuRadioGroup'],
  ['a11y-radio-group-pattern--menu-option-', 'core/DropdownMenuRadioItem'],
]);

// These contract fixtures render the same disabled states already represented by
// the named legacy baseline stories. The mapping migrates identity only; it does
// not create a baseline for a rule or state that was not already recorded.
const LEGACY_BASELINE_STORY_MIGRATIONS = Object.freeze({
  'a11y-button-pattern--clickable-card-disabled': Object.freeze({
    owner: 'core/ClickableCard',
    legacyStoryKeys: Object.freeze(['ClickableCard::Disabled']),
  }),
  'a11y-checkbox-pattern--list-item-group-disabled-with-message': Object.freeze({
    owner: 'core/CheckboxListItem',
    legacyStoryKeys: Object.freeze(['CheckboxList::Disabled With Message']),
  }),
  'a11y-checkbox-pattern--card-disabled': Object.freeze({
    owner: 'core/SelectableCard',
    legacyStoryKeys: Object.freeze(['SelectableCard::Disabled']),
  }),
  'a11y-radio-group-pattern--radio-list-group-disabled-with-message': Object.freeze({
    owner: 'core/RadioList',
    legacyStoryKeys: Object.freeze(['RadioList::Disabled With Message']),
  }),
  'a11y-radio-group-pattern--radio-list-option-group-disabled': Object.freeze({
    owner: 'core/RadioListItem',
    legacyStoryKeys: Object.freeze(['RadioList::Disabled']),
  }),
  'a11y-radio-group-pattern--radio-list-option-disabled-with-message': Object.freeze({
    owner: 'core/RadioListItem',
    legacyStoryKeys: Object.freeze(['RadioList::Disabled With Message']),
  }),
  'a11y-progressbar--progress-bar-disabled': Object.freeze({
    owner: 'core/ProgressBar',
    legacyStoryKeys: Object.freeze(['ProgressBar::Disabled']),
  }),
});

function ownerForA11yStory(storyId) {
  const migration = LEGACY_BASELINE_STORY_MIGRATIONS[storyId];
  if (migration) return migration.owner;
  return A11Y_STORY_OWNER_PREFIXES.find(([prefix]) =>
    storyId.startsWith(prefix),
  )?.[1] ?? null;
}

function legacyBaselineStoryKeys(storyId) {
  return LEGACY_BASELINE_STORY_MIGRATIONS[storyId]?.legacyStoryKeys ?? [];
}

module.exports = {
  A11Y_STORY_OWNER_PREFIXES,
  LEGACY_BASELINE_STORY_MIGRATIONS,
  ownerForA11yStory,
  legacyBaselineStoryKeys,
};
