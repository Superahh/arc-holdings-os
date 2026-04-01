"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { createEmptyQueue, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, saveWorkflowState } = require("../workflow_state");
const { createUiServer } = require("../../ui/server");

function createEmptyServerEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-intake-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const capitalStatePath = path.join(tempDir, "capital_state.json");

  saveQueue(queuePath, createEmptyQueue("2026-04-01T14:00:00.000Z"), "2026-04-01T14:00:00.000Z");
  saveWorkflowState(
    workflowStatePath,
    createEmptyWorkflowState("2026-04-01T14:00:00.000Z"),
    "2026-04-01T14:00:00.000Z"
  );

  return {
    baseDir,
    queuePath,
    workflowStatePath,
    capitalStatePath,
  };
}

function request(server, route, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: route,
        method: options.method || "GET",
        headers: options.headers || {},
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
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("createUiServer persists operator intake and exposes it through snapshot", async () => {
  const env = createEmptyServerEnvironment();
  const server = createUiServer({
    rootDir: path.join(__dirname, "..", "..", "ui"),
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const intakeResponse = await request(server, "/api/opportunity-intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "Pixel 8 Pro 128GB, small frame dent, boots to home screen",
        source: "owner_referral",
        ask_price_usd: 340,
        note: "Operator wants quick screen and carrier review.",
        actor: "owner_operator",
      }),
    });
    assert.equal(intakeResponse.statusCode, 200);
    const intakePayload = JSON.parse(intakeResponse.body);
    assert.equal(intakePayload.ok, true);
    assert.equal(intakePayload.result.current_status, "researching");
    assert.match(intakePayload.result.opportunity_id, /^opp-202/i);

    const snapshotResponse = await request(server, "/api/snapshot?now=2026-04-01T14:10:00.000Z");
    assert.equal(snapshotResponse.statusCode, 200);
    const snapshot = JSON.parse(snapshotResponse.body);
    const createdOpportunity = snapshot.workflow.opportunities.find(
      (entry) => entry.opportunity_id === intakePayload.result.opportunity_id
    );
    assert.ok(createdOpportunity);
    assert.equal(createdOpportunity.current_status, "researching");
    assert.equal(createdOpportunity.source, "owner_referral");
    assert.equal(
      createdOpportunity.contract_bundle.opportunity_record.device_summary,
      "Pixel 8 Pro 128GB, small frame dent, boots to home screen"
    );
    assert.equal(createdOpportunity.contract_bundle.opportunity_record.ask_price_usd, 340);
    assert.equal(createdOpportunity.latest_artifact !== null, true);
    assert.equal(fs.existsSync(intakePayload.result.artifact_path), true);

    const invalidResponse = await request(server, "/api/opportunity-intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "Missing ask price intake",
        source: "manual_entry",
      }),
    });
    assert.equal(invalidResponse.statusCode, 400);
    const invalidPayload = JSON.parse(invalidResponse.body);
    assert.equal(invalidPayload.error, "invalid_request");
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
