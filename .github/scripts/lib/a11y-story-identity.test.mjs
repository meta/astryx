// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import componentPackages from '../../../scripts/component-packages.cjs';
import {
  LEGACY_BASELINE_STORY_MIGRATIONS,
  legacyBaselineStoryKeys,
  ownerForA11yStory,
} from './a11y-story-identity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.github/a11y-baseline.json'), 'utf8'),
);
const baselineKeys = new Set(baseline.entries.map(entry => entry.key));

const EXPECTED_MIGRATIONS = [
  [
    'ClickableCard::Disabled',
    'core/ClickableCard',
    'a11y-button-pattern--clickable-card-disabled',
  ],
  [
    'CheckboxList::Disabled With Message',
    'core/CheckboxListItem',
    'a11y-checkbox-pattern--list-item-group-disabled-with-message',
  ],
  [
    'SelectableCard::Disabled',
    'core/SelectableCard',
    'a11y-checkbox-pattern--card-disabled',
  ],
  [
    'RadioList::Disabled With Message',
    'core/RadioList',
    'a11y-radio-group-pattern--radio-list-group-disabled-with-message',
  ],
  [
    'ProgressBar::Disabled',
    'core/ProgressBar',
    'a11y-progressbar--progress-bar-disabled',
  ],
  [
    'RadioList::Disabled',
    'core/RadioListItem',
    'a11y-radio-group-pattern--radio-list-option-group-disabled',
  ],
  [
    'RadioList::Disabled With Message',
    'core/RadioListItem',
    'a11y-radio-group-pattern--radio-list-option-disabled-with-message',
  ],
];

describe('a11y story identity migration', () => {
  it.each(EXPECTED_MIGRATIONS)(
    'maps legacy %s to canonical %s::%s',
    (legacyStory, owner, storyId) => {
      expect(ownerForA11yStory(storyId)).toBe(owner);
      expect(legacyBaselineStoryKeys(storyId)).toContain(legacyStory);
      expect(baselineKeys.has(`${legacyStory}::color-contrast`)).toBe(true);
      const [packageName, componentName] = owner.split('/');
      expect(
        componentPackages.packageHasPublicComponent(
          ROOT,
          packageName,
          componentName,
        ),
      ).toBe(true);
    },
  );

  it('routes every pattern binding prefix to a canonical public owner', () => {
    for (const [prefix, owner] of [
      ['a11y-button-pattern--button-default', 'core/Button'],
      ['a11y-button-pattern--icon-button-default', 'core/IconButton'],
      [
        'a11y-button-pattern--sidenav-collapse-icon',
        'core/SideNavCollapseButton',
      ],
      ['a11y-button-pattern--chat-send', 'core/ChatSendButton'],
      ['a11y-chatsendbutton-audit--chat-send-small', 'core/ChatSendButton'],
      ['a11y-chatsystemmessage-audit--states', 'core/ChatSystemMessage'],
      ['a11y-chatsystemmessage-audit--narrow', 'core/ChatSystemMessage'],
      [
        'a11y-chatsendbutton-audit--chat-send-stop-small',
        'core/ChatSendButton',
      ],
      ['a11y-checkbox-pattern--input-checked', 'core/CheckboxInput'],
      [
        'a11y-checkbox-pattern--menu-item-checked',
        'core/DropdownMenuCheckboxItem',
      ],
      [
        'a11y-radio-group-pattern--segmented-group-selected-ltr',
        'core/SegmentedControl',
      ],
      [
        'a11y-radio-group-pattern--segmented-option-disabled',
        'core/SegmentedControlItem',
      ],
      [
        'a11y-radio-group-pattern--menu-group-selected',
        'core/DropdownMenuRadioGroup',
      ],
      [
        'a11y-radio-group-pattern--menu-option-disabled',
        'core/DropdownMenuRadioItem',
      ],
    ]) {
      expect(ownerForA11yStory(prefix)).toBe(owner);
    }
  });

  it('contains only the seven proven legacy migrations', () => {
    expect(Object.keys(LEGACY_BASELINE_STORY_MIGRATIONS).sort()).toEqual(
      EXPECTED_MIGRATIONS.map(([, , storyId]) => storyId).sort(),
    );
    expect(
      legacyBaselineStoryKeys(
        'core-hooks-useresizable--structured-percent-sizing',
      ),
    ).toEqual([]);
  });
});
