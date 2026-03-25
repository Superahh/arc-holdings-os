"use strict";

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const TEMPORAL_KEYS = new Set(["required_by", "due_by", "updated_at", "timestamp"]);

function sanitizeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function formatTimestampForFilename(isoDateTime) {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid timestamp for filename formatting.");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getRunArtifactFilename(opportunityId, isoDateTime) {
  return `${sanitizeId(opportunityId)}--${formatTimestampForFilename(isoDateTime)}.artifact.json`;
}

function getSnapshotFilename(opportunityId) {
  return `${sanitizeId(opportunityId)}.snapshot.json`;
}

function getDecisionArtifactFilename(ticketId, isoDateTime) {
  return `${sanitizeId(ticketId)}--${formatTimestampForFilename(isoDateTime)}.decision.json`;
}

function getTimelineArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.timeline.json`;
}

function getHealthArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.health.json`;
}

function getCycleArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.cycle.json`;
}

function getReportArtifactBaseFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.report`;
}

function getLoopArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.loop.json`;
}

function getBatchArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.batch.json`;
}

function getIndexArtifactFilename(sourceLabel, isoDateTime) {
  return `${sanitizeId(sourceLabel)}--${formatTimestampForFilename(isoDateTime)}.index.json`;
}

function normalizeTemporalFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTemporalFields(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (TEMPORAL_KEYS.has(key)) {
      normalized[key] = "__IGNORED_TEMPORAL__";
      continue;
    }
    normalized[key] = normalizeTemporalFields(entry);
  }
  return normalized;
}

function buildRunArtifact(input, output, nowIsoDateTime) {
  return {
    schema_version: "v1",
    generated_at: new Date(nowIsoDateTime).toISOString(),
    opportunity_id: output.opportunity_record.opportunity_id,
    input,
    output,
  };
}

function writeRunArtifact(baseOutputDir, artifact) {
  const runsDir = path.join(baseOutputDir, "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const fileName = getRunArtifactFilename(artifact.opportunity_id, artifact.generated_at);
  const filePath = path.join(runsDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeSnapshot(baseOutputDir, artifact) {
  const snapshotsDir = path.join(baseOutputDir, "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const snapshot = {
    schema_version: "v1",
    opportunity_id: artifact.opportunity_id,
    normalized_output: normalizeTemporalFields(artifact.output),
  };

  const filePath = path.join(snapshotsDir, getSnapshotFilename(artifact.opportunity_id));
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return filePath;
}

function compareWithSnapshot(baseOutputDir, artifact) {
  const filePath = path.join(
    baseOutputDir,
    "snapshots",
    getSnapshotFilename(artifact.opportunity_id)
  );
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      matches: false,
      snapshot_path: filePath,
      differing_keys: ["snapshot_missing"],
    };
  }

  const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const currentNormalizedOutput = normalizeTemporalFields(artifact.output);
  const matches = util.isDeepStrictEqual(snapshot.normalized_output, currentNormalizedOutput);

  const keys = new Set([
    ...Object.keys(snapshot.normalized_output || {}),
    ...Object.keys(currentNormalizedOutput || {}),
  ]);
  const differingKeys = [...keys].filter(
    (key) =>
      !util.isDeepStrictEqual(
        (snapshot.normalized_output || {})[key],
        (currentNormalizedOutput || {})[key]
      )
  );

  return {
    exists: true,
    matches,
    snapshot_path: filePath,
    differing_keys: matches ? [] : differingKeys,
  };
}

function writeDecisionArtifact(baseOutputDir, decisionArtifact) {
  const decisionsDir = path.join(baseOutputDir, "decisions");
  fs.mkdirSync(decisionsDir, { recursive: true });
  const fileName = getDecisionArtifactFilename(
    decisionArtifact.ticket_id,
    decisionArtifact.decided_at
  );
  const filePath = path.join(decisionsDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(decisionArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeTimelineArtifact(baseOutputDir, timelineArtifact) {
  const timelinesDir = path.join(baseOutputDir, "timelines");
  fs.mkdirSync(timelinesDir, { recursive: true });
  const sourceLabel = timelineArtifact.source_label || "queue";
  const fileName = getTimelineArtifactFilename(sourceLabel, timelineArtifact.generated_at);
  const filePath = path.join(timelinesDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(timelineArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeHealthArtifact(baseOutputDir, healthArtifact) {
  const healthDir = path.join(baseOutputDir, "health");
  fs.mkdirSync(healthDir, { recursive: true });
  const sourceLabel = healthArtifact.source_label || "queue";
  const fileName = getHealthArtifactFilename(sourceLabel, healthArtifact.generated_at);
  const filePath = path.join(healthDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(healthArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeCycleArtifact(baseOutputDir, cycleArtifact) {
  const cycleDir = path.join(baseOutputDir, "cycles");
  fs.mkdirSync(cycleDir, { recursive: true });
  const sourceLabel = cycleArtifact.source_label || "cycle";
  const fileName = getCycleArtifactFilename(sourceLabel, cycleArtifact.generated_at);
  const filePath = path.join(cycleDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(cycleArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeReportArtifacts(baseOutputDir, reportArtifact, markdownContent) {
  const reportsDir = path.join(baseOutputDir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const sourceLabel = reportArtifact.source_label || "ops_report";
  const baseFileName = getReportArtifactBaseFilename(sourceLabel, reportArtifact.generated_at);
  const jsonPath = path.join(reportsDir, `${baseFileName}.json`);
  const markdownPath = path.join(reportsDir, `${baseFileName}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(reportArtifact, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, `${markdownContent}\n`, "utf8");
  return { jsonPath, markdownPath };
}

function writeLoopArtifact(baseOutputDir, loopArtifact) {
  const loopsDir = path.join(baseOutputDir, "loops");
  fs.mkdirSync(loopsDir, { recursive: true });
  const sourceLabel = loopArtifact.source_label || "ops_loop";
  const fileName = getLoopArtifactFilename(sourceLabel, loopArtifact.generated_at);
  const filePath = path.join(loopsDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(loopArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeBatchArtifact(baseOutputDir, batchArtifact) {
  const batchesDir = path.join(baseOutputDir, "batches");
  fs.mkdirSync(batchesDir, { recursive: true });
  const sourceLabel = batchArtifact.source_label || "ops_batch";
  const fileName = getBatchArtifactFilename(sourceLabel, batchArtifact.generated_at);
  const filePath = path.join(batchesDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(batchArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

function writeIndexArtifact(baseOutputDir, indexArtifact) {
  const indexesDir = path.join(baseOutputDir, "indexes");
  fs.mkdirSync(indexesDir, { recursive: true });
  const sourceLabel = indexArtifact.source_label || "artifact_index";
  const fileName = getIndexArtifactFilename(sourceLabel, indexArtifact.generated_at);
  const filePath = path.join(indexesDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(indexArtifact, null, 2)}\n`, "utf8");
  return filePath;
}

module.exports = {
  buildRunArtifact,
  writeRunArtifact,
  writeSnapshot,
  writeDecisionArtifact,
  writeTimelineArtifact,
  writeHealthArtifact,
  writeCycleArtifact,
  writeReportArtifacts,
  writeLoopArtifact,
  writeBatchArtifact,
  writeIndexArtifact,
  compareWithSnapshot,
  getRunArtifactFilename,
  getDecisionArtifactFilename,
  getTimelineArtifactFilename,
  getHealthArtifactFilename,
  getCycleArtifactFilename,
  getReportArtifactBaseFilename,
  getLoopArtifactFilename,
  getBatchArtifactFilename,
  getIndexArtifactFilename,
  formatTimestampForFilename,
  normalizeTemporalFields,
};
