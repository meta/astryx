// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// The host side of arm C (AST-082 FR12): a TypeScript logic core runs in a
// JavaScript engine inside the app and native views draw its tree. Its shape
// follows the ClientHost of EJ Campbell's astryx-swift spike
// (github.com/ejc3/astryx-swift, MIT), which runs the core in Hermes. This host
// uses JavaScriptCore, part of the platform SDK, so the package needs nothing
// else; a Hermes host speaks the same bridge.

#if os(iOS) || os(macOS)
import Foundation
import JavaScriptCore
import Observation

/// Runs a logic core bundle and carries its tree to native views and their
/// actions back, as the JSON `@astryxdesign/native/logic`'s `connectBridge`
/// speaks.
///
/// The bundle defines a global function, `astryxStart` by default, that takes
/// the host (`connected(version)` and `changed(json)`) and returns the bridge
/// (`getSnapshot()` and `dispatch(json)`).
@MainActor
@Observable
public final class AstryxLogicHost {
  /// The bridge version this host speaks (`BRIDGE_VERSION` in TypeScript).
  public static let bridgeVersion = 1

  /// The current tree; nil before the first snapshot and once the host fails.
  public private(set) var root: AstryxNode?
  /// Why the core stopped or a snapshot could not be read.
  public private(set) var failure: String?

  @ObservationIgnored private let context: JSContext
  @ObservationIgnored private var bridge: JSValue?

  public init(bundle source: String, entry: String = "astryxStart") {
    context = JSContext()
    context.exceptionHandler = { [weak self] _, exception in
      let message = exception?.toString() ?? "An unknown JavaScript error"
      MainActor.assumeIsolated { self?.fail(message) }
    }
    context.evaluateScript(source)
    guard failure == nil else { return }
    guard let start = context.objectForKeyedSubscript(entry), start.isObject else {
      fail("The bundle defines no \(entry) function")
      return
    }
    let host = JSValue(newObjectIn: context)
    let connected: @convention(block) (Int) -> Void = { [weak self] version in
      MainActor.assumeIsolated {
        if version != Self.bridgeVersion {
          self?.fail("The core speaks bridge \(version); this host speaks \(Self.bridgeVersion)")
        }
      }
    }
    let changed: @convention(block) (String) -> Void = { [weak self] json in
      MainActor.assumeIsolated { self?.receive(json) }
    }
    host?.setObject(connected, forKeyedSubscript: "connected" as NSString)
    host?.setObject(changed, forKeyedSubscript: "changed" as NSString)
    bridge = start.call(withArguments: [host as Any])
    guard failure == nil, let snapshot = bridge?.invokeMethod("getSnapshot", withArguments: []),
          snapshot.isString, let json = snapshot.toString() else {
      if failure == nil { fail("The bridge returned no snapshot") }
      return
    }
    receive(json)
  }

  /// Sends a view's action to the core: `node.viewProps(send: host.send)`.
  /// Views call it on the main thread, where it dispatches at once; from any
  /// other thread it dispatches on the main actor.
  public nonisolated func send(_ action: AstryxAction) {
    if Thread.isMainThread {
      MainActor.assumeIsolated { dispatch(action) }
    } else {
      Task { @MainActor in self.dispatch(action) }
    }
  }

  private func dispatch(_ action: AstryxAction) {
    guard failure == nil, let bridge else { return }
    bridge.invokeMethod("dispatch", withArguments: [action.json])
  }

  private func receive(_ json: String) {
    // A failed host stays failed: a later tree does not bring it back.
    guard failure == nil else { return }
    do {
      root = try JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8))
    } catch {
      fail("The core sent a tree this binding cannot read: \(error)")
    }
  }

  /// Stops the host: no tree to draw and no actions sent.
  private func fail(_ message: String) {
    failure = message
    root = nil
  }
}
#endif
