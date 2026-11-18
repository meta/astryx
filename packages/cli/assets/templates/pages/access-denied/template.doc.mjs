// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Access Denied',
  displayName: 'Access Denied',
  description:
    "Permission wall shown when the signed-in account isn't allowed to open a resource. It shows a lock message that names the resource, the current account's avatar, name and email, an optional note to the owner, request-access and switch-account buttons that show demo messages until an app wires them, and a go-home link.",
  keywords: [
    '403 forbidden',
    'no permission',
    'permission required',
    'locked',
    'request access',
    'note to owner',
    'signed-in account',
  ],
  isReady: false,
  category: 'Status - Access Denied',
  icons: {
    LockClosedIcon: 'lock',
  },
};
