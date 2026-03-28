"use strict";

const { execSync } = require("node:child_process");

function runGit(command) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getChangedFiles() {
  const output = runGit("git diff --name-only --cached");
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getDiff() {
  return runGit("git diff --cached --unified=0");
}

function getCurrentBranch() {
  return runGit("git rev-parse --abbrev-ref HEAD");
}

module.exports = {
  getChangedFiles,
  getDiff,
  getCurrentBranch,
};