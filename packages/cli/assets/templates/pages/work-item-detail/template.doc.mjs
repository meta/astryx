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
};
