"use strict";

function suggestNextSmallestSlice({ changedFiles }) {
  let suggestion =
    "No clear repo-specific follow-through suggestion detected. Review spec/runtime/test alignment manually.";

  if (
    changedFiles.includes("runtime/contracts.js") &&
    !changedFiles.includes("runtime/tests/contracts_office.test.js")
  ) {
    suggestion =
      "Next smallest slice: add or tighten contract coverage in runtime/tests/contracts_office.test.js.";
  } else if (
    changedFiles.includes("runtime/ui_snapshot.js") &&
    !changedFiles.includes("runtime/tests/ui_snapshot.test.js")
  ) {
    suggestion =
      "Next smallest slice: add snapshot coverage in runtime/tests/ui_snapshot.test.js.";
  } else if (
    changedFiles.includes("runtime/ui_snapshot.js") &&
    !changedFiles.includes("specs/technical_spec.md")
  ) {
    suggestion =
      "Next smallest slice: align specs/technical_spec.md with new snapshot/runtime behavior.";
  } else if (
    changedFiles.includes("runtime/contracts.js") &&
    !changedFiles.includes("specs/contracts.md")
  ) {
    suggestion =
      "Next smallest slice: align specs/contracts.md with runtime contract changes.";
  } else if (
    changedFiles.includes("ui/app.js") &&
    !changedFiles.includes("runtime/ui_snapshot.js")
  ) {
    suggestion =
      "Next smallest slice: verify UI exposure is still backed by runtime snapshot truth and not presentation-only drift.";
  } else if (
    changedFiles.includes("specs/technical_spec.md") &&
    changedFiles.includes("specs/contracts.md") &&
    !changedFiles.includes("runtime/ui_snapshot.js") &&
    !changedFiles.includes("runtime/contracts.js")
  ) {
    suggestion =
      "Next smallest slice: implement the narrowest spec/contracts follow-through in runtime.";
  }

  return {
    name: "suggest_next_smallest_slice",
    ok: true,
    warnings: [],
    suggestion,
  };
}

module.exports = { suggestNextSmallestSlice };