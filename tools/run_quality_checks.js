"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runCommand(command, args, cwd) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd,
    stdio: "inherit",
  });
  return {
    command: [process.execPath, command, ...args].join(" "),
    exit_code: Number.isInteger(result.status) ? result.status : 1,
  };
}

function runQualityChecks(rootDir) {
  const checks = [
    runCommand(path.join("runtime", "tests", "run_all_tests.js"), [], rootDir),
    runCommand(path.join("tools", "check_markdown_links.js"), ["--root", "."], rootDir),
  ];
  const failed = checks.find((check) => check.exit_code !== 0) || null;
  return {
    root: rootDir,
    checks,
    result: failed ? "fail" : "pass",
    failed_command: failed ? failed.command : null,
  };
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(args.root);
  const summary = runQualityChecks(rootDir);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.result !== "pass") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runQualityChecks,
  parseArgs,
  main,
};
