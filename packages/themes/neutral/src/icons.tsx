// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icons.tsx
 * @input Uses lucide-react icon components, IconRegistry type
 * @output Exports neutralIconRegistry for the neutral theme
 * @position Icon configuration for the neutral theme; consumed by index.ts
 *
 * Maps semantic icon names, and the `media:*` keys of the media player, to
 * Lucide icon components. These icons are bundled with the theme, not with
 * @astryxdesign/core.
 */

import React, {type ReactNode} from 'react';
import type {IconRegistry, NamespacedIconName} from '@astryxdesign/core/Icon';

import {
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Calendar,
  Clock,
  ExternalLink,
  Menu,
  MoreHorizontal,
  Search,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  EyeOff,
  Columns,
  Copy,
  CheckCheck,
  Wrench,
  Square,
  Mic,
  Play,
  Pause,
  RotateCcw,
  Rewind,
  FastForward,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Captions,
} from 'lucide-react';

const iconProps = {
  size: '1em',
  'aria-hidden': true as const,
};

export const neutralIconRegistry: IconRegistry &
  Partial<Record<NamespacedIconName, ReactNode>> = {
  close: <X {...iconProps} />,
  chevronDown: <ChevronDown {...iconProps} />,
  chevronLeft: <ChevronLeft {...iconProps} />,
  chevronRight: <ChevronRight {...iconProps} />,
  chevronsLeft: <ChevronsLeft {...iconProps} />,
  chevronsRight: <ChevronsRight {...iconProps} />,
  check: <Check {...iconProps} />,
  success: <CheckCircle {...iconProps} />,
  error: <XCircle {...iconProps} />,
  warning: <AlertTriangle {...iconProps} />,
  info: <Info {...iconProps} />,
  calendar: <Calendar {...iconProps} />,
  clock: <Clock {...iconProps} />,
  externalLink: <ExternalLink {...iconProps} />,
  menu: <Menu {...iconProps} />,
  moreHorizontal: <MoreHorizontal {...iconProps} />,
  search: <Search {...iconProps} />,
  upload: <Upload {...iconProps} />,
  arrowUp: <ArrowUp {...iconProps} />,
  arrowDown: <ArrowDown {...iconProps} />,
  arrowsUpDown: <ArrowUpDown {...iconProps} />,
  funnel: <Filter {...iconProps} />,
  eyeSlash: <EyeOff {...iconProps} />,
  viewColumns: <Columns {...iconProps} />,
  copy: <Copy {...iconProps} />,
  checkDouble: <CheckCheck {...iconProps} />,
  wrench: <Wrench {...iconProps} />,
  stop: <Square {...iconProps} />,
  microphone: <Mic {...iconProps} />,
  // Media player glyphs, by the keys the media controls ask for.
  'media:play': <Play {...iconProps} />,
  'media:pause': <Pause {...iconProps} />,
  'media:replay': <RotateCcw {...iconProps} />,
  'media:skip-back': <Rewind {...iconProps} />,
  'media:skip-forward': <FastForward {...iconProps} />,
  'media:volume-high': <Volume2 {...iconProps} />,
  'media:volume-low': <Volume1 {...iconProps} />,
  'media:volume-off': <VolumeX {...iconProps} />,
  'media:fullscreen-enter': <Maximize {...iconProps} />,
  'media:fullscreen-exit': <Minimize {...iconProps} />,
  'media:captions': <Captions {...iconProps} />,
};
