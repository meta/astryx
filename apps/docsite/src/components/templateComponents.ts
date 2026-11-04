// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared lazy-loaded registry of template page components, keyed by slug.
 *
 * Both the templates gallery thumbnails (TemplateThumbnail) and the
 * preview dialog (TemplatePreviewDialog) render the template's real
 * `page.tsx` component, so the lazy import map lives here to keep a
 * single source of truth.
 *
 * SYNC: when a page template is added under
 * packages/cli/assets/templates/pages/<slug>/, add a matching entry here.
 */

import {lazy} from 'react';
import type React from 'react';

export const TEMPLATE_COMPONENTS: Record<
  string,
  React.LazyExoticComponent<React.ComponentType>
> = {
  'ai-chat': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/ai-chat/page'),
  ),
  'ai-chat-landing': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/ai-chat-landing/page'),
  ),
  blank: lazy(
    () => import('../../../../packages/cli/assets/templates/pages/blank/page'),
  ),
  'canvas-editor': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/canvas-editor/page'),
  ),
  'centered-hero': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/centered-hero/page'),
  ),
  'checkout-wizard': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/checkout-wizard/page'),
  ),
  'classic-gallery': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/classic-gallery/page'),
  ),
  'contact-form': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/contact-form/page'),
  ),
  dashboard: lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard/page'),
  ),
  'dashboard-alert-rail': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-alert-rail/page'),
  ),
  'dashboard-cohort-funnel': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-cohort-funnel/page'),
  ),
  'dashboard-comparison': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-comparison/page'),
  ),
  'dashboard-composition': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-composition/page'),
  ),
  'dashboard-progress': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-progress/page'),
  ),
  'dashboard-scorecard': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/dashboard-scorecard/page'),
  ),
  'detail-page': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/detail-page/page'),
  ),
  documentation: lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/documentation/page'),
  ),
  'documentation-design': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/documentation-design/page'),
  ),
  'documentation-technical': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/documentation-technical/page'),
  ),
  editor: lazy(
    () => import('../../../../packages/cli/assets/templates/pages/editor/page'),
  ),
  'file-explorer': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/file-explorer/page'),
  ),
  'form-two-column': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/form-two-column/page'),
  ),
  'form-wizard': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/form-wizard/page'),
  ),
  'form-wizard-dialog': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/form-wizard-dialog/page'),
  ),
  'form-wizard-inline': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/form-wizard-inline/page'),
  ),
  'form-wizard-vertical': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/form-wizard-vertical/page'),
  ),
  'gallery-hero': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/gallery-hero/page'),
  ),
  ide: lazy(
    () => import('../../../../packages/cli/assets/templates/pages/ide/page'),
  ),
  'kanban-board': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/kanban-board/page'),
  ),
  library: lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/library/page'),
  ),
  login: lazy(
    () => import('../../../../packages/cli/assets/templates/pages/login/page'),
  ),
  'login-card': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/login-card/page'),
  ),
  'login-split': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/login-split/page'),
  ),
  'login-sso': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/login-sso/page'),
  ),
  'mixed-gallery': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/mixed-gallery/page'),
  ),
  'payment-form': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/payment-form/page'),
  ),
  'product-detail': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/product-detail/page'),
  ),
  'product-gallery': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/product-gallery/page'),
  ),
  settings: lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/settings/page'),
  ),
  'settings-dialog': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/settings-dialog/page'),
  ),
  'settings-sidebar': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/settings-sidebar/page'),
  ),
  'side-gallery': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/side-gallery/page'),
  ),
  'shell-nav': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/shell-nav/page'),
  ),
  'shell-side-nav': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/shell-side-nav/page'),
  ),
  'shell-top-nav': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/shell-top-nav/page'),
  ),
  table: lazy(
    () => import('../../../../packages/cli/assets/templates/pages/table/page'),
  ),
  'table-comparison': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-comparison/page'),
  ),
  'table-filter': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-filter/page'),
  ),
  'table-collapsible': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-collapsible/page'),
  ),
  'table-grouped': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-grouped/page'),
  ),
  'table-inbox': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-inbox/page'),
  ),
  'table-page': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-page/page'),
  ),
  'table-tree': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/table-tree/page'),
  ),
  'work-item-detail': lazy(
    () =>
      import('../../../../packages/cli/assets/templates/pages/work-item-detail/page'),
  ),
};

/** Resolve a template's lazy component by slug, or `undefined` if unknown. */
export function getTemplateComponent(
  slug: string,
): React.LazyExoticComponent<React.ComponentType> | undefined {
  return TEMPLATE_COMPONENTS[slug];
}
