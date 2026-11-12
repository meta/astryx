// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared lazy-loaded registry of template page components, keyed by slug.
 *
 * Both the templates gallery thumbnails (TemplateThumbnail) and the
 * preview dialog (TemplatePreviewDialog) render the template's real
 * `page.tsx` component, so the import map lives here to keep a
 * single source of truth. The dialog renders the lazy components.
 * Thumbnails call `preloadTemplate` and render the loaded component, so
 * their render does not suspend.
 *
 * SYNC: when a page template is added under
 * packages/cli/assets/templates/pages/<slug>/, add a matching entry here.
 */

import {lazy} from 'react';
import type React from 'react';

type TemplateModule = {default: React.ComponentType};

/** Import loaders keyed by slug. Each import is its own chunk. */
export const TEMPLATE_LOADERS: Record<string, () => Promise<TemplateModule>> = {
  'ai-chat': () =>
    import('../../../../packages/cli/assets/templates/pages/ai-chat/page'),
  'ai-chat-landing': () =>
    import('../../../../packages/cli/assets/templates/pages/ai-chat-landing/page'),
  blank: () =>
    import('../../../../packages/cli/assets/templates/pages/blank/page'),
  'canvas-editor': () =>
    import('../../../../packages/cli/assets/templates/pages/canvas-editor/page'),
  'centered-hero': () =>
    import('../../../../packages/cli/assets/templates/pages/centered-hero/page'),
  'checkout-wizard': () =>
    import('../../../../packages/cli/assets/templates/pages/checkout-wizard/page'),
  'classic-gallery': () =>
    import('../../../../packages/cli/assets/templates/pages/classic-gallery/page'),
  'contact-form': () =>
    import('../../../../packages/cli/assets/templates/pages/contact-form/page'),
  'course-detail': () =>
    import('../../../../packages/cli/assets/templates/pages/course-detail/page'),
  dashboard: () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard/page'),
  'dashboard-alert-rail': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-alert-rail/page'),
  'dashboard-cohort-funnel': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-cohort-funnel/page'),
  'dashboard-comparison': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-comparison/page'),
  'dashboard-composition': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-composition/page'),
  'dashboard-progress': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-progress/page'),
  'dashboard-scorecard': () =>
    import('../../../../packages/cli/assets/templates/pages/dashboard-scorecard/page'),
  'detail-page': () =>
    import('../../../../packages/cli/assets/templates/pages/detail-page/page'),
  documentation: () =>
    import('../../../../packages/cli/assets/templates/pages/documentation/page'),
  'documentation-design': () =>
    import('../../../../packages/cli/assets/templates/pages/documentation-design/page'),
  'documentation-technical': () =>
    import('../../../../packages/cli/assets/templates/pages/documentation-technical/page'),
  editor: () =>
    import('../../../../packages/cli/assets/templates/pages/editor/page'),
  'file-explorer': () =>
    import('../../../../packages/cli/assets/templates/pages/file-explorer/page'),
  'form-two-column': () =>
    import('../../../../packages/cli/assets/templates/pages/form-two-column/page'),
  'form-wizard': () =>
    import('../../../../packages/cli/assets/templates/pages/form-wizard/page'),
  'form-wizard-dialog': () =>
    import('../../../../packages/cli/assets/templates/pages/form-wizard-dialog/page'),
  'form-wizard-inline': () =>
    import('../../../../packages/cli/assets/templates/pages/form-wizard-inline/page'),
  'form-wizard-vertical': () =>
    import('../../../../packages/cli/assets/templates/pages/form-wizard-vertical/page'),
  'gallery-hero': () =>
    import('../../../../packages/cli/assets/templates/pages/gallery-hero/page'),
  ide: () => import('../../../../packages/cli/assets/templates/pages/ide/page'),
  'kanban-board': () =>
    import('../../../../packages/cli/assets/templates/pages/kanban-board/page'),
  library: () =>
    import('../../../../packages/cli/assets/templates/pages/library/page'),
  login: () =>
    import('../../../../packages/cli/assets/templates/pages/login/page'),
  'login-card': () =>
    import('../../../../packages/cli/assets/templates/pages/login-card/page'),
  'login-split': () =>
    import('../../../../packages/cli/assets/templates/pages/login-split/page'),
  'login-sso': () =>
    import('../../../../packages/cli/assets/templates/pages/login-sso/page'),
  'mixed-gallery': () =>
    import('../../../../packages/cli/assets/templates/pages/mixed-gallery/page'),
  'payment-form': () =>
    import('../../../../packages/cli/assets/templates/pages/payment-form/page'),
  'product-detail': () =>
    import('../../../../packages/cli/assets/templates/pages/product-detail/page'),
  'product-gallery': () =>
    import('../../../../packages/cli/assets/templates/pages/product-gallery/page'),
  settings: () =>
    import('../../../../packages/cli/assets/templates/pages/settings/page'),
  'settings-dialog': () =>
    import('../../../../packages/cli/assets/templates/pages/settings-dialog/page'),
  'settings-sidebar': () =>
    import('../../../../packages/cli/assets/templates/pages/settings-sidebar/page'),
  'side-gallery': () =>
    import('../../../../packages/cli/assets/templates/pages/side-gallery/page'),
  'shell-nav': () =>
    import('../../../../packages/cli/assets/templates/pages/shell-nav/page'),
  'shell-side-nav': () =>
    import('../../../../packages/cli/assets/templates/pages/shell-side-nav/page'),
  'shell-top-nav': () =>
    import('../../../../packages/cli/assets/templates/pages/shell-top-nav/page'),
  table: () =>
    import('../../../../packages/cli/assets/templates/pages/table/page'),
  'table-comparison': () =>
    import('../../../../packages/cli/assets/templates/pages/table-comparison/page'),
  'table-filter': () =>
    import('../../../../packages/cli/assets/templates/pages/table-filter/page'),
  'table-collapsible': () =>
    import('../../../../packages/cli/assets/templates/pages/table-collapsible/page'),
  'table-grouped': () =>
    import('../../../../packages/cli/assets/templates/pages/table-grouped/page'),
  'table-inbox': () =>
    import('../../../../packages/cli/assets/templates/pages/table-inbox/page'),
  'table-page': () =>
    import('../../../../packages/cli/assets/templates/pages/table-page/page'),
  'table-tree': () =>
    import('../../../../packages/cli/assets/templates/pages/table-tree/page'),
  'work-item-detail': () =>
    import('../../../../packages/cli/assets/templates/pages/work-item-detail/page'),
};

export const TEMPLATE_COMPONENTS: Record<
  string,
  React.LazyExoticComponent<React.ComponentType>
> = Object.fromEntries(
  Object.entries(TEMPLATE_LOADERS).map(([slug, load]) => [slug, lazy(load)]),
);

const loadedTemplates = new Map<string, React.ComponentType>();
const pendingTemplates = new Map<string, Promise<React.ComponentType>>();

/**
 * Starts the import for a template, or returns the import already in flight.
 * Resolves to the template's page component.
 */
export function preloadTemplate(slug: string): Promise<React.ComponentType> {
  const pending = pendingTemplates.get(slug);
  if (pending) {
    return pending;
  }
  const load = TEMPLATE_LOADERS[slug];
  if (!load) {
    return Promise.reject(new Error(`Unknown template: ${slug}`));
  }
  const promise = load().then(
    module => {
      loadedTemplates.set(slug, module.default);
      return module.default;
    },
    error => {
      // A failed chunk load can succeed on a later attempt.
      pendingTemplates.delete(slug);
      throw error;
    },
  );
  pendingTemplates.set(slug, promise);
  return promise;
}

/** Returns the template's page component when its import has finished. */
export function getLoadedTemplate(
  slug: string,
): React.ComponentType | undefined {
  return loadedTemplates.get(slug);
}

/** Resolve a template's lazy component by slug, or `undefined` if unknown. */
export function getTemplateComponent(
  slug: string,
): React.LazyExoticComponent<React.ComponentType> | undefined {
  return TEMPLATE_COMPONENTS[slug];
}
