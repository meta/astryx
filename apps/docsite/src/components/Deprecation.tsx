// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Deprecation.tsx
 * @input A component registry entry's `deprecated`, generated from its doc's
 *   `deprecated` field.
 * @output The label every surface uses for a deprecated component, the
 *   Deprecated badge shown in its page header (beside any stability badge) and
 *   on its index tile, and the notice on its page that names the replacement
 *   and links to it.
 * @position Shared by ComponentDetailClient, the components index, and the
 *   search palette, so every surface says the same thing.
 */

import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import type {ComponentDeprecation} from '../generated/componentRegistry';

/** The label every surface shows for a deprecated component. */
export const DEPRECATED_LABEL = 'Deprecated';

// Neutral: metadata beside the module name, not an alert. The notice on the
// page carries the message.
export function DeprecatedBadge() {
  return <Badge variant="neutral" label={DEPRECATED_LABEL} />;
}

/**
 * The notice at the top of a deprecated component's page: the status and the
 * replacement in its title, the modernization route below, and a link to the
 * replacement's page.
 */
export function DeprecationNotice({
  deprecation,
}: {
  deprecation: ComponentDeprecation;
}) {
  const replacement = deprecation.replacementDisplayName;
  return (
    <Banner
      status="warning"
      title={`${DEPRECATED_LABEL}: use ${replacement} instead`}
      description={deprecation.description}
      endContent={
        <Button
          variant="secondary"
          size="sm"
          label={`View ${replacement}`}
          href={`/components/${deprecation.replacement}`}
        />
      }
    />
  );
}
