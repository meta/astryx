// Copyright (c) Meta Platforms, Inc. and affiliates.

extension View {
  /// Core's base props on a view: `id` names it for UI tests, and `isHidden`
  /// removes it from layout and from assistive technology, as core's `hidden`
  /// attribute does.
  @ViewBuilder func astryxBase(_ base: AstryxBaseProps) -> some View {
    if base.isHidden == true {
      EmptyView()
    } else if let id = base.id {
      accessibilityIdentifier(id)
    } else {
      self
    }
  }
}
