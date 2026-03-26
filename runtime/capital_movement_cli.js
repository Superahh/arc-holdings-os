"use strict";

const path = require("node:path");

const {
  MOVEMENT_ACTIONS,
  loadCapitalState,
  saveCapitalState,
  submitAndExecuteMovement,
  verifyLedgerIntegrity,
} = require("./capital_state");

function parseArgs(argv) {
  const args = {
    statePath: path.resolve(__dirname, "state", "capital_state.json"),
    action: null,
    amountUsd: null,
    requestedBy: null,
    performedBy: null,
    authorizedBy: null,
    reason: null,
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: new Date().toISOString(),
  };

  function readValue(index, optionName) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${optionName}`);
    }
    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--state-path") {
      args.statePath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--action") {
      args.action = readValue(index, token);
      index += 1;
    } else if (token === "--amount-usd") {
      args.amountUsd = Number.parseFloat(readValue(index, token));
      index += 1;
    } else if (token === "--requested-by") {
      args.requestedBy = readValue(index, token);
      index += 1;
    } else if (token === "--performed-by") {
      args.performedBy = readValue(index, token);
      index += 1;
    } else if (token === "--authorized-by") {
      args.authorizedBy = readValue(index, token);
      index += 1;
    } else if (token === "--reason") {
      args.reason = readValue(index, token);
      index += 1;
    } else if (token === "--notes") {
      args.notes = readValue(index, token);
      index += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = readValue(index, token);
      index += 1;
    } else if (token === "--approval-ticket-id") {
      args.approvalTicketId = readValue(index, token);
      index += 1;
    } else if (token === "--request-id") {
      args.requestId = readValue(index, token);
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.action || !MOVEMENT_ACTIONS.has(args.action)) {
    throw new Error("action must be one of deposit|reserve|release_reserve|approve_use|withdraw|adjustment.");
  }
  if (!Number.isFinite(args.amountUsd) || args.amountUsd <= 0) {
    throw new Error("--amount-usd must be a positive number.");
  }
  for (const required of ["requestedBy", "performedBy", "authorizedBy", "reason"]) {
    if (!args[required] || !String(args[required]).trim()) {
      throw new Error(`--${required.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)} is required.`);
    }
  }
  if ((args.action === "reserve" || args.action === "release_reserve" || args.action === "approve_use") && !args.opportunityId) {
    throw new Error(`--opportunity-id is required for action ${args.action}.`);
  }

  return args;
}

function runMovementAction(options) {
  const state = loadCapitalState(options.statePath);
  const result = submitAndExecuteMovement(
    state,
    {
      action: options.action,
      amount_usd: options.amountUsd,
      requested_by: options.requestedBy,
      performed_by: options.performedBy,
      authorized_by: options.authorizedBy,
      reason: options.reason,
      notes: options.notes,
      opportunity_id: options.opportunityId,
      approval_ticket_id: options.approvalTicketId,
      request_id: options.requestId,
    },
    { now: options.now }
  );
  const savedPath = saveCapitalState(options.statePath, state, options.now);
  const integrity = verifyLedgerIntegrity(state);
  return {
    state_path: savedPath,
    request: result.request,
    reservation: result.reservation,
    ledger_entry: result.entry,
    account: result.account,
    ledger_integrity: integrity,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runMovementAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runMovementAction,
};
