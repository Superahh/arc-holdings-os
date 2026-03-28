"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MOVEMENT_ACTIONS = new Set([
  "deposit",
  "reserve",
  "release_reserve",
  "approve_use",
  "withdraw",
  "adjustment",
]);
const WITHDRAWAL_REQUEST_ACTION = "request_withdrawal";
const WITHDRAWAL_EXECUTION_ACTION = "approve_withdrawal";
const WITHDRAWAL_CANCEL_ACTION = "cancel_withdrawal";
const WITHDRAWAL_REJECT_ACTION = "reject_withdrawal";
const WITHDRAWAL_REQUEST_STATUSES = new Set(["requested", "executed", "cancelled", "rejected"]);

function toIso(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function toAmount(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return Number(amount.toFixed(2));
}

function asCurrency(value) {
  return Number(Number(value).toFixed(2));
}

function createEmptyCapitalState(options = {}, timestamp = new Date().toISOString()) {
  const accountId =
    typeof options.accountId === "string" && options.accountId.trim()
      ? options.accountId.trim()
      : "arc-main-usd";
  const at = toIso(timestamp);
  return {
    schema_version: "v1",
    updated_at: at,
    account: {
      account_id: accountId,
      as_of: at,
      currency: "USD",
      available_usd: 0,
      reserved_usd: 0,
      committed_usd: 0,
      pending_withdrawal_usd: 0,
      manual_only: true,
    },
    requests: [],
    reservations: [],
    ledger: [],
  };
}

function ensureShape(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Capital state must be an object.");
  }
  if (state.schema_version !== "v1") {
    throw new Error("Unsupported capital state schema_version.");
  }
  if (!state.account || typeof state.account !== "object") {
    throw new Error("Capital state must include account object.");
  }
  if (!Array.isArray(state.requests) || !Array.isArray(state.reservations) || !Array.isArray(state.ledger)) {
    throw new Error("Capital state must include requests[], reservations[], and ledger[].");
  }
  if (state.account.currency !== "USD") {
    throw new Error("Capital account currency must be USD.");
  }
  if (state.account.manual_only !== true) {
    throw new Error("Capital account manual_only must be true in current phase.");
  }
}

function loadCapitalState(statePath) {
  const absolutePath = path.resolve(statePath);
  if (!fs.existsSync(absolutePath)) {
    return createEmptyCapitalState();
  }
  const state = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  ensureShape(state);
  return state;
}

function saveCapitalState(statePath, state, timestamp = new Date().toISOString()) {
  ensureShape(state);
  state.updated_at = toIso(timestamp);
  state.account.as_of = state.updated_at;
  const absolutePath = path.resolve(statePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return absolutePath;
}

function nextRequestId(state) {
  return `cap-req-${String(state.requests.length + 1).padStart(6, "0")}`;
}

function nextLedgerEntryId(state) {
  return `cap-ledger-${String(state.ledger.length + 1).padStart(6, "0")}`;
}

function nextReservationId(state) {
  return `cap-res-${String(state.reservations.length + 1).padStart(6, "0")}`;
}

function hashEntry(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildEntryHashInput(entry, previousEntryHash) {
  return {
    previous_entry_hash: previousEntryHash || null,
    entry_id: entry.entry_id,
    timestamp: entry.timestamp,
    action: entry.action,
    amount_usd: entry.amount_usd,
    balance_after_usd: entry.balance_after_usd,
    reserved_after_usd: entry.reserved_after_usd,
    committed_after_usd: entry.committed_after_usd,
    pending_withdrawal_after_usd: entry.pending_withdrawal_after_usd,
    performed_by: entry.performed_by,
    authorized_by: entry.authorized_by,
    request_id: entry.request_id,
    opportunity_id: entry.opportunity_id,
    approval_ticket_id: entry.approval_ticket_id,
    notes: entry.notes,
  };
}

function ensureRequestIdAvailable(state, requestId) {
  if (state.requests.some((request) => request.request_id === requestId)) {
    throw new Error(`request_id already exists: ${requestId}`);
  }
}

function requireActor(value, fieldName) {
  const actor = typeof value === "string" ? value.trim() : "";
  if (!actor) {
    throw new Error(`${fieldName} is required.`);
  }
  return actor;
}

function buildRequest(state, input, timestamp, action, amount) {
  const requestId =
    typeof input.request_id === "string" && input.request_id.trim()
      ? input.request_id.trim()
      : nextRequestId(state);
  ensureRequestIdAvailable(state, requestId);
  return {
    request_id: requestId,
    action,
    amount_usd: amount,
    requested_by: requireActor(input.requested_by, "requested_by"),
    requested_at: toIso(timestamp),
    reason: String(input.reason || "").trim(),
    opportunity_id: input.opportunity_id || null,
    approval_ticket_id: input.approval_ticket_id || null,
    status: "requested",
  };
}

function computeBalanceAfter(account) {
  return asCurrency(
    account.available_usd + account.reserved_usd + account.committed_usd + account.pending_withdrawal_usd
  );
}

function appendLedgerEntry(state, input, timestamp) {
  const previousEntry = state.ledger[state.ledger.length - 1] || null;
  const previousEntryHash = previousEntry ? previousEntry.entry_hash : null;
  const entry = {
    entry_id: nextLedgerEntryId(state),
    timestamp: toIso(timestamp),
    action: input.action,
    amount_usd: input.amount_usd,
    balance_after_usd: computeBalanceAfter(state.account),
    reserved_after_usd: state.account.reserved_usd,
    committed_after_usd: state.account.committed_usd,
    pending_withdrawal_after_usd: state.account.pending_withdrawal_usd,
    performed_by: requireActor(input.performed_by, "performed_by"),
    authorized_by: requireActor(input.authorized_by, "authorized_by"),
    request_id: input.request_id || null,
    opportunity_id: input.opportunity_id || null,
    approval_ticket_id: input.approval_ticket_id || null,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : "Capital ledger action.",
    previous_entry_hash: previousEntryHash,
  };
  const hashInput = buildEntryHashInput(entry, previousEntryHash);
  entry.entry_hash = hashEntry(hashInput);
  state.ledger.push(entry);
  return entry;
}

function findActiveReservation(state, opportunityId) {
  return (
    state.reservations.find(
      (reservation) => reservation.opportunity_id === opportunityId && reservation.status === "active"
    ) || null
  );
}

function applyAccounting(state, request, timestamp) {
  const account = state.account;
  const amount = request.amount_usd;
  let reservation = null;

  if (request.action === "deposit") {
    account.available_usd = asCurrency(account.available_usd + amount);
  } else if (request.action === "reserve") {
    if (account.available_usd < amount) {
      throw new Error("Insufficient available capital for reserve.");
    }
    if (!request.opportunity_id) {
      throw new Error("reserve action requires opportunity_id.");
    }
    account.available_usd = asCurrency(account.available_usd - amount);
    account.reserved_usd = asCurrency(account.reserved_usd + amount);
    reservation = {
      reservation_id: nextReservationId(state),
      opportunity_id: request.opportunity_id,
      amount_usd: amount,
      created_from_request_id: request.request_id,
      approval_ticket_id: request.approval_ticket_id || null,
      status: "active",
      created_at: toIso(timestamp),
      updated_at: toIso(timestamp),
    };
    state.reservations.push(reservation);
  } else if (request.action === "release_reserve") {
    if (!request.opportunity_id) {
      throw new Error("release_reserve action requires opportunity_id.");
    }
    const activeReservation = findActiveReservation(state, request.opportunity_id);
    if (!activeReservation) {
      throw new Error("No active reservation found for release_reserve.");
    }
    if (activeReservation.amount_usd < amount || account.reserved_usd < amount) {
      throw new Error("Insufficient reserved capital for release_reserve.");
    }
    activeReservation.amount_usd = asCurrency(activeReservation.amount_usd - amount);
    activeReservation.updated_at = toIso(timestamp);
    if (activeReservation.amount_usd === 0) {
      activeReservation.status = "released";
    }
    if (!request.approval_ticket_id && activeReservation.approval_ticket_id) {
      request.approval_ticket_id = activeReservation.approval_ticket_id;
    }
    account.reserved_usd = asCurrency(account.reserved_usd - amount);
    account.available_usd = asCurrency(account.available_usd + amount);
    reservation = activeReservation;
  } else if (request.action === "approve_use") {
    if (!request.opportunity_id) {
      throw new Error("approve_use action requires opportunity_id.");
    }
    const activeReservation = findActiveReservation(state, request.opportunity_id);
    if (!activeReservation) {
      throw new Error("No active reservation found for approve_use.");
    }
    if (activeReservation.amount_usd < amount || account.reserved_usd < amount) {
      throw new Error("Insufficient reserved capital for approve_use.");
    }
    activeReservation.amount_usd = asCurrency(activeReservation.amount_usd - amount);
    activeReservation.updated_at = toIso(timestamp);
    if (activeReservation.amount_usd === 0) {
      activeReservation.status = "consumed";
    }
    if (!request.approval_ticket_id && activeReservation.approval_ticket_id) {
      request.approval_ticket_id = activeReservation.approval_ticket_id;
    }
    account.reserved_usd = asCurrency(account.reserved_usd - amount);
    account.committed_usd = asCurrency(account.committed_usd + amount);
    reservation = activeReservation;
  } else if (request.action === "withdraw") {
    if (account.available_usd < amount) {
      throw new Error("Insufficient available capital for withdraw.");
    }
    account.available_usd = asCurrency(account.available_usd - amount);
  } else if (request.action === "adjustment") {
    account.available_usd = asCurrency(account.available_usd + amount);
  }

  return {
    reservation,
    balance_after_usd: computeBalanceAfter(account),
  };
}

function submitAndExecuteMovement(state, input, options = {}) {
  ensureShape(state);
  const at = toIso(options.now);
  const action = String(input.action || "");
  if (!MOVEMENT_ACTIONS.has(action)) {
    throw new Error("action must be one of deposit|reserve|release_reserve|approve_use|withdraw|adjustment.");
  }

  const amount = toAmount(input.amount_usd, "amount_usd");
  const requestedBy = typeof input.requested_by === "string" && input.requested_by.trim();
  if (!requestedBy) {
    throw new Error("requested_by is required.");
  }
  const performedBy = typeof input.performed_by === "string" && input.performed_by.trim();
  if (!performedBy) {
    throw new Error("performed_by is required.");
  }
  const authorizedBy = typeof input.authorized_by === "string" && input.authorized_by.trim();
  if (!authorizedBy) {
    throw new Error("authorized_by is required.");
  }
  const reason = typeof input.reason === "string" && input.reason.trim();
  if (!reason) {
    throw new Error("reason is required.");
  }

  const request = buildRequest(
    state,
    {
      ...input,
      requested_by: requestedBy,
      reason,
    },
    at,
    action,
    amount
  );

  const { reservation } = applyAccounting(state, request, at);
  request.status = "executed";
  state.requests.push(request);

  const entry = appendLedgerEntry(state, {
    action,
    amount_usd: amount,
    performed_by: performedBy,
    authorized_by: authorizedBy,
    request_id: request.request_id,
    opportunity_id: request.opportunity_id,
    approval_ticket_id: request.approval_ticket_id,
    notes: typeof input.notes === "string" ? input.notes : reason,
  }, at);

  state.account.as_of = at;
  state.updated_at = at;

  return {
    request,
    reservation,
    entry,
    account: state.account,
  };
}

function findPendingWithdrawalRequest(state, requestId) {
  return (
    state.requests.find(
      (request) =>
        request.request_id === requestId &&
        request.action === WITHDRAWAL_REQUEST_ACTION &&
        request.status === "requested"
    ) || null
  );
}

function listPendingWithdrawalRequests(state) {
  ensureShape(state);
  return state.requests
    .filter((request) => request.action === WITHDRAWAL_REQUEST_ACTION && request.status === "requested")
    .map((request) => ({ ...request }));
}

function submitWithdrawalRequest(state, input, options = {}) {
  ensureShape(state);
  const at = toIso(options.now);
  const amount = toAmount(input.amount_usd, "amount_usd");
  const reason = String(input.reason || "").trim();
  if (!reason) {
    throw new Error("reason is required.");
  }
  if (state.account.available_usd < amount) {
    throw new Error("Insufficient available capital for withdrawal request.");
  }
  if (state.account.pending_withdrawal_usd < 0) {
    throw new Error("Invalid capital state: pending_withdrawal_usd cannot be negative.");
  }

  const request = buildRequest(
    state,
    {
      ...input,
      requested_by: requireActor(input.requested_by, "requested_by"),
      reason,
    },
    at,
    WITHDRAWAL_REQUEST_ACTION,
    amount
  );
  if (!WITHDRAWAL_REQUEST_STATUSES.has(request.status)) {
    throw new Error("Invalid withdrawal request status.");
  }

  state.account.available_usd = asCurrency(state.account.available_usd - amount);
  state.account.pending_withdrawal_usd = asCurrency(state.account.pending_withdrawal_usd + amount);
  state.requests.push(request);

  const actor = requireActor(input.performed_by || input.requested_by, "performed_by");
  const entry = appendLedgerEntry(
    state,
    {
      action: WITHDRAWAL_REQUEST_ACTION,
      amount_usd: amount,
      performed_by: actor,
      authorized_by: requireActor(input.authorized_by || input.requested_by, "authorized_by"),
      request_id: request.request_id,
      notes:
        typeof input.notes === "string" && input.notes.trim()
          ? input.notes
          : `Withdrawal requested: ${reason}`,
    },
    at
  );

  state.account.as_of = at;
  state.updated_at = at;

  return {
    request,
    entry,
    account: state.account,
    preview: {
      request_id: request.request_id,
      requested_amount_usd: request.amount_usd,
      current_available_usd: state.account.available_usd,
      current_pending_withdrawal_usd: state.account.pending_withdrawal_usd,
      resulting_available_usd_after_execution: state.account.available_usd,
    },
  };
}

function approveWithdrawalRequest(state, input, options = {}) {
  ensureShape(state);
  const at = toIso(options.now);
  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (!requestId) {
    throw new Error("request_id is required.");
  }
  if (input.confirm_irreversible !== true) {
    throw new Error("confirm_irreversible must be true for withdrawal approval.");
  }
  const request = findPendingWithdrawalRequest(state, requestId);
  if (!request) {
    throw new Error(`Pending withdrawal request not found: ${requestId}`);
  }
  if (state.account.pending_withdrawal_usd < request.amount_usd) {
    throw new Error("Invalid capital state: pending withdrawal balance is lower than request amount.");
  }

  state.account.pending_withdrawal_usd = asCurrency(state.account.pending_withdrawal_usd - request.amount_usd);
  request.status = "executed";
  request.approved_at = at;
  request.approved_by = requireActor(input.authorized_by, "authorized_by");
  request.executed_at = at;

  const entry = appendLedgerEntry(
    state,
    {
      action: WITHDRAWAL_EXECUTION_ACTION,
      amount_usd: request.amount_usd,
      performed_by: requireActor(input.performed_by, "performed_by"),
      authorized_by: request.approved_by,
      request_id: request.request_id,
      notes:
        typeof input.notes === "string" && input.notes.trim()
          ? input.notes
          : "Withdrawal approved and executed by explicit user confirmation.",
    },
    at
  );

  state.account.as_of = at;
  state.updated_at = at;

  return {
    request,
    entry,
    account: state.account,
  };
}

function cancelWithdrawalRequest(state, input, options = {}) {
  ensureShape(state);
  const at = toIso(options.now);
  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (!requestId) {
    throw new Error("request_id is required.");
  }
  const decision = input.decision === "reject" ? "reject" : "cancel";
  const action = decision === "reject" ? WITHDRAWAL_REJECT_ACTION : WITHDRAWAL_CANCEL_ACTION;
  const status = decision === "reject" ? "rejected" : "cancelled";
  const defaultReason =
    decision === "reject" ? "Rejected by user." : "Cancelled by user.";
  const request = findPendingWithdrawalRequest(state, requestId);
  if (!request) {
    throw new Error(`Pending withdrawal request not found: ${requestId}`);
  }
  if (state.account.pending_withdrawal_usd < request.amount_usd) {
    throw new Error("Invalid capital state: pending withdrawal balance is lower than request amount.");
  }

  state.account.pending_withdrawal_usd = asCurrency(state.account.pending_withdrawal_usd - request.amount_usd);
  state.account.available_usd = asCurrency(state.account.available_usd + request.amount_usd);
  request.status = status;
  request.resolved_at = at;
  request.resolved_by = requireActor(input.authorized_by, "authorized_by");
  request.resolution_reason = String(input.reason || "").trim() || defaultReason;

  const entry = appendLedgerEntry(
    state,
    {
      action,
      amount_usd: request.amount_usd,
      performed_by: requireActor(input.performed_by, "performed_by"),
      authorized_by: request.resolved_by,
      request_id: request.request_id,
      notes:
        typeof input.notes === "string" && input.notes.trim()
          ? input.notes
          : `Withdrawal request ${request.request_id} ${status}.`,
    },
    at
  );

  state.account.as_of = at;
  state.updated_at = at;

  return {
    request,
    entry,
    account: state.account,
  };
}

function verifyLedgerIntegrity(state) {
  ensureShape(state);
  const errors = [];
  let previousHash = null;
  let last = null;

  for (const entry of state.ledger) {
    if (!entry || typeof entry !== "object") {
      errors.push("Ledger entry must be an object.");
      continue;
    }
    if (entry.previous_entry_hash !== previousHash) {
      errors.push(`Ledger chain mismatch at ${entry.entry_id}.`);
    }
    const expectedHash = hashEntry(buildEntryHashInput(entry, previousHash));
    if (entry.entry_hash !== expectedHash) {
      errors.push(`Ledger hash mismatch at ${entry.entry_id}.`);
    }
    previousHash = entry.entry_hash || null;
    last = entry;
  }

  if (last) {
    if (state.account.reserved_usd !== last.reserved_after_usd) {
      errors.push("Account reserved_usd does not match latest ledger entry.");
    }
    if (state.account.committed_usd !== last.committed_after_usd) {
      errors.push("Account committed_usd does not match latest ledger entry.");
    }
    if (
      typeof last.pending_withdrawal_after_usd === "number" &&
      state.account.pending_withdrawal_usd !== last.pending_withdrawal_after_usd
    ) {
      errors.push("Account pending_withdrawal_usd does not match latest ledger entry.");
    }
    const accountBalance = computeBalanceAfter(state.account);
    if (accountBalance !== last.balance_after_usd) {
      errors.push("Account balance does not match latest ledger entry.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    entry_count: state.ledger.length,
    latest_entry_id: last ? last.entry_id : null,
  };
}

module.exports = {
  MOVEMENT_ACTIONS,
  WITHDRAWAL_REQUEST_ACTION,
  WITHDRAWAL_EXECUTION_ACTION,
  WITHDRAWAL_CANCEL_ACTION,
  WITHDRAWAL_REJECT_ACTION,
  createEmptyCapitalState,
  ensureShape,
  loadCapitalState,
  saveCapitalState,
  submitAndExecuteMovement,
  submitWithdrawalRequest,
  approveWithdrawalRequest,
  cancelWithdrawalRequest,
  listPendingWithdrawalRequests,
  verifyLedgerIntegrity,
};
