// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {Icon} from '@astryxdesign/core/Icon';
import {HomeIcon, SettingsIcon} from '@astryxdesign/template-icons';

export default function BreadcrumbsWithIcons() {
  return (
    <Breadcrumbs>
      <BreadcrumbItem href="/" startIcon={<Icon icon={HomeIcon} size="sm" />}>
        Home
      </BreadcrumbItem>
      <BreadcrumbItem
        href="/settings"
        startIcon={<Icon icon={SettingsIcon} size="sm" />}>
        Settings
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
    </Breadcrumbs>
  );
}
