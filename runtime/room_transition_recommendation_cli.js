"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runWindowStatusAction } = require("./room_transition_window_status_cli");

function parseArgs(argv) {
  const args = {
    summaryPath: path.resolve(
      __dirname,
      "output",
      "room_transition_validations",
      "latest.summary.json"
    ),
    outputPath: null,
    format: "json",
    failOnNoGo: false,
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
    } else if (token === "--output-path") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --output-path");
      }
      args.outputPath = path.resolve(value);
      index += 1;
    } else if (token === "--format") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --format");
      }
      if (value !== "json" && value !== "markdown") {
        throw new Error("--format must be json or markdown.");
      }
      args.format = value;
      index += 1;
    } else if (token === "--fail-on-no-go") {
      args.failOnNoGo = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function deriveDecision(status) {
  if (!status.window.full_window_observed) {
    return {
      decision: "no_go",
      reason:
        "Hold promotion decision until the full 7-day evidence window is observed.",
    };
  }
  if (status.eligible_for_writable_review) {
    return {
      decision: "candidate_for_review",
      reason:
        "Thresholds and window coverage are satisfied for manual promotion review.",
    };
  }
  return {
    decision: "no_go",
    reason:
      "Threshold checks are not satisfied; keep room-transition controls read-only.",
  };
}

function buildRecommendation(status) {
  const decision = deriveDecision(status);
  return {
    generated_at: status.generated_at,
    summary_path: status.summary_path,
    recommendation_state: status.recommendation_state,
    promotion_decision: decision.decision,
    reason: decision.reason,
    window: status.window,
    failed_checks: status.checks.filter((check) => check.pass === false).map((check) => check.name),
  };
}

function toMarkdown(report) {
  const failedChecks =
    report.failed_checks.length > 0 ? report.failed_checks.join(", ") : "none";
  return [
    "# Room-Transition Promotion Recommendation",
    "",
    `- Generated at: ${report.generated_at}`,
    `- Summary path: ${report.summary_path}`,
    `- Recommendation state: ${report.recommendation_state}`,
    `- Promotion decision: ${report.promotion_decision}`,
    `- Reason: ${report.reason}`,
    "",
    "## Window",
    `- target_hours: ${report.window.target_hours}`,
    `- observed_hours: ${report.window.observed_hours}`,
    `- remaining_hours: ${report.window.remaining_hours}`,
    `- full_window_observed: ${report.window.full_window_observed}`,
    `- next_review_at: ${report.window.next_review_at || "n/a"}`,
    "",
    "## Threshold Failures",
    `- ${failedChecks}`,
    "",
  ].join("\n");
}

function runRecommendationAction(options) {
  const status = runWindowStatusAction({ summaryPath: options.summaryPath });
  const report = buildRecommendation(status);
  const serialized =
    options.format === "markdown"
      ? toMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`;

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, serialized, "utf8");
  }

  return {
    report,
    serialized,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runRecommendationAction(args);
    process.stdout.write(result.serialized);
    if (args.failOnNoGo && result.report.promotion_decision !== "candidate_for_review") {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  buildRecommendation,
  runRecommendationAction,
};
