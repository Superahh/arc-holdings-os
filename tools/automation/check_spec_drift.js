"use strict";

const config = require("./config");

function checkSpecDrift({ changedFiles, diffText }) {
  const behaviorChanged = config.anyBehaviorChanged(changedFiles);
  const specsChanged = config.anySpecsChanged(changedFiles);

  const touchesLikelySpecConcept = config.likelySpecTriggers.some((term) =>
    diffText.toLowerCase().includes(term.toLowerCase())
  );

  const warnings = [];

  if (behaviorChanged && touchesLikelySpecConcept && !specsChanged) {
    warnings.push(
      "Behavior/runtime/UI changes appear to touch spec-level concepts, but no spec files were updated."
    );
  }

  if (
    changedFiles.includes("runtime/contracts.js") &&
    !changedFiles.includes("specs/contracts.md")
  ) {
    warnings.push(
      "runtime/contracts.js changed without specs/contracts.md changing."
    );
  }

  if (
    changedFiles.includes("runtime/ui_snapshot.js") &&
    !changedFiles.includes("specs/technical_spec.md")
  ) {
    warnings.push(
      "runtime/ui_snapshot.js changed without specs/technical_spec.md changing."
    );
  }

  return {
    name: "check_spec_drift",
    ok: warnings.length === 0,
    warnings,
  };
}

module.exports = { checkSpecDrift };