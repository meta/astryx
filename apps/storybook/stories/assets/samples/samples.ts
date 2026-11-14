// Copyright (c) Meta Platforms, Inc. and affiliates.

/// <reference types="vite/client" />

/**
 * @input The sample scenes in this folder.
 * @output One URL per scene and size, for story images.
 * @position Stories import these instead of a remote photo host, so a gallery
 *   renders without the network. `?no-inline` keeps each file a real URL; the
 *   Lightbox browser specs route `sample-*.svg` requests by that name.
 */

import beach1200x800 from './sample-beach-1200x800.svg?no-inline';
import beach200x120 from './sample-beach-200x120.svg?no-inline';
import beach200x200 from './sample-beach-200x200.svg?no-inline';
import beach400x300 from './sample-beach-400x300.svg?no-inline';
import beach400x400 from './sample-beach-400x400.svg?no-inline';
import beach600x400 from './sample-beach-600x400.svg?no-inline';
import beach800x450 from './sample-beach-800x450.svg?no-inline';
import canyon1200x600 from './sample-canyon-1200x600.svg?no-inline';
import canyon1200x800 from './sample-canyon-1200x800.svg?no-inline';
import canyon600x800 from './sample-canyon-600x800.svg?no-inline';
import city1200x800 from './sample-city-1200x800.svg?no-inline';
import city200x200 from './sample-city-200x200.svg?no-inline';
import city400x300 from './sample-city-400x300.svg?no-inline';
import city400x400 from './sample-city-400x400.svg?no-inline';
import city600x600 from './sample-city-600x600.svg?no-inline';
import city800x450 from './sample-city-800x450.svg?no-inline';
import dark200x200 from './sample-dark-200x200.svg?no-inline';
import desert400x300 from './sample-desert-400x300.svg?no-inline';
import desert400x400 from './sample-desert-400x400.svg?no-inline';
import forest1200x800 from './sample-forest-1200x800.svg?no-inline';
import forest200x200 from './sample-forest-200x200.svg?no-inline';
import forest400x300 from './sample-forest-400x300.svg?no-inline';
import forest400x400 from './sample-forest-400x400.svg?no-inline';
import forest600x900 from './sample-forest-600x900.svg?no-inline';
import lake1200x800 from './sample-lake-1200x800.svg?no-inline';
import lake400x300 from './sample-lake-400x300.svg?no-inline';
import lake400x400 from './sample-lake-400x400.svg?no-inline';
import lake800x450 from './sample-lake-800x450.svg?no-inline';
import lake800x600 from './sample-lake-800x600.svg?no-inline';
import light200x200 from './sample-light-200x200.svg?no-inline';
import meadow200x200 from './sample-meadow-200x200.svg?no-inline';
import meadow600x700 from './sample-meadow-600x700.svg?no-inline';
import mixed200x200 from './sample-mixed-200x200.svg?no-inline';
import snow400x300 from './sample-snow-400x300.svg?no-inline';
import snow400x400 from './sample-snow-400x400.svg?no-inline';
import warm200x200 from './sample-warm-200x200.svg?no-inline';

export const SAMPLE_IMAGES = {
  beach1200x800,
  beach200x120,
  beach200x200,
  beach400x300,
  beach400x400,
  beach600x400,
  beach800x450,
  canyon1200x600,
  canyon1200x800,
  canyon600x800,
  city1200x800,
  city200x200,
  city400x300,
  city400x400,
  city600x600,
  city800x450,
  dark200x200,
  desert400x300,
  desert400x400,
  forest1200x800,
  forest200x200,
  forest400x300,
  forest400x400,
  forest600x900,
  lake1200x800,
  lake400x300,
  lake400x400,
  lake800x450,
  lake800x600,
  light200x200,
  meadow200x200,
  meadow600x700,
  mixed200x200,
  snow400x300,
  snow400x400,
  warm200x200,
} as const;
