"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, saveQueue } = require("../approval_queue");
const {
  createEmptyWorkflowState,
  saveWorkflowState,
  upsertFromPipeline,
  updateOpportunityStatus,
} = require("../workflow_state");
const { createUiServer } = require("../../ui/server");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
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

function createSendBackEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-send-back-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const capitalStatePath = path.join(tempDir, "capital_state.json");

  saveQueue(queuePath, createEmptyQueue("2026-04-01T16:00:00.000Z"), "2026-04-01T16:00:00.000Z");

  const fixture = loadFixture("rejection-scenario.json");
  const output = runOpportunityPipeline(fixture, "2026-04-01T16:00:00.000Z");
  const workflowState = createEmptyWorkflowState("2026-04-01T16:00:00.000Z");
  const seeded = upsertFromPipeline(
    workflowState,
    output,
    "pipeline_runner",
    "2026-04-01T16:00:00.000Z"
  );
  updateOpportunityStatus(
    workflowState,
    seeded.opportunity_id,
    "approved",
    "owner_operator",
    "Approved before operator send-back.",
    "2026-04-01T16:10:00.000Z"
  );
  saveWorkflowState(workflowStatePath, workflowState, "2026-04-01T16:10:00.000Z");
  writeRunArtifact(baseDir, buildRunArtifact(fixture, output, "2026-04-01T16:00:00.000Z"));

  return {
    baseDir,
    queuePath,
    workflowStatePath,
    capitalStatePath,
    opportunityId: seeded.opportunity_id,
  };
}

test("createUiServer persists non-approval send-back for supported states", async () => {
  const env = createSendBackEnvironment();
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
    const sendBackResponse = await request(server, "/api/opportunity-send-back", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        opportunity_id: env.opportunityId,
        reason: "Waiting on IMEI proof before we proceed.",
        actor: "owner_operator",
      }),
    });
    assert.equal(sendBackResponse.statusCode, 200);
    const sendBackPayload = JSON.parse(sendBackResponse.body);
    assert.equal(sendBackPayload.ok, true);
    assert.equal(sendBackPayload.result.current_status, "awaiting_seller_verification");
    assert.equal(
      sendBackPayload.result.seller_verification.request_message,
      "Waiting on IMEI proof before we proceed."
    );

    const snapshotResponse = await request(server, "/api/snapshot?now=2026-04-01T16:20:00.000Z");
    assert.equal(snapshotResponse.statusCode, 200);
    const snapshot = JSON.parse(snapshotResponse.body);
    const updatedOpportunity = snapshot.workflow.opportunities.find(
      (entry) => entry.opportunity_id === env.opportunityId
    );
    assert.ok(updatedOpportunity);
    assert.equal(updatedOpportunity.current_status, "awaiting_seller_verification");
    assert.equal(
      updatedOpportunity.workflow_record.seller_verification.request_message,
      "Waiting on IMEI proof before we proceed."
    );
    assert.match(updatedOpportunity.operational_next.owner || "", /risk|compliance/i);
    assert.equal(updatedOpportunity.operational_next.state, "waiting");
    assert.equal(
      typeof updatedOpportunity.operational_next.waiting_on === "string" &&
        updatedOpportunity.operational_next.waiting_on.length > 0,
      true
    );
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

test("createUiServer defers non-approval send-back for unsupported downstream states", async () => {
  const env = createSendBackEnvironment();
  const workflowState = createEmptyWorkflowState("2026-04-01T16:00:00.000Z");
  const fixture = loadFixture("rejection-scenario.json");
  const output = runOpportunityPipeline(fixture, "2026-04-01T16:00:00.000Z");
  const seeded = upsertFromPipeline(workflowState, output, "pipeline_runner", "2026-04-01T16:00:00.000Z");
  updateOpportunityStatus(
    workflowState,
    seeded.opportunity_id,
    "approved",
    "owner_operator",
    "Approved before routing.",
    "2026-04-01T16:10:00.000Z"
  );
  updateOpportunityStatus(
    workflowState,
    seeded.opportunity_id,
    "acquired",
    "owner_operator",
    "Acquired before routing.",
    "2026-04-01T16:20:00.000Z"
  );
  updateOpportunityStatus(
    workflowState,
    seeded.opportunity_id,
    "routed",
    "owner_operator",
    "Routed before send-back attempt.",
    "2026-04-01T16:30:00.000Z"
  );
  saveWorkflowState(env.workflowStatePath, workflowState, "2026-04-01T16:30:00.000Z");

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
    const sendBackResponse = await request(server, "/api/opportunity-send-back", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        opportunity_id: seeded.opportunity_id,
        reason: "Need new seller proof before moving further.",
        actor: "owner_operator",
      }),
    });
    assert.equal(sendBackResponse.statusCode, 409);
    const payload = JSON.parse(sendBackResponse.body);
    assert.equal(payload.error, "send_back_conflict");
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
