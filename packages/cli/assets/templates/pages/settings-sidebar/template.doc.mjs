// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Settings Panels',
  displayName: 'Settings Panels',
  description:
    'Preferences split into nav-switched panels: a persistent section list swaps the pane beside it, and rows edit in place rather than opening a separate form.',
  keywords: [
    'settings',
    'preferences',
    'configuration',
    'options',
    'account panels',
  ],
  isReady: true,
  category: 'Settings - Panels',
  icons: {
    ArrowLeftIcon: 'arrowLeft',
    BellIcon: 'notification',
    BriefcaseIcon: 'work',
    ChevronRightIcon: 'chevronRight',
    ComputerDesktopIcon: 'desktop',
    CreditCardIcon: 'creditCard',
    DocumentTextIcon: 'document',
    GlobeAltIcon: 'globe',
    LockClosedIcon: 'lock',
    PencilSquareIcon: 'compose',
    ShareIcon: 'share',
    ShieldCheckIcon: 'shield',
    UserIcon: 'user',
    WrenchScrewdriverIcon: 'wrench',
  },
  slots: [
    {
      name: 'nav',
      kind: 'navigation',
      description:
        'Start side panel with the Account settings heading and section list that swaps the content pane.',
    },
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the content pane: section heading, or the mobile back button beside the section title.',
    },
    {
      name: 'tabs',
      kind: 'navigation',
      description:
        'Tab list under the section heading switching Login and Shared access views.',
    },
    {
      name: 'settings',
      kind: 'form',
      description:
        'Content pane body: setting rows that edit in place, switch groups, and info rows under subheadings.',
    },
    {
      name: 'help',
      kind: 'content',
      description:
        'Info card below the settings rows explaining hidden, editable and shared account details.',
    },
  ],
};
