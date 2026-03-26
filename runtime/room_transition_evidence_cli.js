"use strict";

const fs = require("node:fs");
const path = require("node:path");

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parsePositiveInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return value;
}

function parseRate(rawValue, optionName) {
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${optionName} must be a number between 0 and 1.`);
  }
  return value;
}

function parseArgs(argv) {
  function readValue(index, option) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${option}`);
    }
    return value;
  }

  const args = {
    inputsDir: path.resolve(__dirname, "output", "room_transition_validations"),
    outputPath: null,
    now: new Date().toISOString(),
    windowHours: 168,
    maxFiles: 500,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnNotReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--inputs-dir") {
      args.inputsDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--output-path") {
      args.outputPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else if (token === "--window-hours") {
      args.windowHours = parsePositiveInteger(readValue(index, token), "--window-hours");
      index += 1;
    } else if (token === "--max-files") {
      args.maxFiles = parsePositiveInteger(readValue(index, token), "--max-files");
      index += 1;
    } else if (token === "--min-runs") {
      args.minRuns = parsePositiveInteger(readValue(index, token), "--min-runs");
      index += 1;
    } else if (token === "--min-allowed-rate") {
      args.minAllowedRate = parseRate(readValue(index, token), "--min-allowed-rate");
      index += 1;
    } else if (token === "--max-parse-errors") {
      args.maxParseErrors = parseNonNegativeInteger(
        readValue(index, token),
        "--max-parse-errors"
      );
      index += 1;
    } else if (token === "--max-critical-failures") {
      args.maxCriticalFailures = parseNonNegativeInteger(
        readValue(index, token),
        "--max-critical-failures"
      );
      index += 1;
    } else if (token === "--fail-on-not-ready") {
      args.failOnNotReady = true;
    } else if (token === "--all") {
      args.all = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!isIsoDateTime(args.now)) {
    throw new Error("--now must be ISO-8601 datetime.");
  }

  return args;
}

function listEvidenceFiles(inputsDir, maxFiles) {
  if (!fs.existsSync(inputsDir)) {
    return [];
  }
  return fs
    .readdirSync(inputsDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(inputsDir, entry))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .slice(0, maxFiles);
}

function readEvidenceRecord(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data || typeof data !== "object") {
      return {
        filePath,
        parse_error: "payload is not an object",
      };
    }
    return {
      filePath,
      validated_at: data.validated_at || null,
      allowed: data.allowed === true,
      request_id: typeof data.request_id === "string" ? data.request_id : null,
      checks: Array.isArray(data.checks) ? data.checks : [],
      summary: typeof data.summary === "string" ? data.summary : null,
      parse_error: null,
    };
  } catch (error) {
    return {
      filePath,
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function withinWindow(validatedAt, nowIso, windowHours) {
  if (!isIsoDateTime(validatedAt)) {
    return false;
  }
  const nowMs = Date.parse(nowIso);
  const validatedMs = Date.parse(validatedAt);
  if (Number.isNaN(nowMs) || Number.isNaN(validatedMs)) {
    return false;
  }
  const ageMs = nowMs - validatedMs;
  return ageMs >= 0 && ageMs <= windowHours * 60 * 60 * 1000;
}

function countFailedChecks(records) {
  const counts = new Map();
  for (const record of records) {
    for (const check of record.checks || []) {
      if (!check || check.pass !== false || typeof check.name !== "string") {
        continue;
      }
      counts.set(check.name, (counts.get(check.name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([check_name, count]) => ({ check_name, count }));
}

function computeReadiness(totals, failedCheckCounts, thresholds) {
  const criticalChecks = new Set([
    "intent_exists",
    "snapshot_identity_match",
    "non_terminal_opportunity",
    "no_workflow_or_capital_mutation_fields",
  ]);
  const criticalFailureCount = failedCheckCounts
    .filter((entry) => criticalChecks.has(entry.check_name))
    .reduce((sum, entry) => sum + entry.count, 0);

  const checks = [
    {
      name: "minimum_runs",
      pass: totals.records_considered >= thresholds.min_runs,
      actual: totals.records_considered,
      threshold: thresholds.min_runs,
    },
    {
      name: "minimum_allowed_rate",
      pass: totals.allowed_rate >= thresholds.min_allowed_rate,
      actual: totals.allowed_rate,
      threshold: thresholds.min_allowed_rate,
    },
    {
      name: "max_parse_errors",
      pass: totals.parse_errors <= thresholds.max_parse_errors,
      actual: totals.parse_errors,
      threshold: thresholds.max_parse_errors,
    },
    {
      name: "max_critical_failures",
      pass: criticalFailureCount <= thresholds.max_critical_failures,
      actual: criticalFailureCount,
      threshold: thresholds.max_critical_failures,
    },
  ];

  return {
    eligible_for_writable_review: checks.every((check) => check.pass),
    thresholds,
    critical_failure_count: criticalFailureCount,
    checks,
  };
}

function summarizeEvidence(input) {
  const files = listEvidenceFiles(input.inputsDir, input.maxFiles);
  const parsed = files.map((filePath) => readEvidenceRecord(filePath));
  const parseErrors = parsed.filter((entry) => entry.parse_error);
  const validRecords = parsed.filter((entry) => !entry.parse_error);

  const windowedRecords = input.all
    ? validRecords
    : validRecords.filter((entry) =>
        withinWindow(entry.validated_at, input.now, input.windowHours)
      );

  const allowedCount = windowedRecords.filter((entry) => entry.allowed).length;
  const deniedCount = windowedRecords.length - allowedCount;
  const failedCheckCounts = countFailedChecks(windowedRecords);
  const latest = windowedRecords.slice(0, 5).map((entry) => ({
    request_id: entry.request_id,
    validated_at: entry.validated_at,
    allowed: entry.allowed,
    failed_checks: (entry.checks || [])
      .filter((check) => check && check.pass === false && typeof check.name === "string")
      .map((check) => check.name),
    summary: entry.summary,
  }));

  const summary = {
    generated_at: input.now,
    inputs_dir: input.inputsDir,
    filters: {
      all: input.all,
      window_hours: input.windowHours,
      max_files: input.maxFiles,
    },
    totals: {
      files_scanned: files.length,
      parse_errors: parseErrors.length,
      records_considered: windowedRecords.length,
      allowed_count: allowedCount,
      denied_count: deniedCount,
      allowed_rate: windowedRecords.length
        ? Number((allowedCount / windowedRecords.length).toFixed(4))
        : 0,
    },
    failed_check_counts: failedCheckCounts.slice(0, 10),
    latest_records: latest,
    parse_error_files: parseErrors.slice(0, 10).map((entry) => ({
      file: entry.filePath,
      error: entry.parse_error,
    })),
  };
  summary.readiness = computeReadiness(summary.totals, summary.failed_check_counts, {
    min_runs: input.minRuns,
    min_allowed_rate: input.minAllowedRate,
    max_parse_errors: input.maxParseErrors,
    max_critical_failures: input.maxCriticalFailures,
  });
  return summary;
}

function runEvidenceAction(options) {
  const summary = summarizeEvidence(options);
  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  return summary;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = runEvidenceAction(args);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (args.failOnNotReady && !summary.readiness.eligible_for_writable_review) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  listEvidenceFiles,
  summarizeEvidence,
  runEvidenceAction,
};
