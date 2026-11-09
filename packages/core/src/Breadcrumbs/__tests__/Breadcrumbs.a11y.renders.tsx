// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Stable Breadcrumbs renders shared by jsdom, Storybook, and Chromium. */

import type {ReactElement} from 'react';
import {Breadcrumbs} from '../Breadcrumbs';
import {BreadcrumbItem} from '../BreadcrumbItem';
import type {BreadcrumbA11yRow} from './Breadcrumbs.a11y.states';

export const BREADCRUMB_A11Y_RENDERS: Readonly<
  Record<BreadcrumbA11yRow['id'], () => ReactElement>
> = {
  'explicit-current-default': () => (
    <Breadcrumbs data-a11y-breadcrumb>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      <BreadcrumbItem isCurrent>Current page</BreadcrumbItem>
    </Breadcrumbs>
  ),
  'auto-current-custom-label-rtl': () => (
    <div dir="rtl">
      <Breadcrumbs
        data-a11y-breadcrumb
        label="Project location"
        separator="›"
        variant="supporting">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
        <BreadcrumbItem href="/projects/current">Current page</BreadcrumbItem>
      </Breadcrumbs>
    </div>
  ),
  'no-current-opt-out': () => (
    <Breadcrumbs data-a11y-breadcrumb>
      <BreadcrumbItem href="/" isCurrent={false}>
        Home
      </BreadcrumbItem>
      <BreadcrumbItem href="/archive" isCurrent={false}>
        Archive
      </BreadcrumbItem>
    </Breadcrumbs>
  ),
};
