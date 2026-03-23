# Forge Protocol — Agent Interface Guide

## What This System Does

Forge Protocol is an autonomous multi-agent security auditor combining deterministic SAST scanning, real CVE lookups, and AI reasoning — with ERC-8004 trust-gated collaboration, dynamic on-chain reputation, x402 micropayments, and autonomous PR creation. Give it a GitHub repository URL and watch agents plan, scan, analyze, fix, verify, and self-correct — without human intervention.

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
Registers the agent's identity on the ERC-8004 Identity Registry on Ethereum Sepolia.

**Real-time SSE streaming:**
```bash
POST /api/stream
Content-Type: application/json

{"targetRepo": "https://github.com/owner/repo"}
```
Returns a Server-Sent Events stream with real-time pipeline updates. Events: `connected`, `update` (per-step progress), `complete` (final results), `error`.

**Create GitHub PR with fixes:**
```bash
POST /api/create-pr
Content-Type: application/json

{"owner": "repo-owner", "repo": "repo-name", "findings": [...], "fixes": "..."}
```
Forks the target repo, creates a security audit branch, commits SECURITY_AUDIT.md, and opens a PR.

**x402 Micropayments:**
The `/api/run` endpoint supports x402 payment protocol headers. When a run starts, the response includes `X-Payment-Required`, `X-Payment-Amount`, `X-Payment-Currency`, and `X-Payment-Recipient` headers. Send payment proof via `X-Payment-Tx` header.

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

## Inter-Agent Communication

Agents communicate via a structured message bus (AgentMessageBus) with typed messages:
- `task_assignment`: Orchestrator assigns work to specialized agents
- `result`: Agent sends completed work back
- `feedback`: Reviewer sends approval/rejection feedback
- `rejection`: Triggers self-correction loop in Fixer
- `trust_query` / `trust_response`: ERC-8004 reputation verification

Message format: `{from, to, type, payload, timestamp, messageId}`

## Ground-Truth Security Tools

Three deterministic tools run alongside AI analysis:
1. **SAST Pattern Scanner**: 12 OWASP-aligned rules (CWE-mapped) detect hardcoded secrets, SQL injection, XSS, command injection, eval usage, insecure crypto, path traversal
2. **GitHub Advisory Database**: Real CVE lookups against known vulnerabilities in npm dependencies
3. **GitHub API**: Repository structure and source code fetching

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
