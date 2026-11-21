// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docsite homepage route.
 * @input The client homepage, the build-time preview snapshots, and the
 *   generated component registry.
 * @output The homepage. Its decorative previews are static HTML.
 * @position Server entry for "/". FrozenPreview sends each preview's markup
 *   once, as server HTML. The registry is megabytes, so this module counts
 *   the components and the page's scripts get the number.
 */

import {components} from '../../generated/componentRegistry';
import {FrozenPreview} from './_landing/FrozenPreview';
import {TemplatesPreview} from './_landing/TemplatesPreview';
import {HomePage} from './HomePage';

// Rounded down to the nearest 10, so that the copy stays true each time one
// component lands.
const CORE_COMPONENT_COUNT_ROUNDED =
  Math.floor(
    (components['@astryxdesign/core'] ?? []).filter(
      c => !c.hidden && !c.name.startsWith('use'),
    ).length / 10,
  ) * 10;

export default function Page() {
  return (
    <HomePage
      coreComponentCount={CORE_COMPONENT_COUNT_ROUNDED}
      templatesPreview={<TemplatesPreview />}
      themesStore={<FrozenPreview id="themes-store" />}
    />
  );
}
