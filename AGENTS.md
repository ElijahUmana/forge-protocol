# Forge Protocol — Agent Interface Guide

## What This System Does

Forge Protocol is an autonomous multi-agent security auditor. Give it a GitHub repository URL, and five specialized AI agents will independently discover, analyze, and fix security vulnerabilities — without human intervention.

## How to Interact

### REST API

**Start an analysis:**
```bash
POST /api/run
Content-Type: application/json

{
  "targetRepo": "https://github.com/owner/repo",
  "maxTokens": 500000,
  "maxApiCalls": 100,
  "focusAreas": ["security", "code_quality"]
}
```

**Check status:**
```bash
GET /api/run
```
Returns the current run status, all agent steps, findings, execution logs, compute budget usage, and ERC-8004 transaction records.

**View structured execution logs:**
```bash
GET /api/agent-log
```
Returns the full agent_log.json with all decisions, tool calls, guardrail activations, and token usage.

**Check agent identity:**
```bash
GET /api/register
```
Returns the agent's wallet address, Base Sepolia ETH balance, and ERC-8004 registry addresses.

**Register ERC-8004 identity:**
```bash
POST /api/register
```
Registers the agent's identity on the ERC-8004 Identity Registry on Base Sepolia. Requires Base Sepolia ETH for gas.

### Web Dashboard

Visit the root URL to access the interactive dashboard with:
- Real-time pipeline visualization showing each agent's progress
- Execution log viewer with agent-specific color coding
- Security findings panel with severity ratings
- Compute budget tracker (tokens, API calls, estimated cost)
- ERC-8004 identity management panel

## Agent Architecture

Five agents operate in a sequential pipeline:

1. **Orchestrator** — Receives the target repository, decomposes the analysis into subtasks, and coordinates the pipeline. Makes decisions about prioritization and resource allocation.

2. **Scanner** — Explores the repository structure via GitHub API (fetch_repo_contents, fetch_file_content, search_code). Identifies potential security vulnerabilities, code quality issues, and dependency risks. Returns structured findings.

3. **Analyzer** — Performs deep analysis on critical/high-severity findings. Reads actual source code, maps to CWE categories, assesses exploitability, and provides confidence ratings.

4. **Fixer** — Generates minimal, targeted code fixes for confirmed vulnerabilities. Follows existing code style and ensures fixes don't introduce regressions.

5. **Reviewer** — Validates proposed fixes for correctness, evaluates quality, and gates approval before any changes are applied.

## Safety Guardrails

All agent operations are subject to six safety mechanisms:

1. **Sensitive Path Blocking** — Agents cannot access .env, credentials, .git/config, or secrets files
2. **File Size Truncation** — Files exceeding 10KB are truncated to prevent context overflow
3. **Max Iteration Limits** — Each agent limited to 10 tool-use iterations (prevents infinite loops)
4. **Compute Budget Enforcement** — Configurable token/API call/cost limits; pipeline halts when exceeded
5. **Transaction Validation** — ERC-8004 transactions validated before signing
6. **Review Gate** — All fixes must pass Reviewer agent before application

## ERC-8004 Integration

- **Chain:** Base Sepolia (Chain ID 84532)
- **Identity Registry:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Reputation Registry:** `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **Agent Wallet:** `0xad114d421E106a845b196BdBe527A9dc4b7e8EF5`
- **Synthesis Agent ID:** 35843 (Base Mainnet)
- **Registration TX:** https://basescan.org/tx/0xc53f8a24b9d206c9134d986b7e4b5452a1d41e3e5a3e2f772d57b3c0d83cd977

## Tech Stack

- Next.js 16, TypeScript, Tailwind CSS
- Claude API (claude-sonnet-4) with tool_use for agent reasoning
- viem for EVM/blockchain interaction
- GitHub REST API for repository scanning
- ERC-8004 registries on Base Sepolia

## Files

- `agent.json` — Machine-readable capability manifest
- `agent_log.json` — Structured execution logs from real pipeline runs
- `src/lib/agent-engine.ts` — Core multi-agent orchestration engine
- `src/lib/erc8004.ts` — ERC-8004 registry interaction (identity + reputation)
- `src/lib/logger.ts` — Structured logging with compute budget tracking
