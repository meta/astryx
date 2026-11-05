// Copyright (c) Meta Platforms, Inc. and affiliates.

import Testing
@testable import AstryxNative

/// A logic core with the bridge `@astryxdesign/native/logic` exposes, written
/// out by hand so the Swift tests need no build step.
private let settingsBundle = """
function astryxStart(host) {
  var state = {wifi: true};
  function view() {
    return {component: 'VStack', key: 'root', props: {children: [
      {component: 'Switch', key: 'wifi', props: {label: 'Wi-Fi', value: state.wifi}, events: ['onChange']},
      {component: 'Text', key: 'status', props: {children: state.wifi ? 'Connected' : 'Off'}}
    ]}};
  }
  host.connected(1);
  return {
    getSnapshot: function () { return JSON.stringify(view()); },
    dispatch: function (json) {
      var action = JSON.parse(json);
      if (action.key === 'wifi' && action.event === 'onChange') {
        state = {wifi: action.args[0]};
        host.changed(JSON.stringify(view()));
      }
    }
  };
}
"""

@MainActor
@Test func aViewsActionReachesTheCoreAndTheNewTreeComesBack() throws {
  let host = AstryxLogicHost(bundle: settingsBundle)
  #expect(host.failure == nil)
  guard case .vStack(let stack) = host.root, case .switch(let wifi) = stack.props.children?[0] else {
    Issue.record("unexpected first tree")
    return
  }
  #expect(wifi.props.value == true)

  // The view calls its onChange; the action goes to the core.
  let props = wifi.viewProps(send: host.send)
  props.onChange?(false)

  guard case .vStack(let next) = host.root, case .text(let status) = next.props.children?[1] else {
    Issue.record("unexpected next tree")
    return
  }
  #expect(status.props.children == "Off")
}

@MainActor
@Test func aLaterErrorClearsTheTreeAndStopsActions() throws {
  let bundle = settingsBundle + "\nvar fragile = astryxStart; astryxStart = function (h) { var b = fragile(h); var d = b.dispatch; b.dispatch = function (j) { if (JSON.parse(j).args[0] === false) throw new Error('core broke'); d(j); }; return b; };"
  let host = AstryxLogicHost(bundle: bundle)
  guard case .vStack(let stack) = host.root, case .switch(let wifi) = stack.props.children?[0] else {
    Issue.record("unexpected first tree")
    return
  }
  wifi.viewProps(send: host.send).onChange?(false)
  #expect(host.failure?.contains("core broke") == true)
  #expect(host.root == nil)
}

@MainActor
@Test func aTreeAfterAFailureIsIgnored() {
  let bundle = """
  function astryxStart(h) {
    h.connected(2);
    h.changed(JSON.stringify({component: 'Text', key: 'late', props: {children: 'Too late'}}));
    return {getSnapshot: function () { return '{}'; }, dispatch: function () {}};
  }
  """
  let host = AstryxLogicHost(bundle: bundle)
  #expect(host.failure?.contains("bridge 2") == true)
  #expect(host.root == nil)
}

@MainActor
@Test func aBundleWithoutTheEntryOrWithAnErrorFails() {
  #expect(AstryxLogicHost(bundle: "var x = 1;").failure == "The bundle defines no astryxStart function")
  #expect(AstryxLogicHost(bundle: "throw new Error('boom');").failure?.contains("boom") == true)
  let wrongVersion = AstryxLogicHost(bundle: "function astryxStart(h) { h.connected(2); return {getSnapshot: function () { return '{}'; }}; }")
  #expect(wrongVersion.failure?.contains("bridge 2") == true)
}
