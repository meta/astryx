// Copyright (c) Meta Platforms, Inc. and affiliates.

import {PreviewShell} from './PreviewShell';

export default function FullscreenLayout({
  children,
  forceEmbed = false,
}: {
  children: React.ReactNode;
  forceEmbed?: boolean;
}) {
  return <PreviewShell forceEmbed={forceEmbed}>{children}</PreviewShell>;
}
