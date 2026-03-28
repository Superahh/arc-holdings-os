"use strict";

function generateChangeSummary({ changedFiles }) {
  const summary = {
    specs: changedFiles.filter((f) => f.startsWith("specs/")),
    runtime: changedFiles.filter((f) => f.startsWith("runtime/")),
    ui: changedFiles.filter((f) => f.startsWith("ui/")),
    tests: changedFiles.filter((f) => f.startsWith("runtime/tests/")),
    other: changedFiles.filter(
      (f) =>
        !f.startsWith("specs/") &&
        !f.startsWith("runtime/") &&
        !f.startsWith("ui/")
    ),
  };

  const lines = [];
  lines.push("Change summary:");
  for (const [group, files] of Object.entries(summary)) {
    if (!files.length) {
      continue;
    }
    lines.push(`- ${group}:`);
    for (const file of files) {
      lines.push(`  - ${file}`);
    }
  }

  return {
    name: "generate_change_summary",
    ok: true,
    warnings: [],
    summaryText: lines.join("\n"),
  };
}

module.exports = { generateChangeSummary };