// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func severalChildrenStackInOneCard() {
  let card = Astryx.Card(padding: 0) {
    Color(astryxHex: "#FF0000FF").frame(width: 80, height: 40)
    Color(astryxHex: "#0000FFFF").frame(width: 80, height: 40)
  }
  .frame(width: 120)
  let pixels = Pixels(card)
  // One card, the two children one above the other.
  #expect(pixels.height >= 80)
  #expect(close(pixels.at(40, 20), rgba("#FF0000FF")))
  #expect(close(pixels.at(40, 60), rgba("#0000FFFF")))
}
