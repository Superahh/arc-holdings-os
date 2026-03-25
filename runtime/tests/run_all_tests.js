"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function getTestFiles(testsDir) {
  const absoluteDir = path.resolve(testsDir);
  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Tests directory not found: ${absoluteDir}`);
  }

  return fs
    .readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith(".test.js"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => path.join(absoluteDir, entry));
}

function defaultExecutor(testFilePath) {
  return spawnSync(process.execPath, [testFilePath], {
    stdio: "inherit",
  });
}

function runAllTests(options = {}) {
  const testsDir = options.testsDir || __dirname;
  const executor = options.executor || defaultExecutor;
  const output = options.output || process.stdout;
  const files = getTestFiles(testsDir);

  let passed = 0;
  for (const filePath of files) {
    output.write(`Running ${path.basename(filePath)}\n`);
    const result = executor(filePath);
    const exitCode = result && Number.isInteger(result.status) ? result.status : 1;
    if (exitCode !== 0 || (result && result.error)) {
      return {
        total: files.length,
        passed,
        failed_test: path.basename(filePath),
        exit_code: exitCode,
      };
    }
    passed += 1;
  }

  return {
    total: files.length,
    passed,
    failed_test: null,
    exit_code: 0,
  };
}

function parseArgs(argv) {
  const args = {
    testsDir: __dirname,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--tests-dir") {
      args.testsDir = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = runAllTests({ testsDir: args.testsDir });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.exit_code !== 0) {
    process.exitCode = summary.exit_code;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getTestFiles,
  runAllTests,
  parseArgs,
  main,
};
