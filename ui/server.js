"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { buildUiSnapshot } = require("../runtime/ui_snapshot");
const { runDecisionAction } = require("../runtime/queue_decision_cli");

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
            });
            return;
          }
          if (!decision) {
            sendJson(response, 400, {
              error: "invalid_request",
              message: "decision is required.",
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
            sendJson(response, 400, {
              error: "decision_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })
        .catch((error) => {
          sendJson(response, 400, {
            error: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
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
  main,
};
