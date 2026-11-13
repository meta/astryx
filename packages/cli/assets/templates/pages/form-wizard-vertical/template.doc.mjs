// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Vertical Wizard',
  displayName: 'Vertical Wizard',
  description:
    'Multi-step wizard with the steps in a fixed left rail that stays visible while the form scrolls, plus a side panel whose guidance follows the focused field. Suits long or unequal steps carrying uploads, previews, and dense review metadata. As width tightens the guidance drops first, then the rail rotates into a horizontal stepper above the form.',
  isReady: true,
  category: 'Form - Wizard Vertical',
  icons: {
    BookOpenIcon: 'book',
    BuildingLibraryIcon: 'bank',
    CalendarIcon: 'calendar',
    CheckBadgeIcon: 'checkDouble',
    CurrencyDollarIcon: 'money',
    ExclamationTriangleIcon: 'warning',
    GlobeAltIcon: 'globe',
    LanguageIcon: 'language',
    RectangleStackIcon: 'collection',
    TagIcon: 'tag',
    UserIcon: 'user',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top band in LayoutHeader with the flow title, ghost and secondary actions, and the horizontal stepper at narrow widths.',
    },
    {
      name: 'steps',
      kind: 'navigation',
      description:
        'Start LayoutPanel rail holding the vertical Stepper with each step\'s label and description.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Centered LayoutContent column with the current step\'s heading and its form fields or review summary.',
    },
    {
      name: 'guidance',
      kind: 'panel',
      description:
        'End complementary LayoutPanel with help bullets for the focused field or, failing that, the current step.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'Full-width LayoutFooter with Back and Continue or Submit buttons aligned under the form column.',
    },
  ],
};
