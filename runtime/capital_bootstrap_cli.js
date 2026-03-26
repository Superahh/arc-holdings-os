"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createEmptyCapitalState, saveCapitalState } = require("./capital_state");

function parseArgs(argv) {
  const args = {
    statePath: path.resolve(__dirname, "state", "capital_state.json"),
    accountId: "arc-main-usd",
    now: new Date().toISOString(),
    force: false,
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
    } else if (token === "--account-id") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --account-id");
      }
      args.accountId = value;
      index += 1;
    } else if (token === "--now") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --now");
      }
      args.now = value;
      index += 1;
    } else if (token === "--force") {
      args.force = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function runBootstrapAction(options) {
  if (fs.existsSync(options.statePath) && !options.force) {
    throw new Error(`Capital state already exists: ${options.statePath}. Use --force to overwrite.`);
  }
  const state = createEmptyCapitalState({ accountId: options.accountId }, options.now);
  const savedPath = saveCapitalState(options.statePath, state, options.now);
  return {
    state_path: savedPath,
    account_id: state.account.account_id,
    updated_at: state.updated_at,
    force: options.force,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runBootstrapAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runBootstrapAction,
};
