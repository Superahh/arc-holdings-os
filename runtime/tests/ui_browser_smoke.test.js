"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { createUiServer } = require("../../ui/server");

function seedFixtureEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-browser-smoke-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  enqueueApprovalTicket(
    queue,
    {
      ticket_id: "apr-ui-browser-001",
      opportunity_id: output.opportunity_record.opportunity_id,
      action_type: "acquisition",
      requested_by: "CEO Agent",
      recommended_option: "request_more_info",
      decision_options: ["approve", "reject", "request_more_info"],
      max_exposure_usd: 460,
      reasoning_summary: "Hold capital until verification clears.",
      risk_summary: "IMEI and carrier verification remain open.",
      required_by: "2026-03-25T21:00:00.000Z",
    },
    "pipeline_runner",
    "2026-03-25T19:02:00.000Z"
  );
  saveQueue(queuePath, queue, "2026-03-25T19:02:00.000Z");

  const workflowState = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  upsertFromPipeline(workflowState, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");
  saveWorkflowState(workflowStatePath, workflowState, "2026-03-25T19:00:00.000Z");

  writeRunArtifact(baseDir, buildRunArtifact(fixture, output, "2026-03-25T19:00:00.000Z"));

  return {
    baseDir,
    queuePath,
    workflowStatePath,
  };
}

function resolveBrowserBinary() {
  const candidates = [
    process.env.ARC_UI_SMOKE_BROWSER || null,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function dumpDomWithHeadlessBrowser(browserPath, url) {
  const attempts = [
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--virtual-time-budget=10000",
      "--dump-dom",
      url,
    ],
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--virtual-time-budget=10000",
      "--dump-dom",
      url,
    ],
  ];

  let lastFailure = null;
  for (const args of attempts) {
    const result = spawnSync(browserPath, args, {
      encoding: "utf8",
      timeout: 45000,
    });
    const stdout = result.stdout || "";
    if (result.status === 0 && /<html/i.test(stdout)) {
      return { ok: true, dom: stdout };
    }
    const spawnError = result.error && result.error.message ? result.error.message : "";
    lastFailure = `status=${result.status ?? "unknown"} error=${spawnError} stderr=${(result.stderr || "").trim()}`;
  }
  return {
    ok: false,
    error: lastFailure || "Unknown browser execution failure.",
  };
}

test("headless browser smoke renders the live UI shell from runtime snapshot", async (t) => {
  const browserPath = resolveBrowserBinary();
  if (!browserPath) {
    t.skip("No local Edge/Chrome binary found for browser smoke test.");
    return;
  }

  const env = seedFixtureEnvironment();
  const server = createUiServer({
    rootDir: path.join(__dirname, "..", "..", "ui"),
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/`;
    const result = dumpDomWithHeadlessBrowser(browserPath, url);
    if (!result.ok) {
      t.skip(`Headless browser smoke execution unavailable: ${result.error}`);
      return;
    }

    assert.match(result.dom, /Desktop Command Floor/);
    assert.match(result.dom, /Operations floor/);
    assert.match(result.dom, /opp-2026-03-25-001/);
    assert.match(result.dom, /zone-network-svg/);
    assert.match(result.dom, /handoff-overlay/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
