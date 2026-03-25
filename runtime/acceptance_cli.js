"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runOpportunityPipeline } = require("./pipeline");
const {
  validateOpportunityRecord,
  validateApprovalTicket,
  validateHandoffPacket,
  validateAgentStatusCard,
  validateCompanyBoardSnapshot,
} = require("./contracts");
const { createEmptyQueue, enqueueApprovalTicket, decideApproval } = require("./approval_queue");
const { buildDecisionOfficeState } = require("./decision_state");
const { createEmptyWorkflowState, upsertFromPipeline, applyDecisionToOpportunity } = require("./workflow_state");

function parseArgs(argv) {
  const args = {
    goldenFixture: path.join(__dirname, "fixtures", "golden-scenario.json"),
    rejectionFixture: path.join(__dirname, "fixtures", "rejection-scenario.json"),
    nowGolden: "2026-03-25T19:20:00.000Z",
    nowRejection: "2026-03-26T15:15:00.000Z",
    outputPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--golden-fixture") {
      args.goldenFixture = argv[i + 1];
      i += 1;
    } else if (token === "--rejection-fixture") {
      args.rejectionFixture = argv[i + 1];
      i += 1;
    } else if (token === "--now-golden") {
      args.nowGolden = argv[i + 1];
      i += 1;
    } else if (token === "--now-rejection") {
      args.nowRejection = argv[i + 1];
      i += 1;
    } else if (token === "--output") {
      args.outputPath = argv[i + 1];
      i += 1;
    }
  }

  if (Number.isNaN(Date.parse(args.nowGolden))) {
    throw new Error("Invalid --now-golden value. Must be ISO-8601 datetime.");
  }
  if (Number.isNaN(Date.parse(args.nowRejection))) {
    throw new Error("Invalid --now-rejection value. Must be ISO-8601 datetime.");
  }

  return args;
}

function readFixture(fixturePath) {
  const absolute = path.resolve(fixturePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Fixture not found: ${absolute}`);
  }
  return {
    path: absolute,
    input: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

function pushCheck(checks, id, ok, detail) {
  checks.push({
    id,
    pass: Boolean(ok),
    detail,
  });
}

function pushContractChecks(checks, prefix, output) {
  pushCheck(
    checks,
    `${prefix}.OpportunityRecord`,
    validateOpportunityRecord(output.opportunity_record).length === 0,
    "OpportunityRecord contract validation."
  );
  pushCheck(
    checks,
    `${prefix}.HandoffPacket`,
    validateHandoffPacket(output.handoff_packet).length === 0,
    "HandoffPacket contract validation."
  );
  pushCheck(
    checks,
    `${prefix}.AgentStatusCards`,
    output.agent_status_cards.every((card) => validateAgentStatusCard(card).length === 0),
    "AgentStatusCard[] contract validation."
  );
  pushCheck(
    checks,
    `${prefix}.CompanyBoardSnapshot`,
    validateCompanyBoardSnapshot(output.company_board_snapshot).length === 0,
    "CompanyBoardSnapshot contract validation."
  );
  pushCheck(
    checks,
    `${prefix}.ApprovalTicket`,
    validateApprovalTicket(output.approval_ticket).length === 0,
    "ApprovalTicket contract validation (null allowed)."
  );
}

function runAcceptanceAction(args) {
  const checks = [];
  const workflowState = createEmptyWorkflowState(args.nowGolden);

  const golden = readFixture(args.goldenFixture);
  const goldenOutput = runOpportunityPipeline(golden.input, new Date(args.nowGolden).toISOString());
  const goldenWorkflow = upsertFromPipeline(workflowState, goldenOutput, "acceptance_cli", args.nowGolden);
  pushContractChecks(checks, "golden", goldenOutput);
  pushCheck(
    checks,
    "golden.request_more_info",
    goldenOutput.opportunity_record.recommendation === "request_more_info",
    "Golden scenario should require more information."
  );
  pushCheck(
    checks,
    "golden.no_approval_ticket",
    goldenOutput.approval_ticket === null,
    "Golden scenario should not create ApprovalTicket before verification."
  );
  pushCheck(
    checks,
    "golden.workflow_researching",
    goldenWorkflow.current_status === "researching",
    "Golden scenario should map to researching lifecycle status."
  );

  const rejection = readFixture(args.rejectionFixture);
  const rejectionOutput = runOpportunityPipeline(rejection.input, new Date(args.nowRejection).toISOString());
  const rejectionWorkflow = upsertFromPipeline(
    workflowState,
    rejectionOutput,
    "acceptance_cli",
    args.nowRejection
  );
  pushContractChecks(checks, "rejection", rejectionOutput);
  pushCheck(
    checks,
    "rejection.acquire_recommendation",
    rejectionOutput.opportunity_record.recommendation === "acquire",
    "Rejection drill should begin with an acquisition recommendation."
  );
  pushCheck(
    checks,
    "rejection.has_approval_ticket",
    Boolean(rejectionOutput.approval_ticket),
    "Rejection drill must produce ApprovalTicket before decision."
  );
  pushCheck(
    checks,
    "rejection.workflow_awaiting_approval",
    rejectionWorkflow.current_status === "awaiting_approval",
    "Rejection drill should map to awaiting_approval before decision."
  );

  if (rejectionOutput.approval_ticket) {
    const queue = createEmptyQueue(args.nowRejection);
    enqueueApprovalTicket(queue, rejectionOutput.approval_ticket, "acceptance_cli", args.nowRejection);
    decideApproval(
      queue,
      rejectionOutput.approval_ticket.ticket_id,
      "reject",
      "owner_operator",
      "Acceptance drill rejection.",
      args.nowRejection
    );
    const decidedItem = queue.items.find((item) => item.ticket_id === rejectionOutput.approval_ticket.ticket_id);
    const office = buildDecisionOfficeState(queue, decidedItem, new Date(args.nowRejection).toISOString());

    pushCheck(
      checks,
      "rejection.queue_reject_count",
      office.queue_counts.reject === 1 && office.queue_counts.pending === 0,
      "Queue counts should show one rejection and zero pending."
    );
    pushCheck(
      checks,
      "rejection.rejection_alert",
      office.company_board_snapshot.alerts.includes("Decision rejected; validate pipeline assumptions."),
      "Rejection alert should be present in board snapshot."
    );
    pushCheck(
      checks,
      "rejection.capital_note",
      office.company_board_snapshot.capital_note === "No newly approved spend from this decision.",
      "Capital note should indicate no newly approved spend."
    );

    const rejectedWorkflow = applyDecisionToOpportunity(
      workflowState,
      rejectionOutput.approval_ticket.ticket_id,
      "reject",
      "owner_operator",
      args.nowRejection,
      rejectionOutput.opportunity_record.opportunity_id
    );
    pushCheck(
      checks,
      "rejection.workflow_rejected",
      rejectedWorkflow.current_status === "rejected",
      "Rejection decision should set workflow lifecycle status to rejected."
    );
  }

  const passCount = checks.filter((check) => check.pass).length;
  const failCount = checks.length - passCount;
  const report = {
    schema_version: "v1",
    generated_at: new Date().toISOString(),
    fixtures: {
      golden: golden.path,
      rejection: rejection.path,
    },
    checks,
    summary: {
      total: checks.length,
      pass_count: passCount,
      fail_count: failCount,
      result: failCount === 0 ? "pass" : "fail",
    },
  };

  if (args.outputPath) {
    const absoluteOutput = path.resolve(args.outputPath);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.output_path = absoluteOutput;
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = runAcceptanceAction(args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.result !== "pass") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runAcceptanceAction,
  main,
};
