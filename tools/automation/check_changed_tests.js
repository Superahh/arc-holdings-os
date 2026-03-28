"use strict";

function checkChangedTests({ changedFiles }) {
  const warnings = [];

  const touchedCoreFiles = [
    "runtime/contracts.js",
    "runtime/ui_snapshot.js",
    "ui/app.js",
  ].filter((file) => changedFiles.includes(file));

  const testsChanged = changedFiles.some((file) =>
    file.startsWith("runtime/tests/")
  );

  if (touchedCoreFiles.length > 0 && !testsChanged) {
    warnings.push(
      `Core runtime/UI files changed (${touchedCoreFiles.join(", ")}) but no runtime tests changed.`
    );
  }

  if (
    changedFiles.includes("runtime/contracts.js") &&
    !changedFiles.includes("runtime/tests/contracts_office.test.js")
  ) {
    warnings.push(
      "runtime/contracts.js changed without runtime/tests/contracts_office.test.js changing."
    );
  }

  if (
    changedFiles.includes("runtime/ui_snapshot.js") &&
    !changedFiles.includes("runtime/tests/ui_snapshot.test.js")
  ) {
    warnings.push(
      "runtime/ui_snapshot.js changed without runtime/tests/ui_snapshot.test.js changing."
    );
  }

  return {
    name: "check_changed_tests",
    ok: warnings.length === 0,
    warnings,
  };
}

module.exports = { checkChangedTests };