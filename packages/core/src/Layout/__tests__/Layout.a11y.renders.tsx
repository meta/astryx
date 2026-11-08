// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Stable Layout region renders shared by jsdom, Storybook, and Chromium. */

import type {ReactElement} from 'react';
import {Layout} from '../Layout';
import {LayoutContent} from '../LayoutContent';
import {LayoutFooter} from '../LayoutFooter';
import {LayoutHeader} from '../LayoutHeader';
import {LayoutPanel} from '../LayoutPanel';
import type {LayoutLandmarkA11yRow} from './Layout.a11y.states';

function Body({children = 'Project body'}: {children?: string}) {
  return <LayoutContent>{children}</LayoutContent>;
}

export const LAYOUT_LANDMARK_A11Y_RENDERS: Readonly<
  Record<LayoutLandmarkA11yRow['id'], () => ReactElement>
> = {
  'header-banner': () => (
    <Layout
      height="auto"
      header={
        <LayoutHeader
          data-a11y-landmark
          hasDivider
          label="Product"
          role="banner">
          <span data-a11y-landmark-content>Product header</span>
        </LayoutHeader>
      }
      content={<Body />}
    />
  ),
  'content-main': () => (
    <Layout
      height="auto"
      content={
        <LayoutContent data-a11y-landmark label="Project overview" role="main">
          <span data-a11y-landmark-content>Project body</span>
        </LayoutContent>
      }
    />
  ),
  'footer-contentinfo': () => (
    <Layout
      height="auto"
      content={<Body />}
      footer={
        <LayoutFooter
          data-a11y-landmark
          hasDivider
          label="Legal and support"
          role="contentinfo">
          <span data-a11y-landmark-content>Terms and help</span>
        </LayoutFooter>
      }
    />
  ),
  'start-end-navigation-rtl': () => (
    <div dir="rtl">
      <Layout
        height="auto"
        start={
          <LayoutPanel
            data-a11y-landmark
            hasDivider
            label="Project sections"
            role="navigation">
            <span data-a11y-landmark-content>Sections</span>
          </LayoutPanel>
        }
        content={<Body />}
        end={
          <LayoutPanel
            data-a11y-landmark-peer
            hasDivider
            label="Page outline"
            role="navigation">
            Outline
          </LayoutPanel>
        }
      />
    </div>
  ),
  'nested-panel-region': () => (
    <Layout
      height="auto"
      content={
        <LayoutContent label="Project overview" role="main">
          <Layout
            height="auto"
            start={
              <LayoutPanel
                data-a11y-landmark
                hasDivider
                label="Filters"
                role="region">
                <span data-a11y-landmark-content>Status filters</span>
              </LayoutPanel>
            }
            content={<Body>Filtered results</Body>}
          />
        </LayoutContent>
      }
    />
  ),
};
