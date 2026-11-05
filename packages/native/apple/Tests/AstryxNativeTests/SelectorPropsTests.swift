// Copyright (c) Meta Platforms, Inc. and affiliates.

import Testing
@testable import AstryxNative

@Test func selectorCoreAndPlatformProps() {
  let props = SelectorProps(
    label: "Shipping",
    options: [SelectorOption(value: "std", label: "Standard")],
    onChange: { _ in },
    menuStyle: .pullDown,
    base: AstryxBaseProps(id: "shipping")
  )
  #expect(props.label == "Shipping")
  #expect(props.menuStyle == .pullDown)
  #expect(SelectorProps.baseTarget == .trigger)
}
