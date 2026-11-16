// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Welcome portal',
  displayName: 'Welcome portal',
  description:
    'Employee intranet home: a greeting and a search box that narrows the sectioned grids of tool, team, learning and policy cards in place (with an empty state when nothing matches), and a "Start here" onboarding checklist where ticking a step updates the progress bar and Continue jumps to the next open step. A sticky side rail holds starred favorites, a sample recently visited list, dated announcements and a help card. On narrow screens the destination sections become collapsible and the rail\'s blocks move into the main column.',
  keywords: [
    'intranet',
    'onboarding',
    'checklist',
    'new hire',
    'self-service',
    'favorites',
    'shortcuts',
    'announcements',
  ],
  isReady: false,
  icons: {
    BanknotesIcon: 'money',
    BookOpenIcon: 'book',
    BuildingOfficeIcon: 'building',
    CalendarDaysIcon: 'calendar',
    ChatBubbleLeftRightIcon: 'conversation',
    ClipboardDocumentCheckIcon: 'clipboard',
    ComputerDesktopIcon: 'desktop',
    InformationCircleIcon: 'info',
    LightBulbIcon: 'lightbulb',
    MagnifyingGlassIcon: 'search',
    ShieldCheckIcon: 'shield',
    StarIcon: 'star',
    UserGroupIcon: 'users',
    WrenchScrewdriverIcon: 'wrench',
  },
  category: 'Content - Portal',
};
