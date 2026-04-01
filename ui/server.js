"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { buildUiSnapshot } = require("../runtime/ui_snapshot");
const { buildRunArtifact, writeRunArtifact } = require("../runtime/output");
const { runDecisionAction } = require("../runtime/queue_decision_cli");
const {
  createOperatorIntakeOpportunity,
  loadWorkflowState,
  saveWorkflowState,
} = require("../runtime/workflow_state");
const {
  loadCapitalState,
  saveCapitalState,
  submitWithdrawalRequest,
  approveWithdrawalRequest,
  cancelWithdrawalRequest,
  verifyLedgerIntegrity,
} = require("../runtime/capital_state");
const APPROVAL_DECISIONS = new Set(["approve", "reject", "request_more_info"]);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 4173,
    queuePath: path.join(__dirname, "..", "runtime", "state", "approval_queue.json"),
    workflowStatePath: path.join(__dirname, "..", "runtime", "state", "workflow_state.json"),
    capitalStatePath: path.join(__dirname, "..", "runtime", "state", "capital_state.json"),
    baseDir: path.join(__dirname, "..", "runtime", "output"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--host") {
      args.host = argv[i + 1];
      i += 1;
    } else if (token === "--port") {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--capital-state-path") {
      args.capitalStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isInteger(args.port) || args.port <= 0) {
    throw new Error("--port must be a positive integer.");
  }

  return args;
}

function runWithdrawalAction(capitalStatePath, operation) {
  const state = loadCapitalState(capitalStatePath);
  const now = new Date().toISOString();
  const result = operation(state, now);
  saveCapitalState(capitalStatePath, state, now);
  return {
    ...result,
    ledger_integrity: verifyLedgerIntegrity(state),
  };
}

function createOpportunityIntake(workflowStatePath, baseDir, payload, timestamp = new Date().toISOString()) {
  const workflowState = loadWorkflowState(workflowStatePath);
  const created = createOperatorIntakeOpportunity(
    workflowState,
    {
      summary: payload.summary,
      source: payload.source,
      ask_price_usd: payload.ask_price_usd,
      note: payload.note,
    },
    payload.actor,
    timestamp
  );
  saveWorkflowState(workflowStatePath, workflowState, timestamp);
  const artifact = buildRunArtifact(
    {
      opportunity_id: created.opportunity_id,
      source: created.opportunity_record.source,
      captured_at: created.opportunity_record.captured_at,
      captured_via: "ui_manual_intake",
      operator_note: payload.note || "",
    },
    {
      opportunity_record: created.opportunity_record,
    },
    timestamp
  );
  const artifactPath = writeRunArtifact(baseDir, artifact);
  return {
    ...created,
    artifact_path: artifactPath,
  };
}

function getStaticPath(rootDir, requestPathname) {
  const normalizedPath = requestPathname === "/" ? "/index.html" : requestPathname;
  const resolvedPath = path.resolve(rootDir, `.${normalizedPath}`);
  if (!resolvedPath.startsWith(rootDir)) {
    return null;
  }
  return resolvedPath;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendStatic(response, filePath) {
  const extension = path.extname(filePath);
  const contentType = CONTENT_TYPES[extension] || "text/plain; charset=utf-8";
  response.writeHead(200, {
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=60",
    "Content-Type": contentType,
  });
  fs.createReadStream(filePath).pipe(response);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function createUiServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || __dirname);
  const snapshotOptions = {
    queuePath: options.queuePath,
    workflowStatePath: options.workflowStatePath,
    capitalStatePath: options.capitalStatePath,
    baseDir: options.baseDir,
  };

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/api/snapshot") {
      try {
        const snapshot = buildUiSnapshot({
          ...snapshotOptions,
          now: requestUrl.searchParams.get("now") || undefined,
        });
        sendJson(response, 200, snapshot);
      } catch (error) {
        sendJson(response, 500, {
          error: "snapshot_build_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/approval-decision") {
      readJsonBody(request)
        .then((body) => {
          const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
          const decision = typeof body.decision === "string" ? body.decision.trim() : "";
          const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "ui_operator";
          const note = typeof body.note === "string" ? body.note : "";

          if (!ticketId) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "ticket_id is required.",
              retryable: false,
            });
            return;
          }
          if (!decision) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "decision is required.",
              retryable: false,
            });
            return;
          }
          if (!APPROVAL_DECISIONS.has(decision)) {
            sendJson(response, 422, {
              error: "invalid_decision",
              message: "decision must be one of approve, reject, request_more_info.",
              retryable: false,
            });
            return;
          }

          try {
            const result = runDecisionAction({
              queuePath: snapshotOptions.queuePath,
              workflowStatePath: snapshotOptions.workflowStatePath,
              baseDir: snapshotOptions.baseDir,
              ticketId,
              decision,
              actor,
              note,
              now: new Date().toISOString(),
            });
            sendJson(response, 200, {
              ok: true,
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isConflict = /already decided|not found/i.test(message);
            sendJson(response, isConflict ? 409 : 400, {
              error: isConflict ? "decision_conflict" : "decision_failed",
              message,
              retryable: false,
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          });
        });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/opportunity-intake") {
      readJsonBody(request)
        .then((body) => {
          const summary = typeof body.summary === "string" ? body.summary.trim() : "";
          const source = typeof body.source === "string" ? body.source.trim() : "";
          const note = typeof body.note === "string" ? body.note : "";
          const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "owner_operator";
          const askPriceProvided = !(
            body.ask_price_usd === undefined ||
            body.ask_price_usd === null ||
            (typeof body.ask_price_usd === "string" && body.ask_price_usd.trim() === "")
          );
          const askPriceUsd = Number(body.ask_price_usd);

          if (!summary) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "summary is required.",
              retryable: false,
            });
            return;
          }
          if (!source) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "source is required.",
              retryable: false,
            });
            return;
          }
          if (!askPriceProvided || !Number.isFinite(askPriceUsd) || askPriceUsd < 0) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "ask_price_usd must be a non-negative number.",
              retryable: false,
            });
            return;
          }

          try {
            const result = createOpportunityIntake(
              snapshotOptions.workflowStatePath,
              snapshotOptions.baseDir,
              {
                summary,
                source,
                ask_price_usd: askPriceUsd,
                note,
                actor,
              },
              new Date().toISOString()
            );
            sendJson(response, 200, {
              ok: true,
              result: {
                opportunity_id: result.opportunity_id,
                current_status: result.workflow_record.current_status,
                artifact_path: result.artifact_path,
              },
            });
          } catch (error) {
            sendJson(response, 400, {
              error: "intake_failed",
              message: error instanceof Error ? error.message : String(error),
              retryable: false,
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          });
        });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/capital-withdrawal/request") {
      readJsonBody(request)
        .then((body) => {
          const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "owner_operator";
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
          const amountUsd = Number(body.amount_usd);
          const requestId =
            typeof body.request_id === "string" && body.request_id.trim() ? body.request_id.trim() : null;
          const note = typeof body.note === "string" ? body.note : "";

          if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "amount_usd must be a positive number.",
              retryable: false,
            });
            return;
          }
          if (!reason) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "reason is required.",
              retryable: false,
            });
            return;
          }

          try {
            const result = runWithdrawalAction(snapshotOptions.capitalStatePath, (state, now) =>
              submitWithdrawalRequest(
                state,
                {
                  request_id: requestId,
                  amount_usd: amountUsd,
                  requested_by: actor,
                  performed_by: actor,
                  authorized_by: actor,
                  reason,
                  notes: note || `Requested from UI by ${actor}.`,
                },
                { now }
              )
            );
            sendJson(response, 200, {
              ok: true,
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isConflict = /insufficient|already exists|invalid capital state/i.test(message);
            sendJson(response, isConflict ? 409 : 400, {
              error: isConflict ? "withdrawal_request_conflict" : "withdrawal_request_failed",
              message,
              retryable: false,
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          });
        });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/capital-withdrawal/approve") {
      readJsonBody(request)
        .then((body) => {
          const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "owner_operator";
          const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
          const note = typeof body.note === "string" ? body.note : "";
          if (!requestId) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "request_id is required.",
              retryable: false,
            });
            return;
          }
          if (body.confirm_irreversible !== true) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "confirm_irreversible must be true for withdrawal approval.",
              retryable: false,
            });
            return;
          }

          try {
            const result = runWithdrawalAction(snapshotOptions.capitalStatePath, (state, now) =>
              approveWithdrawalRequest(
                state,
                {
                  request_id: requestId,
                  performed_by: actor,
                  authorized_by: actor,
                  notes: note || `Approved from UI by ${actor}.`,
                  confirm_irreversible: true,
                },
                { now }
              )
            );
            sendJson(response, 200, {
              ok: true,
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isConflict = /not found|invalid capital state/i.test(message);
            sendJson(response, isConflict ? 409 : 400, {
              error: isConflict ? "withdrawal_approval_conflict" : "withdrawal_approval_failed",
              message,
              retryable: false,
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          });
        });
      return;
    }

    if (
      request.method === "POST" &&
      (requestUrl.pathname === "/api/capital-withdrawal/cancel" ||
        requestUrl.pathname === "/api/capital-withdrawal/reject")
    ) {
      readJsonBody(request)
        .then((body) => {
          const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "owner_operator";
          const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
          const note = typeof body.note === "string" ? body.note : "";
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
          const decision = requestUrl.pathname.endsWith("/reject") ? "reject" : "cancel";
          const decisionReason =
            decision === "reject" ? "Rejected by user from UI." : "Cancelled by user from UI.";
          const decisionNote =
            decision === "reject" ? `Rejected from UI by ${actor}.` : `Cancelled from UI by ${actor}.`;
          if (!requestId) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "request_id is required.",
              retryable: false,
            });
            return;
          }

          try {
            const result = runWithdrawalAction(snapshotOptions.capitalStatePath, (state, now) =>
              cancelWithdrawalRequest(
                state,
                {
                  request_id: requestId,
                  decision,
                  reason: reason || decisionReason,
                  performed_by: actor,
                  authorized_by: actor,
                  notes: note || decisionNote,
                },
                { now }
              )
            );
            sendJson(response, 200, {
              ok: true,
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isConflict = /not found|invalid capital state/i.test(message);
            sendJson(response, isConflict ? 409 : 400, {
              error: isConflict ? "withdrawal_cancel_conflict" : "withdrawal_cancel_failed",
              message,
              retryable: false,
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          });
        });
      return;
    }

    const staticPath = getStaticPath(rootDir, requestUrl.pathname);
    if (!staticPath || !fs.existsSync(staticPath) || fs.statSync(staticPath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    sendStatic(response, staticPath);
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = createUiServer({
    rootDir: __dirname,
    queuePath: args.queuePath,
    workflowStatePath: args.workflowStatePath,
    capitalStatePath: args.capitalStatePath,
    baseDir: args.baseDir,
  });

  server.listen(args.port, args.host, () => {
    process.stdout.write(
      `ARC Holdings OS UI shell running at http://${args.host}:${args.port}\n`
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  createUiServer,
  createOpportunityIntake,
  main,
};
