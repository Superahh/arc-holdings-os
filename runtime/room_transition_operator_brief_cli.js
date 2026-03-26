"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const defaultDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    checkpointPath: path.join(defaultDir, "latest.checkpoint.json"),
    trendPath: path.join(defaultDir, "latest.trend.json"),
    outputPath: path.join(defaultDir, "latest.operator-brief.md"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--checkpoint-path") {
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --checkpoint-path");
      }
      args.checkpointPath = path.resolve(value);
      index += 1;
    } else if (token === "--trend-path") {
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --trend-path");
      }
      args.trendPath = path.resolve(value);
      index += 1;
    } else if (token === "--output-path") {
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

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!payload || typeof payload !== "object") {
    throw new Error(`${label} must be a JSON object: ${filePath}`);
  }
  return payload;
}

function stringifyDelta(value) {
  if (typeof value !== "number") {
    return "n/a";
  }
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function renderBrief(checkpoint, trend) {
  const recommendation = checkpoint.recommendation || {};
  const window = recommendation.window || {};
  const latest = trend.latest || {};
  const deltas = trend.deltas_from_previous || {};
  const failedChecks = Array.isArray(recommendation.failed_checks)
    ? recommendation.failed_checks
    : [];

  return [
    "# Room-Transition Promotion Operator Brief",
    "",
    `- Generated at: ${checkpoint.generated_at || "n/a"}`,
    `- Promotion decision: ${recommendation.promotion_decision || "unknown"}`,
    `- Recommendation state: ${recommendation.recommendation_state || "unknown"}`,
    `- Reason: ${recommendation.reason || "n/a"}`,
    "",
    "## 7-Day Window",
    `- target_hours: ${window.target_hours ?? "n/a"}`,
    `- observed_hours: ${window.observed_hours ?? "n/a"}`,
    `- remaining_hours: ${window.remaining_hours ?? "n/a"}`,
    `- full_window_observed: ${window.full_window_observed === true}`,
    `- next_review_at: ${window.next_review_at || "n/a"}`,
    "",
    "## Latest Evidence Point",
    `- generated_at: ${latest.generated_at || "n/a"}`,
    `- records_considered: ${latest.records_considered ?? "n/a"}`,
    `- allowed_rate: ${latest.allowed_rate ?? "n/a"}`,
    `- recommendation_state: ${latest.recommendation_state || "unknown"}`,
    "",
    "## Delta vs Previous Point",
    `- records_considered: ${stringifyDelta(deltas.records_considered)}`,
    `- allowed_rate: ${stringifyDelta(deltas.allowed_rate)}`,
    `- observed_hours: ${stringifyDelta(deltas.observed_hours)}`,
    "",
    "## Failed Threshold Checks",
    failedChecks.length > 0 ? `- ${failedChecks.join(", ")}` : "- none",
    "",
  ].join("\n");
}

function runOperatorBriefAction(options) {
  const checkpoint = readJson(options.checkpointPath, "Checkpoint");
  const trend = readJson(options.trendPath, "Trend");
  const markdown = renderBrief(checkpoint, trend);

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, markdown, "utf8");

  return {
    output_path: options.outputPath,
    markdown,
    recommendation: checkpoint.recommendation || {},
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runOperatorBriefAction(args);
    process.stdout.write(result.markdown);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runOperatorBriefAction,
};
