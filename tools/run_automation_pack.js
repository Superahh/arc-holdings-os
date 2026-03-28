"use strict";

const { getChangedFiles, getDiff, getCurrentBranch } = require("./automation/git_utils");
const { checkSpecDrift } = require("./automation/check_spec_drift");
const { checkScopeGuardrails } = require("./automation/check_scope_guardrails");
const { checkChangedTests } = require("./automation/check_changed_tests");
const { generateChangeSummary } = require("./automation/generate_change_summary");
const { suggestNextSmallestSlice } = require("./automation/suggest_next_smallest_slice");

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  const changedFiles = getChangedFiles();
  const diffText = getDiff();
  const branch = getCurrentBranch();

  printSection("Automation Pack v1");
  console.log(`Branch: ${branch}`);
  console.log(`Staged files: ${changedFiles.length}`);

  if (!changedFiles.length) {
    console.log("No staged changes found.");
    process.exit(0);
  }

  const context = { changedFiles, diffText };

  const results = [
    generateChangeSummary(context),
    checkSpecDrift(context),
    checkScopeGuardrails(context),
    checkChangedTests(context),
    suggestNextSmallestSlice(context),
  ];

  for (const result of results) {
    printSection(result.name);

    if (result.summaryText) {
      console.log(result.summaryText);
    }

    if (result.suggestion) {
      console.log(result.suggestion);
    }

    if (result.warnings && result.warnings.length) {
      for (const warning of result.warnings) {
        console.log(`WARN: ${warning}`);
      }
    } else if (!result.summaryText && !result.suggestion) {
      console.log("OK");
    }
  }

  const blockingFailures = results.filter(
    (result) =>
      ["check_spec_drift", "check_changed_tests"].includes(result.name) &&
      !result.ok
  );

  printSection("Result");
  if (blockingFailures.length) {
    console.log("Automation pack found issues worth reviewing before commit.");
    process.exit(1);
  }

  console.log("Automation pack passed.");
}

main();