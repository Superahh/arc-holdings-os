# Product Spec

## Problem

Most prompt usage is disposable, inconsistent, and hard to improve over time. Good results are hard to reproduce because context, constraints, and evaluation standards are rarely packaged in a repeatable way.

## User

This project is for builders who use AI seriously and want:

- better outputs
- lower ambiguity
- faster reuse
- less repeated context dumping
- a reliable way to iterate from failure

## Core outcome

The user should be able to define a task, attach the right context, run a prompt, evaluate the result, and improve the prompt using a lightweight repeatable workflow.

## Main features

- reusable prompt templates
- system and task role definitions
- product and technical context files
- explicit constraints and success criteria
- failure logging and experiment tracking
- version-friendly markdown structure

## Non-goals

What we are not building yet:

- a SaaS product
- a full prompt registry with search and tagging
- automated eval infrastructure
- model orchestration pipelines
- a bloated framework with unclear ROI

## Version 1 scope

Version 1 should be enough to:

- capture project context cleanly
- write better prompts faster
- compare prompt versions manually
- learn from failures in a durable way

## Success condition

This product is working if a new project can start from this repo and produce better AI outputs in less time than an unstructured chat-based workflow.
