"use strict";

const config = require("./config");

function checkScopeGuardrails({ diffText }) {
  const lowered = diffText.toLowerCase();
  const warnings = [];

  for (const term of config.riskyTerms) {
    if (lowered.includes(term.toLowerCase())) {
      warnings.push(`Potential scope guardrail hit: "${term}"`);
    }
  }

  const heuristicPairs = [
    {
      test: lowered.includes("capital_fit") && lowered.includes("sort("),
      message: "capital_fit appears near sorting logic; check for accidental ranking influence.",
    },
    {
      test: lowered.includes("capital_fit") && lowered.includes("score"),
      message: "capital_fit appears near score language; check for shadow scoring creep.",
    },
    {
      test: lowered.includes("capital_strategy") && lowered.includes("approve"),
      message: "capital_strategy appears near approval semantics; verify no approval creep.",
    },
    {
      test: lowered.includes("capital_strategy") && lowered.includes("execute"),
      message: "capital_strategy appears near execute semantics; verify no write-path creep.",
    },
  ];

  for (const rule of heuristicPairs) {
    if (rule.test) {
      warnings.push(rule.message);
    }
  }

  return {
    name: "check_scope_guardrails",
    ok: warnings.length === 0,
    warnings,
  };
}

module.exports = { checkScopeGuardrails };