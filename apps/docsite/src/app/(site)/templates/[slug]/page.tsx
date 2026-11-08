// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Redirect /templates/<slug> to /templates?preview=<slug> so the preview
 * dialog opens on the gallery page. Keeps old direct links working.
 */

import {redirect} from 'next/navigation';
import {templateMetadata as templates} from '../../../../generated/templateMetadataRegistry';

export function generateStaticParams() {
  return templates.map(t => ({slug: t.slug}));
}

export default async function TemplatePage({
  params,
}: {
  params: Promise<{slug: string}>;
}) {
  const {slug} = await params;
  redirect(`/templates?preview=${slug}`);
}
