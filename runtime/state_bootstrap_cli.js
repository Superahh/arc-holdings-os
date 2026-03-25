"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createEmptyQueue, saveQueue } = require("./approval_queue");
const { createEmptyWorkflowState, saveWorkflowState } = require("./workflow_state");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    workflowStatePath: null,
    now: new Date().toISOString(),
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--force") {
      args.force = true;
    }
  }

  if (!args.queuePath && !args.workflowStatePath) {
    throw new Error("Provide at least one target: --queue-path and/or --workflow-state-path.");
  }
  if (Number.isNaN(Date.parse(args.now))) {
    throw new Error("Invalid --now value. Must be ISO-8601 datetime.");
  }
  return args;
}

function shouldWrite(filePath, force) {
  if (force) {
    return true;
  }
  return !fs.existsSync(filePath);
}

function runBootstrapAction(args) {
  const nowIso = new Date(args.now).toISOString();
  const result = {
    generated_at: nowIso,
    queue: null,
    workflow: null,
  };

  if (args.queuePath) {
    const queuePath = path.resolve(args.queuePath);
    const writeQueue = shouldWrite(queuePath, args.force);
    if (writeQueue) {
      const queue = createEmptyQueue(nowIso);
      const savedPath = saveQueue(queuePath, queue, nowIso);
      result.queue = {
        path: savedPath,
        action: "written",
      };
    } else {
      result.queue = {
        path: queuePath,
        action: "skipped_existing",
      };
    }
  }

  if (args.workflowStatePath) {
    const workflowPath = path.resolve(args.workflowStatePath);
    const writeWorkflow = shouldWrite(workflowPath, args.force);
    if (writeWorkflow) {
      const workflow = createEmptyWorkflowState(nowIso);
      const savedPath = saveWorkflowState(workflowPath, workflow, nowIso);
      result.workflow = {
        path: savedPath,
        action: "written",
      };
    } else {
      result.workflow = {
        path: workflowPath,
        action: "skipped_existing",
      };
    }
  }

  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runBootstrapAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runBootstrapAction,
  main,
};
