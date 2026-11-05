// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {HomeIcon} from '@heroicons/react/24/outline';

export default function BreadcrumbItemShowcase() {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          With start icon
        </Text>
        <Breadcrumbs>
          <BreadcrumbItem
            href="/"
            startIcon={<Icon icon={HomeIcon} size="sm" />}>
            Home
          </BreadcrumbItem>
          <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Components</BreadcrumbItem>
        </Breadcrumbs>
      </VStack>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          As current page (non-link)
        </Text>
        <Breadcrumbs>
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbItem href="/settings">Settings</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
        </Breadcrumbs>
      </VStack>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          Supporting variant
        </Text>
        <Breadcrumbs variant="supporting">
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
          <BreadcrumbItem href="/admin/users">Users</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Permissions</BreadcrumbItem>
        </Breadcrumbs>
      </VStack>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          With onClick handler (no href)
        </Text>
        <Breadcrumbs>
          <BreadcrumbItem onClick={() => {}}>Dashboard</BreadcrumbItem>
          <BreadcrumbItem onClick={() => {}}>Projects</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Project Alpha</BreadcrumbItem>
        </Breadcrumbs>
      </VStack>
    </VStack>
  );
}
