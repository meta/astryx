// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Work Item Detail',
  displayName: 'Work Item Detail',
  description:
    'Single work-item detail in two columns: a title with a status selector, a description, a subtask checklist with progress, an attachments block, and a comment and activity feed in the main column, plus a property rail with assignee, dates, labels, and linked items. The shape for any tracked item with children, properties, and a comment history — a task, ticket, issue, story, bug, card, request, or work item.',
  keywords: [
    'task',
    'ticket',
    'issue',
    'story',
    'bug',
    'card',
    'request',
    'work item',
  ],
  isReady: true,
  category: 'Content - Work Item Detail',
  icons: {
    ArrowLeftIcon: 'arrowLeft',
    BellIcon: 'notification',
    DocumentTextIcon: 'document',
    EyeIcon: 'eye',
    InformationCircleIcon: 'info',
    LinkIcon: 'link',
    PencilIcon: 'edit',
    PhotoIcon: 'image',
    ShareIcon: 'share',
    TrashIcon: 'delete',
    ViewColumnsIcon: 'viewColumns',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top page header with back link, breadcrumb, title, status selector, and watch, share, details actions.',
    },
    {
      name: 'description',
      kind: 'content',
      description:
        'First main-column section holding the work item\'s written description text.',
    },
    {
      name: 'subtasks',
      kind: 'list',
      description:
        'Main-column subtask checklist with a progress bar, each row showing due date and assignee.',
    },
    {
      name: 'attachments',
      kind: 'list',
      description:
        'Main-column list of attachment cards for links, images, and files, with an add button.',
    },
    {
      name: 'activity',
      kind: 'chat',
      description:
        'Bottom of the main column: comment and activity feed with a comment composer.',
    },
    {
      name: 'details',
      kind: 'panel',
      description:
        'End-side property rail listing status, assignee, dates, labels, watchers, and linked items.',
    },
  ],
};
