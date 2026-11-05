// Copyright (c) Meta Platforms, Inc. and affiliates.

export function buildTemplatePreviewHref(
  pathname: string,
  search: string,
  slug: string | null,
): string {
  const params = new URLSearchParams(search);
  if (slug == null) {
    params.delete('preview');
  } else {
    params.set('preview', slug);
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}
