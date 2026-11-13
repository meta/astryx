// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BreadcrumbItem',
  name: 'BreadcrumbItem — Basic',
  displayName: 'BreadcrumbItem — Basic',
  description:
    'Breadcrumb links inside a Breadcrumbs trail. Ancestor pages get an href; mark the last item with isCurrent to render it as plain text for the current page.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Breadcrumbs', 'BreadcrumbItem'],
  fits: ['navigation', 'header'],
};
