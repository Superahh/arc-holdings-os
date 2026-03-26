"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runBootstrapAction } = require("../capital_bootstrap_cli");

test("parseArgs validates unknown and missing values", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--state-path"]), /Missing value/);
});

test("runBootstrapAction creates capital state and respects force flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cap-bootstrap-"));
  const statePath = path.join(tempDir, "capital_state.json");

  const created = runBootstrapAction({
    statePath,
    accountId: "arc-main-usd",
    now: "2026-03-26T10:00:00.000Z",
    force: false,
  });
  assert.equal(fs.existsSync(statePath), true);
  assert.equal(created.account_id, "arc-main-usd");

  assert.throws(
    () =>
      runBootstrapAction({
        statePath,
        accountId: "arc-main-usd",
        now: "2026-03-26T10:01:00.000Z",
        force: false,
      }),
    /already exists/
  );
});
