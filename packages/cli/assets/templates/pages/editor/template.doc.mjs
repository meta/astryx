// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Page Editor',
  displayName: 'Page Editor',
  description:
    'Three-pane authoring workspace: a source palette on one flank, a live canvas in the middle, and an inspector that retargets to whatever is selected. Drag and drop to reorder, edit to see it render immediately.',
  keywords: [
    'builder',
    'composer',
    'drag and drop',
    'page builder',
    'wysiwyg editor',
  ],
  isReady: true,
  category: 'Tools - Page Editor',
  icons: {
    AdjustmentsHorizontalIcon: 'adjustments',
    BanknotesIcon: 'money',
    ChatBubbleLeftIcon: 'message',
    ChevronDownIcon: 'chevronDown',
    ChevronUpIcon: 'chevronUp',
    ComputerDesktopIcon: 'desktop',
    CursorArrowRaysIcon: 'click',
    DevicePhoneMobileIcon: 'mobile',
    DeviceTabletIcon: 'tablet',
    DocumentTextIcon: 'document',
    EllipsisHorizontalIcon: 'moreHorizontal',
    EyeIcon: 'eye',
    LockClosedIcon: 'lock',
    MegaphoneIcon: 'announcement',
    PhotoIcon: 'image',
    PlayCircleIcon: 'play',
    PlusCircleIcon: 'add',
    ShoppingBagIcon: 'shoppingBag',
    ShoppingCartIcon: 'cart',
    SparklesIcon: 'sparkles',
    Squares2X2Icon: 'gridView',
    TrashIcon: 'delete',
    ViewColumnsIcon: 'viewColumns',
    XMarkIcon: 'close',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the start sidebar panel: the page title heading, which can be edited inline.',
    },
    {
      name: 'toolbar',
      kind: 'toolbar',
      description:
        'Sidebar Toolbar under the title: viewport SegmentedControl at start, Preview and Publish buttons at end.',
    },
    {
      name: 'tabs',
      kind: 'navigation',
      description:
        'Sidebar TabList under the toolbar that switches between the Blocks and Properties views.',
    },
    {
      name: 'inspector',
      kind: 'panel',
      description:
        'Sidebar Section under the tabs: Add Block and Layers lists, or the selected block\'s properties form.',
    },
    {
      name: 'canvas',
      kind: 'main',
      description:
        'LayoutContent canvas: stacked block previews sized to the chosen viewport width, or an empty state.',
    },
  ],
};
