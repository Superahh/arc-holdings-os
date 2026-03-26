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
    performed_by: entry.performed_by,
    authorized_by: entry.authorized_by,
    request_id: entry.request_id,
    opportunity_id: entry.opportunity_id,
    notes: entry.notes,
  };
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
    account.reserved_usd = asCurrency(account.reserved_usd - amount);
    account.committed_usd = asCurrency(account.committed_usd + amount);
    reservation = activeReservation;
  } else if (request.action === "withdraw") {
    if (account.available_usd < amount) {
      throw new Error("Insufficient available capital for withdraw.");
    }
    account.available_usd = asCurrency(account.available_usd - amount);
    account.pending_withdrawal_usd = 0;
  } else if (request.action === "adjustment") {
    account.available_usd = asCurrency(account.available_usd + amount);
  }

  return {
    reservation,
    balance_after_usd: asCurrency(account.available_usd + account.reserved_usd + account.committed_usd),
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

  const request = {
    request_id:
      typeof input.request_id === "string" && input.request_id.trim()
        ? input.request_id.trim()
        : nextRequestId(state),
    action,
    amount_usd: amount,
    requested_by: requestedBy,
    requested_at: at,
    reason,
    opportunity_id: input.opportunity_id || null,
    approval_ticket_id: input.approval_ticket_id || null,
    status: "requested",
  };

  const { reservation, balance_after_usd } = applyAccounting(state, request, at);
  request.status = "executed";
  state.requests.push(request);

  const previousEntry = state.ledger[state.ledger.length - 1] || null;
  const previousEntryHash = previousEntry ? previousEntry.entry_hash : null;
  const entry = {
    entry_id: nextLedgerEntryId(state),
    timestamp: at,
    action,
    amount_usd: amount,
    balance_after_usd: balance_after_usd,
    reserved_after_usd: state.account.reserved_usd,
    committed_after_usd: state.account.committed_usd,
    performed_by: performedBy,
    authorized_by: authorizedBy,
    request_id: request.request_id,
    opportunity_id: request.opportunity_id,
    notes: typeof input.notes === "string" ? input.notes : reason,
    previous_entry_hash: previousEntryHash,
  };
  const hashInput = buildEntryHashInput(entry, previousEntryHash);
  entry.entry_hash = hashEntry(hashInput);
  state.ledger.push(entry);

  state.account.as_of = at;
  state.updated_at = at;

  return {
    request,
    reservation,
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
    const accountBalance = asCurrency(
      state.account.available_usd + state.account.reserved_usd + state.account.committed_usd
    );
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
  createEmptyCapitalState,
  ensureShape,
  loadCapitalState,
  saveCapitalState,
  submitAndExecuteMovement,
  verifyLedgerIntegrity,
};
