"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadCapitalState, verifyLedgerIntegrity } = require("./capital_state");

function parseArgs(argv) {
  const args = {
    statePath: path.resolve(__dirname, "state", "capital_state.json"),
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--state-path") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --state-path");
      }
      args.statePath = path.resolve(value);
      index += 1;
    } else if (token === "--output-path") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --output-path");
      }
      args.outputPath = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function runAuditAction(options) {
  const state = loadCapitalState(options.statePath);
  const integrity = verifyLedgerIntegrity(state);
  const activeReservations = state.reservations.filter((entry) => entry.status === "active");

  const result = {
    generated_at: new Date().toISOString(),
    state_path: options.statePath,
    account: state.account,
    totals: {
      request_count: state.requests.length,
      ledger_entry_count: state.ledger.length,
      reservation_count: state.reservations.length,
      active_reservation_count: activeReservations.length,
      reserved_amount_active_usd: Number(
        activeReservations.reduce((sum, entry) => sum + Number(entry.amount_usd || 0), 0).toFixed(2)
      ),
    },
    integrity,
    latest_request: state.requests.length ? state.requests[state.requests.length - 1] : null,
    latest_entry: state.ledger.length ? state.ledger[state.ledger.length - 1] : null,
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return result;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runAuditAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.integrity.ok) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runAuditAction,
};
