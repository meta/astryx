// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docsite homepage route.
 * @input The client homepage and the build-time preview snapshots.
 * @output The homepage. Its decorative previews are static HTML.
 * @position Server entry for "/". The previews render here: a client module
 *   that imported them would put their snapshots in its bundle.
 */

import {FrozenPreview} from './_landing/FrozenPreview';
import {TemplatesPreview} from './_landing/TemplatesPreview';
import {HomePage} from './HomePage';

export default function Page() {
  return (
    <HomePage
      templatesPreview={<TemplatesPreview />}
      themesStore={<FrozenPreview id="themes-store" />}
    />
  );
}
