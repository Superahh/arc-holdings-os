"use strict";

const path = require("node:path");

const REPO_ROOT = process.cwd();

module.exports = {
  repoName: "arc-holdings-os",
  repoRoot: REPO_ROOT,

  specFiles: [
    "specs/technical_spec.md",
    "specs/contracts.md",
  ],

  testDirectories: [
    "runtime/tests",
  ],

  behaviorDirectories: [
    "runtime",
    "ui",
  ],

  advisoryFiles: [
    "runtime/ui_snapshot.js",
    "runtime/contracts.js",
    "ui/app.js",
  ],

  protectedConcepts: [
    "capital_fit",
    "capital_strategy",
    "board_history",
    "approval_queue",
    "movement_intents",
    "company_board_snapshot",
  ],

  riskyTerms: [
    "ranking",
    "scoring",
    "route automatically",
    "routing change",
    "autonomous",
    "money movement",
    "bypass approval",
    "auto-approve",
    "capital allocation",
    "execute capital",
    "hidden weighting",
  ],

  likelySpecTriggers: [
    "contract",
    "snapshot",
    "capital_fit",
    "capital_strategy",
    "board_history",
    "movement_intents",
    "office events",
    "room transition",
  ],

  fileGroups: {
    capitalStrategy: [
      "specs/technical_spec.md",
      "specs/contracts.md",
      "runtime/contracts.js",
      "runtime/ui_snapshot.js",
      "runtime/tests/contracts_office.test.js",
      "runtime/tests/ui_snapshot.test.js",
      "ui/app.js",
    ],
  },

  pathMatches(changedFiles, targetPath) {
    return changedFiles.some((file) => file === targetPath);
  },

  pathStartsWith(changedFiles, prefix) {
    return changedFiles.some((file) => file.startsWith(prefix));
  },

  anyBehaviorChanged(changedFiles) {
    return changedFiles.some(
      (file) =>
        file.startsWith("runtime/") ||
        file.startsWith("ui/")
    );
  },

  anyTestsChanged(changedFiles) {
    return changedFiles.some((file) => file.startsWith("runtime/tests/"));
  },

  anySpecsChanged(changedFiles) {
    return changedFiles.some(
      (file) =>
        file === "specs/technical_spec.md" ||
        file === "specs/contracts.md"
    );
  },

  normalizePath(inputPath) {
    return inputPath.split(path.sep).join("/");
  },
};

