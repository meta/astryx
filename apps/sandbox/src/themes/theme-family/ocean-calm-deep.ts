// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Sandbox zero-delta theme. @input Calm child. @output Selectable grandchild. @position Maintained consumer source. */

import {defineTheme} from '@astryxdesign/core/theme';
import {oceanCalmTheme} from './ocean-calm';

export const oceanCalmDeepTheme = defineTheme({
  name: 'sandbox-ocean-calm-deep',
  extends: oceanCalmTheme,
});
