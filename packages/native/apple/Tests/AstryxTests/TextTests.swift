// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@Test func textColorDefaultsByTypeAsCoreDoes() {
  #expect(AstryxTextType.supporting.defaultColor == .secondary)
  for type in [AstryxTextType.body, .large, .label] {
    #expect(type.defaultColor == .primary)
  }
}

@Test func extraSmallIsSpelledAsCoreSpellsIt() {
  #expect(AstryxTextSize(rawValue: "xsm") == .xsm)
  #expect(AstryxTextSize.xsm.token == "font-size-xs")
  #expect(AstryxTextSize.sm.token == "font-size-sm")
}

@MainActor
@Test func textGrowsAtTheLargestDynamicTypeSize() {
  let large = Pixels(Astryx.Text("Hello").fixedSize())
  let largest = Pixels(Astryx.Text("Hello").fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width * 2)
}
