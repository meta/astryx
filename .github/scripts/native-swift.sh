#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# Build and test every Swift package of @astryxdesign/native.
#
#   native-swift.sh
#
# Run from the repository root on macOS with Xcode. One package per directory
# that holds a Package.swift, such as apple/ (generated contracts) and each
# versioned swift-ios-<n>/. A package that supports macOS builds and tests
# there. Every package with a test target also builds and runs its tests on
# the iOS Simulator, since `#if os(iOS)` code compiles only there; a package
# without a test target only builds for it.
#
# The steps live in this file, not inline in ci.yml, so a change to them is in
# the native Swift scope and runs on its own pull request.
set -euo pipefail

work="${RUNNER_TEMP:-$(mktemp -d)}"
xcodebuild -version
packages=$(find packages/native -name Package.swift -not -path '*/.build/*' -not -path '*/node_modules/*' -exec dirname {} \; | sort)
if [ -z "$packages" ]; then
  echo 'No Swift package found under packages/native.'
  exit 1
fi
# The iOS Simulator to test on: the newest available iPhone, created on the
# newest iOS runtime when the runner image lists none. Device names differ
# between runner images, so the destination is a device id, never a name.
ios_simulator() {
  local udid runtime devicetype
  udid=$(xcrun simctl list devices available --json | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
def version(runtime):
    return [int(p) for p in runtime.rsplit(".iOS-", 1)[1].split("-")]
ios = sorted((r for r in devices if ".iOS-" in r), key=version, reverse=True)
print(next((d["udid"] for r in ios for d in devices[r] if d["name"].startswith("iPhone")), ""))
')
  if [ -z "$udid" ]; then
    runtime=$(xcrun simctl list runtimes available --json | python3 -c '
import json, sys
ios = [r for r in json.load(sys.stdin)["runtimes"] if r["platform"] == "iOS"]
print(max(ios, key=lambda r: [int(p) for p in r["version"].split(".")])["identifier"] if ios else "")
')
    if [ -z "$runtime" ]; then
      echo 'No iOS Simulator runtime is available on this runner:' >&2
      xcrun simctl list runtimes >&2
      return 1
    fi
    devicetype=$(xcrun simctl list devicetypes --json | python3 -c '
import json, sys
phones = [t["identifier"] for t in json.load(sys.stdin)["devicetypes"] if t["name"].startswith("iPhone")]
print(phones[-1] if phones else "")
')
    udid=$(xcrun simctl create astryx-ci "$devicetype" "$runtime")
  fi
  echo "$udid"
}

simulator=$(ios_simulator)
echo "iOS Simulator: $simulator"
for package in $packages; do
  echo "::group::$package"
  (
    cd "$package"
    swift package dump-package > "$work/package.json"
    read -r macos tests < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(any(p["platformName"]=="macos" for p in d.get("platforms",[])) or not d.get("platforms"), any(t["type"]=="test" for t in d["targets"]))' "$work/package.json")
    # Xcode names the whole-package scheme <name>-Package when a package has
    # several products, and after its product otherwise.
    xcodebuild -list -json > "$work/schemes.json"
    scheme=$(python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))["workspace"]["schemes"]; print(next((x for x in s if x.endswith("-Package")), s[0]))' "$work/schemes.json")
    if [ "$macos" = True ] && [ "$tests" = True ]; then
      swift test
    elif [ "$macos" = True ]; then
      swift build
    fi
    if [ "$tests" = True ]; then
      results="$work/$(basename "$package")-ios.xcresult"
      rm -rf "$results"
      xcodebuild test -scheme "$scheme" -destination "platform=iOS Simulator,id=$simulator" -resultBundlePath "$results" -quiet
      # -quiet prints only failures, so report the counts, and fail if the
      # scheme ran no tests at all.
      xcrun xcresulttool get test-results summary --path "$results" --compact > "$work/summary.json"
      python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("iOS Simulator: %s passed, %s failed, %s skipped" % (d["passedTests"], d["failedTests"], d["skippedTests"])); sys.exit(d["totalTestCount"] == 0)' "$work/summary.json"
    else
      xcodebuild build -scheme "$scheme" -destination 'generic/platform=iOS Simulator' -quiet
    fi
  )
  echo '::endgroup::'
done
