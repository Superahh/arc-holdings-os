"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    summaryPath: path.resolve(
      __dirname,
      "output",
      "room_transition_validations",
      "latest.summary.json"
    ),
    failOnIncompleteWindow: false,
    failOnNotReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summary-path") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --summary-path");
      }
      args.summaryPath = path.resolve(value);
      index += 1;
    } else if (token === "--fail-on-incomplete-window") {
      args.failOnIncompleteWindow = true;
    } else if (token === "--fail-on-not-ready") {
      args.failOnNotReady = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function toHours(milliseconds) {
  return Number((milliseconds / (60 * 60 * 1000)).toFixed(4));
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function readSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Summary not found: ${summaryPath}`);
  }
  const data = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  if (!data || typeof data !== "object") {
    throw new Error("Summary payload must be an object.");
  }
  return data;
}

function runWindowStatusAction(options) {
  const summary = readSummary(options.summaryPath);
  const coverage = summary.coverage || {};
  const readiness = summary.readiness || {};
  const nowIso =
    typeof summary.generated_at === "string" && isIsoDateTime(summary.generated_at)
      ? summary.generated_at
      : new Date().toISOString();

  const targetHours = Number(coverage.target_window_hours || 0);
  const observedHours = Number(coverage.observed_hours || 0);
  const remainingHours = Number(Math.max(0, targetHours - observedHours).toFixed(4));

  let nextReviewAt = null;
  if (!coverage.full_window_observed && isIsoDateTime(coverage.oldest_validated_at)) {
    const nextReviewMs =
      Date.parse(coverage.oldest_validated_at) + targetHours * 60 * 60 * 1000;
    nextReviewAt = new Date(nextReviewMs).toISOString();
  }

  return {
    generated_at: nowIso,
    summary_path: options.summaryPath,
    recommendation_state:
      readiness.recommendation && typeof readiness.recommendation.state === "string"
        ? readiness.recommendation.state
        : "unknown",
    eligible_for_writable_review: readiness.eligible_for_writable_review === true,
    window: {
      target_hours: targetHours,
      observed_hours: observedHours,
      remaining_hours: remainingHours,
      full_window_observed: coverage.full_window_observed === true,
      oldest_validated_at: coverage.oldest_validated_at || null,
      newest_validated_at: coverage.newest_validated_at || null,
      next_review_at: nextReviewAt,
    },
    checks: Array.isArray(readiness.checks) ? readiness.checks : [],
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runWindowStatusAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (args.failOnIncompleteWindow && !result.window.full_window_observed) {
      process.exitCode = 2;
    } else if (args.failOnNotReady && !result.eligible_for_writable_review) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runWindowStatusAction,
};
