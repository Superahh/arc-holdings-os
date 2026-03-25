"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getTestFiles, runAllTests, parseArgs } = require("./run_all_tests");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "arc-run-all-tests-"));
}

test("parseArgs supports --tests-dir and rejects unknown args", () => {
  const parsed = parseArgs(["--tests-dir", "runtime/tests"]);
  assert.equal(parsed.testsDir, "runtime/tests");
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
});

test("getTestFiles returns sorted .test.js files only", () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(path.join(tempDir, "b.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempDir, "a.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempDir, "notes.md"), "", "utf8");

  const files = getTestFiles(tempDir).map((filePath) => path.basename(filePath));
  assert.deepEqual(files, ["a.test.js", "b.test.js"]);
});

test("runAllTests executes files in order and stops on first failure", () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(path.join(tempDir, "a.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempDir, "b.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempDir, "c.test.js"), "", "utf8");

  const calls = [];
  const summary = runAllTests({
    testsDir: tempDir,
    output: { write: () => {} },
    executor: (filePath) => {
      const name = path.basename(filePath);
      calls.push(name);
      return { status: name === "b.test.js" ? 1 : 0 };
    },
  });

  assert.deepEqual(calls, ["a.test.js", "b.test.js"]);
  assert.equal(summary.total, 3);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed_test, "b.test.js");
  assert.equal(summary.exit_code, 1);
});

test("runAllTests returns success summary when all tests pass", () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(path.join(tempDir, "a.test.js"), "", "utf8");
  fs.writeFileSync(path.join(tempDir, "b.test.js"), "", "utf8");

  const summary = runAllTests({
    testsDir: tempDir,
    output: { write: () => {} },
    executor: () => ({ status: 0 }),
  });

  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed_test, null);
  assert.equal(summary.exit_code, 0);
});
