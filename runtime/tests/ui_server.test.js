"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { createUiServer } = require("../../ui/server");

function seedFixtureEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-server-"));
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
      ticket_id: "apr-ui-server-001",
      opportunity_id: output.opportunity_record.opportunity_id,
      action_type: "acquisition",
      requested_by: "CEO Agent",
      recommended_option: "request_more_info",
      decision_options: ["approve", "reject", "request_more_info"],
      max_exposure_usd: 460,
      reasoning_summary: "Review after remote verification evidence arrives.",
      risk_summary: "Carrier and IMEI checks remain open.",
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

function request(server, route) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: route,
        method: "GET",
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("createUiServer serves shell html and runtime snapshot endpoint", async () => {
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
    const htmlResponse = await request(server, "/");
    assert.equal(htmlResponse.statusCode, 200);
    assert.match(htmlResponse.headers["content-type"], /text\/html/);
    assert.match(htmlResponse.body, /Desktop Command Floor/);

    const snapshotResponse = await request(server, "/api/snapshot?now=2026-03-25T19:10:00.000Z");
    assert.equal(snapshotResponse.statusCode, 200);
    assert.match(snapshotResponse.headers["content-type"], /application\/json/);

    const snapshot = JSON.parse(snapshotResponse.body);
    assert.equal(snapshot.schema_version, "v1");
    assert.equal(snapshot.kpis.approvals_waiting, 1);
    assert.equal(snapshot.office.agent_status_cards[0].agent, "CEO Agent");
    assert.equal(snapshot.office.presence[0].zone_label, "Executive Suite");
    assert.equal(snapshot.office.presence[0].lane_stage, "verification");
    assert.equal(snapshot.office.handoff_signals[0].from_agent, "Valuation Agent");
    assert.match(snapshot.office.presence[1].bubble_text, /purchase recommendation remains blocked/i);
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
