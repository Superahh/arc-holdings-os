"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runOpportunityPipeline } = require("./pipeline");
const {
  buildRunArtifact,
  writeRunArtifact,
  writeSnapshot,
  compareWithSnapshot,
} = require("./output");
const { loadQueue, enqueueApprovalTicket, saveQueue } = require("./approval_queue");

function parseArgs(argv) {
  const args = {
    fixture: null,
    now: new Date().toISOString(),
    baseDir: path.join(__dirname, "output"),
    queuePath: null,
    queueActor: "pipeline_runner",
    updateSnapshot: false,
    checkSnapshot: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fixture") {
      args.fixture = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--queue-actor") {
      args.queueActor = argv[i + 1];
      i += 1;
    } else if (token === "--update-snapshot") {
      args.updateSnapshot = true;
    } else if (token === "--check-snapshot") {
      args.checkSnapshot = true;
    }
  }

  if (!args.fixture) {
    throw new Error("Missing required argument: --fixture <path-to-json>");
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = path.resolve(args.fixture);
  const baseOutputDir = path.resolve(args.baseDir);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  const output = runOpportunityPipeline(fixture, args.now);
  const artifact = buildRunArtifact(fixture, output, args.now);
  const artifactPath = writeRunArtifact(baseOutputDir, artifact);

  let snapshotPath = null;
  if (args.updateSnapshot) {
    snapshotPath = writeSnapshot(baseOutputDir, artifact);
  }

  let snapshotResult = null;
  if (args.checkSnapshot) {
    snapshotResult = compareWithSnapshot(baseOutputDir, artifact);
    if (!snapshotResult.matches) {
      process.exitCode = 1;
    }
  }

  let queueResult = null;
  if (args.queuePath) {
    const queue = loadQueue(args.queuePath);
    if (artifact.output.approval_ticket) {
      enqueueApprovalTicket(queue, artifact.output.approval_ticket, args.queueActor, args.now);
      const savedPath = saveQueue(args.queuePath, queue, args.now);
      queueResult = {
        queue_path: savedPath,
        enqueued_ticket_id: artifact.output.approval_ticket.ticket_id,
        pending_count: queue.items.filter((item) => item.status === "pending").length,
      };
    } else {
      queueResult = {
        queue_path: path.resolve(args.queuePath),
        enqueued_ticket_id: null,
        pending_count: queue.items.filter((item) => item.status === "pending").length,
        note: "No approval ticket generated; queue unchanged.",
      };
    }
  }

  const summary = {
    artifact_path: artifactPath,
    snapshot_path: snapshotPath,
    snapshot_result: snapshotResult,
    queue_result: queueResult,
    opportunity_id: artifact.opportunity_id,
    recommendation: artifact.output.opportunity_record.recommendation,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  main,
};
