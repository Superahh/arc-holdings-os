"use strict";

const { parseArgs: parseStatusArgs, runStatusAction } = require("./ops_status_cli");

function parseArgs(argv) {
  const statusArgs = parseStatusArgs(argv);
  return {
    ...statusArgs,
    failOnOverdue: argv.includes("--fail-on-overdue"),
  };
}

function runAttentionAction(args) {
  const status = runStatusAction(args);
  const result =
    args.failOnOverdue && status.awaiting_tasks.overdue_count > 0 ? "fail_overdue_tasks" : "pass";

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
    result,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runAttentionAction(args);
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
  main,
};
