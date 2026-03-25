"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseArgs: parseStatusArgs, runStatusAction } = require("./ops_status_cli");

function parseArgs(argv) {
  const statusArgs = parseStatusArgs(argv);
  let nudgeLimit = 5;
  let outputPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--nudge-limit") {
      nudgeLimit = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--output") {
      outputPath = argv[i + 1];
      i += 1;
    }
  }
  if (!Number.isInteger(nudgeLimit) || nudgeLimit <= 0) {
    throw new Error("--nudge-limit must be a positive integer.");
  }
  return {
    ...statusArgs,
    failOnOverdue: argv.includes("--fail-on-overdue"),
    nudgeLimit,
    outputPath,
  };
}

function runAttentionAction(args) {
  const status = runStatusAction(args);
  const result =
    args.failOnOverdue && status.awaiting_tasks.overdue_count > 0 ? "fail_overdue_tasks" : "pass";
  const nudges = status.awaiting_tasks.tasks
    .filter((task) => task.urgency === "overdue" || task.urgency === "due_soon")
    .slice(0, args.nudgeLimit)
    .map((task) => ({
      severity: task.urgency === "overdue" ? "high" : "medium",
      opportunity_id: task.opportunity_id,
      owner: task.owner,
      urgency: task.urgency,
      due_by: task.due_by,
      minutes_to_due: task.minutes_to_due,
      message: `${task.owner}: ${task.next_action}`,
    }));

  return {
    schema_version: "v1",
    generated_at: status.generated_at,
    queue_health: status.queue.health.observations.queue_health,
    workflow_health: status.workflow ? status.workflow.health.observations.workflow_health : null,
    awaiting_tasks: {
      total_count: status.awaiting_tasks.total_count,
      returned_count: status.awaiting_tasks.returned_count,
      due_soon_count: status.awaiting_tasks.due_soon_count,
      overdue_count: status.awaiting_tasks.overdue_count,
      urgency_counts: status.awaiting_tasks.urgency_counts,
    },
    attention: status.attention,
    nudges,
    result,
  };
}

function writeAttentionOutput(outputPath, result) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return absolutePath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runAttentionAction(args);
  if (args.outputPath) {
    writeAttentionOutput(args.outputPath, result);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.result !== "pass") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runAttentionAction,
  writeAttentionOutput,
  main,
};
