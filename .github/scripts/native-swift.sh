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
# Then every host app under packages/native (a Host/project.yml) is generated
# with a pinned XcodeGen and its UI tests run on the same simulator; with
# NATIVE_UI_DIR set, their screenshots are exported there.
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

# Reads a result bundle and reports it. -quiet names a failing test but not
# why it failed, so this prints the counts and annotates each failure with its
# own message, such as an audit issue's element and finding. It fails if
# xcodebuild failed, a test failed, the bundle cannot be read, or no test ran.
report_results() {
  local results=$1 status=$2 label=$3
  if ! xcrun xcresulttool get test-results summary --path "$results" --compact > "$work/summary.json"; then
    echo "Could not read the $label results."
    return "$(( status == 0 ? 1 : status ))"
  fi
  python3 - "$work/summary.json" "$status" "$label" <<'PY'
import json, sys
summary = json.load(open(sys.argv[1]))
print("%s: %s passed, %s failed, %s skipped" % (sys.argv[3], summary["passedTests"], summary["failedTests"], summary["skippedTests"]))
for failure in summary.get("testFailures", []):
    text = " ".join(failure.get("failureText", "").split()).replace("%", "%25")
    print("::error title=%s::%s" % (failure.get("testName", "test"), text))
sys.exit(1 if sys.argv[2] != "0" or summary["failedTests"] > 0 or summary["totalTestCount"] == 0 else 0)
PY
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
      status=0
      xcodebuild test -scheme "$scheme" -destination "platform=iOS Simulator,id=$simulator" -resultBundlePath "$results" -quiet || status=$?
      report_results "$results" "$status" 'iOS Simulator'
    else
      xcodebuild build -scheme "$scheme" -destination 'generic/platform=iOS Simulator' -quiet
    fi
  )
  echo '::endgroup::'
done

# App-hosted UI tests. XcodeGen writes each host's .xcodeproj from its checked-in
# project.yml; the release is pinned by version and checksum.
XCODEGEN_VERSION=2.46.0
XCODEGEN_SHA256=4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806
hosts=$(find packages/native -path '*/Host/project.yml' -not -path '*/.build/*' -not -path '*/node_modules/*' | sort)
if [ -n "$hosts" ]; then
  curl -fsSL -o "$work/xcodegen.zip" "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip"
  echo "$XCODEGEN_SHA256  $work/xcodegen.zip" | shasum -a 256 -c -
  rm -rf "$work/xcodegen"
  unzip -q "$work/xcodegen.zip" -d "$work"
  xcodegen="$work/xcodegen/bin/xcodegen"
  "$xcodegen" --version
fi
for spec in $hosts; do
  host=$(dirname "$spec")
  echo "::group::$host (UI tests)"
  (
    cd "$host"
    "$xcodegen" generate --spec project.yml --quiet
    project=$(find . -maxdepth 1 -name '*.xcodeproj' | head -1)
    xcodebuild -list -json -project "$project" > "$work/host-schemes.json"
    # The host's own scheme is named after its project; the local package
    # adds schemes of its own beside it.
    scheme=$(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["project"]; print(p["name"] if p["name"] in p["schemes"] else p["schemes"][0])' "$work/host-schemes.json")
    name=$(basename "$(dirname "$host")")
    results="$work/$name-host-ui.xcresult"
    rm -rf "$results"
    status=0
    xcodebuild test -project "$project" -scheme "$scheme" -destination "platform=iOS Simulator,id=$simulator" -resultBundlePath "$results" -quiet || status=$?
    if [ -n "${NATIVE_UI_DIR:-}" ] && [ -d "$results" ]; then
      mkdir -p "$NATIVE_UI_DIR/$name"
      xcrun xcresulttool export attachments --path "$results" --output-path "$NATIVE_UI_DIR/$name" || true
    fi
    report_results "$results" "$status" 'UI tests'
  )
  echo '::endgroup::'
done
