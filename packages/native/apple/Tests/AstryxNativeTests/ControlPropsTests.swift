// Copyright (c) Meta Platforms, Inc. and affiliates.

import Testing
@testable import AstryxNative

@Test func valueCallbacksCarryTheValueOnly() {
  var received: Bool?
  let props = SwitchProps(label: "Wi-Fi", value: false, onChange: { received = $0 })
  props.onChange?(true)
  #expect(received == true)
  #expect(SwitchProps.baseTarget == .root)
}

@Test func textSlotsAndNumberSetsAreTyped() {
  let heading = HeadingProps(level: .v2, children: "Orders")
  #expect(heading.level.rawValue == 2)
  #expect(heading.children == "Orders")
  let badge = BadgeProps(variant: .success, label: "Paid")
  #expect(badge.label == "Paid")
  let divider = DividerProps(label: "Or")
  #expect(divider.label == "Or")
}

@Test func aButtonPressTakesNoArguments() {
  var pressed = 0
  let button = ButtonProps(label: "Pay", onClick: { pressed += 1 })
  button.onClick?()
  #expect(pressed == 1)
}
