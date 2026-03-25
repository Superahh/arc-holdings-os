"use strict";

const path = require("node:path");

const { loadWorkflowState } = require("./workflow_state");
const { writeTimelineArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    statePath: null,
    baseDir: path.join(__dirname, "output"),
    opportunityId: null,
    limit: 50,
    now: new Date().toISOString(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--state-path") {
      args.statePath = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = argv[i + 1];
      i += 1;
    } else if (token === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    }
  }

  if (!args.statePath) {
    throw new Error("Missing required argument: --state-path <path-to-workflow-state-json>");
  }
  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  if (Number.isNaN(Date.parse(args.now))) {
    throw new Error("Invalid --now value. Must be ISO-8601 datetime.");
  }
  return args;
}

function toTimeMs(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function runWorkflowReplayAction(args) {
  const statePath = path.resolve(args.statePath);
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const state = loadWorkflowState(statePath);

  let events = [...state.event_log];
  if (args.opportunityId) {
    events = events.filter((event) => event.opportunity_id === args.opportunityId);
  }

  events.sort((a, b) => toTimeMs(a.timestamp) - toTimeMs(b.timestamp));
  const includedEvents = events.slice(-args.limit);

  const timelineArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: `${path.basename(statePath, path.extname(statePath))}_workflow`,
    source_workflow_state_path: statePath,
    filters: {
      opportunity_id: args.opportunityId,
      limit: args.limit,
    },
    total_events: events.length,
    included_events: includedEvents.length,
    events: includedEvents,
  };
  const timelinePath = writeTimelineArtifact(baseDir, timelineArtifact);

  return {
    state_path: statePath,
    timeline_artifact_path: timelinePath,
    total_events: events.length,
    included_events: includedEvents.length,
    opportunity_id: args.opportunityId,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runWorkflowReplayAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runWorkflowReplayAction,
  main,
};
