// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func aTextFieldIsAtLeast44PointsTallAtEveryTextSize() {
  let field = AstryxTextInput(label: "Email", value: .constant(""), size: .sm).frame(width: 240)
  for typeSize in [DynamicTypeSize.xSmall, .large, .accessibility5] {
    let pixels = Pixels(field, typeSize: typeSize)
    // The label sits above a field at least 44 tall.
    #expect(pixels.height >= 44 + 12)
  }
}

@MainActor
@Test func aFieldLabelUsesTheSecondaryTextColor() {
  var theme = Theme.default
  theme.light.color.textSecondary = Color(astryxRGBA: 0xFF0000FF)
  let pixels = Pixels(AstryxTextInput(label: "Email", value: .constant("")).frame(width: 240), theme: theme)
  #expect(pixels.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
}

@MainActor
@Test func aTextFieldIsNamedByItsLabel() {
  let field = AstryxTextInput(label: "Email", value: .constant(""))
  #expect(field.accessibilityText == "Email")
}
