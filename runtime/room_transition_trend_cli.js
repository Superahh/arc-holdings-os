"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parsePositiveInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return value;
}

function parseArgs(argv) {
  const defaultDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    summariesDir: defaultDir,
    maxPoints: 50,
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summaries-dir") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --summaries-dir");
      }
      args.summariesDir = path.resolve(value);
      index += 1;
    } else if (token === "--max-points") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for argument: --max-points");
      }
      args.maxPoints = parsePositiveInteger(value, "--max-points");
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

function listSummaryFiles(summariesDir, maxPoints) {
  if (!fs.existsSync(summariesDir)) {
    return [];
  }
  return fs
    .readdirSync(summariesDir)
    .filter((name) => /^room-transition-evidence-.*\.json$/i.test(name))
    .map((name) => path.join(summariesDir, name))
    .sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs)
    .slice(-maxPoints);
}

function readSummary(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    file: filePath,
    generated_at: payload.generated_at || null,
    records_considered: payload.totals && Number(payload.totals.records_considered || 0),
    allowed_rate: payload.totals && Number(payload.totals.allowed_rate || 0),
    observed_hours:
      payload.coverage && Number(payload.coverage.observed_hours || 0),
    full_window_observed:
      payload.coverage && payload.coverage.full_window_observed === true,
    recommendation_state:
      payload.readiness &&
      payload.readiness.recommendation &&
      typeof payload.readiness.recommendation.state === "string"
        ? payload.readiness.recommendation.state
        : "unknown",
  };
}

function runTrendAction(options) {
  const files = listSummaryFiles(options.summariesDir, options.maxPoints);
  const points = files.map((filePath) => readSummary(filePath));
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;

  const trend = {
    generated_at: new Date().toISOString(),
    summaries_dir: options.summariesDir,
    points_count: points.length,
    latest,
    previous,
    deltas_from_previous:
      latest && previous
        ? {
            records_considered: latest.records_considered - previous.records_considered,
            allowed_rate: Number((latest.allowed_rate - previous.allowed_rate).toFixed(4)),
            observed_hours: Number((latest.observed_hours - previous.observed_hours).toFixed(4)),
          }
        : null,
    points,
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(trend, null, 2)}\n`, "utf8");
  }

  return trend;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const trend = runTrendAction(args);
    process.stdout.write(`${JSON.stringify(trend, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  listSummaryFiles,
  runTrendAction,
};
