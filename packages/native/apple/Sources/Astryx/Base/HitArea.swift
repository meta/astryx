// Copyright (c) Meta Platforms, Inc. and affiliates.

extension View {
  /// Answers taps across at least 44 by 44 points around a control drawn
  /// `side` points wide, without growing its layout (accessibility X7).
  func astryxMinimumHitArea(_ side: CGFloat) -> some View {
    let inset = astryxHitInset(side)
    return padding(inset).contentShape(Rectangle()).padding(-inset)
  }
}

/// How far a control `side` points wide reaches past its edges to answer taps
/// across 44 points.
func astryxHitInset(_ side: CGFloat) -> CGFloat {
  max(0, (44 - side) / 2)
}
