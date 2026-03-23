# Forge Protocol

**Autonomous Multi-Agent Security Auditor with ERC-8004 On-Chain Trust**

Forge Protocol is a fully autonomous multi-agent system that discovers, analyzes, and fixes security vulnerabilities in GitHub repositories. Five specialized AI agents coordinate through a trust-gated pipeline, with all identities and reputation tracked on-chain via ERC-8004.

---

## The Problem

Open-source repositories accumulate security vulnerabilities faster than human reviewers can find them. Manual security audits are expensive, slow, and inconsistent. Meanwhile, AI-powered tools lack accountability — there's no way to verify an automated auditor's track record or trustworthiness.

## The Solution: Autonomous Agent Swarm + On-Chain Trust

Forge Protocol deploys five specialized AI agents in an autonomous pipeline:

| Agent | Role | Capabilities |
|-------|------|-------------|
| **Orchestrator** | Task decomposition & delegation | Planning, coordination, progress tracking |
| **Scanner** | Repository discovery & issue detection | GitHub API, code search, pattern matching |
| **Analyzer** | Deep vulnerability analysis | Static analysis, CWE mapping, impact assessment |
| **Fixer** | Code fix generation | Code generation, refactoring, minimal diffs |
| **Reviewer** | Fix verification & QA | Code review, regression checks, approval gates |

### How It Works

1. **Discover** — Scanner agent explores the repository structure via GitHub API
2. **Plan** — Orchestrator decomposes the analysis into subtasks
3. **Execute** — Scanner identifies issues, Analyzer performs deep analysis, Fixer generates patches
4. **Verify** — Reviewer validates all fixes before they're applied
5. **Record** — All decisions, tool calls, and outcomes logged to `agent_log.json`

**No human intervention required.** The agents operate autonomously from start to finish.

### Trust via ERC-8004

Every agent registers an on-chain identity via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on Base Sepolia:

- **Identity Registry** — Each agent has a unique ERC-721 token with capability metadata
- **Reputation Registry** — Audit quality scores recorded after each run
- **Validation Registry** — Third-party verification of agent behavior

Agents check each other's reputation before trusting outputs. The Reviewer won't skip reviewing the Fixer's code. The Orchestrator won't delegate critical tasks to low-reputation agents.

---

## Architecture

```
                    NEXT.JS DASHBOARD
    Repository Input -> Live Pipeline -> Findings
    Execution Logs | Budget Tracker | Identity Panel
                         |
                  AGENT ENGINE (TypeScript)
                         |
    Orchestrator -> Scanner -> Analyzer -> Fixer -> Reviewer
    (autonomous pipeline with tool use)
                         |
           +-------------+-------------+
           |             |             |
        GitHub        Claude       ERC-8004
         API           API       (Base Sepolia)
           |                        |
    fetch_repo_contents    Identity Registry
    fetch_file_content     Reputation Registry
    search_code            Validation Registry
```

---

## Quick Start

```bash
git clone https://github.com/ElijahUmana/forge-protocol.git
cd forge-protocol
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Run locally
npm run dev
# Open http://localhost:3000
```

### Environment Variables

```
ANTHROPIC_API_KEY=your-key       # Claude API for agent reasoning
AGENT_PRIVATE_KEY=0x...          # EVM wallet for ERC-8004 transactions
AGENT_ADDRESS=0x...              # Derived wallet address
GITHUB_TOKEN=ghp_...             # Optional: higher GitHub API rate limits
```

### Register ERC-8004 Identity

1. Fund the agent wallet with Base Sepolia ETH from a [faucet](https://faucet.quicknode.com/base/sepolia)
2. Open the app dashboard -> Identity tab
3. Click "Register On-Chain Identity"
4. Verify on [8004scan.io](https://www.8004scan.io/agents)

---

## Submission Artifacts

### agent.json -- Agent Capability Manifest

Machine-readable manifest describing agent capabilities, tools, compute constraints, and guardrails. See [`agent.json`](./agent.json).

### agent_log.json -- Structured Execution Logs

Generated during each run via the `/api/agent-log` endpoint. Contains:
- Every decision made by each agent
- All tool calls with inputs, outputs, and timing
- Guardrail activations (blocked paths, budget limits)
- ERC-8004 transaction records
- Token usage and cost estimates

### ERC-8004 On-Chain Artifacts

| Registry | Address (Base Sepolia) |
|----------|----------------------|
| Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

---

## Safety & Guardrails

Forge Protocol implements multiple safety layers:

1. **Sensitive Path Blocking** -- Agents cannot access `.env`, credentials, or git config files
2. **File Size Truncation** -- Large files are truncated to prevent context overflow
3. **Max Iteration Limits** -- Each agent limited to 10 tool-use iterations to prevent infinite loops
4. **Compute Budget Enforcement** -- Configurable token, API call, and cost limits. Pipeline halts when budget exceeded.
5. **Transaction Validation** -- ERC-8004 transactions validated before signing
6. **Review Gate** -- All generated fixes must pass Reviewer agent before application

---

## Judging Criteria Alignment

### Autonomy (35%)
Full decision loop: discover -> plan -> execute -> verify -> report. Five agents operate independently after initial repository URL input. No human intervention at any stage.

### Tool Use (25%)
Multi-tool orchestration across: GitHub API (3 tools), Claude API (reasoning), ERC-8004 contracts (identity + reputation). Agents use tools adaptively based on findings.

### Guardrails & Safety (20%)
Six distinct safety mechanisms: path blocking, size truncation, iteration limits, budget enforcement, transaction validation, and review gates. All guardrail activations logged.

### Impact (15%)
Automated security auditing addresses a real problem: open-source repos accumulate vulnerabilities faster than humans can review. On-chain reputation creates accountability for automated auditors.

### ERC-8004 Integration (Bonus 5%)
Uses both Identity Registry and Reputation Registry on Base Sepolia. Agent identity registered as ERC-721 token. Reputation updated after each audit run.

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 16 | Full-stack framework |
| TypeScript | Language |
| Tailwind CSS | Styling |
| Claude API (Sonnet) | Agent reasoning with tool use |
| viem | EVM/blockchain interaction |
| ERC-8004 | On-chain agent identity & reputation |
| Base Sepolia | Testnet for on-chain artifacts |
| GitHub API | Repository scanning & code access |

---

## Team

**Elijah Umana** -- [GitHub](https://github.com/ElijahUmana) | Minerva University

Built for the Synthesis Hackathon (March 2026) x PL_Genesis: Frontiers of Collaboration.

## License

MIT
