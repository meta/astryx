// Copyright (c) Meta Platforms, Inc. and affiliates.

import Testing
@testable import Astryx

// Swift component API spec, A1 and A1a. This file imports only Astryx, as an
// app file does: SwiftUI comes with it, a name Astryx shares with SwiftUI
// means Astryx's view, and `SwiftUI.<Name>` names the system one.

@MainActor
@Test func aFileThatImportsOnlyAstryxGetsAstryxViews() {
  let text: Text = Text("Hello")
  let qualified: Astryx.Text = text
  let button: Button = Button(label: "Save") {}
  let card = Card { Text("Inside") }
  let system: SwiftUI.Text = SwiftUI.Text("System")
  let systemButton = SwiftUI.Button("Cancel") {}
  #expect(type(of: qualified) == Astryx.Text.self)
  #expect(type(of: button) == Astryx.Button.self)
  #expect(type(of: card) == Astryx.Card<Astryx.Text>.self)
  #expect(type(of: system) == SwiftUI.Text.self)
  #expect(type(of: systemButton) == SwiftUI.Button<SwiftUI.Text>.self)
}

@Test func theGeneratedContractsComeWithAstryx() {
  let props = ButtonProps(label: "Save", variant: .primary)
  #expect(props.variant == .primary)
}
