# Forge Protocol

**The First Autonomous Security Auditor with On-Chain Accountability**

Every existing tool can find and fix bugs. Copilot Autofix, Snyk Agent Fix, OpenAI Aardvark — they all do AI-powered security scanning. **None of them can prove they did it reliably, build verifiable reputation over time, or let other agents trust their results on-chain.**

Forge Protocol combines deterministic security tools (Semgrep, custom SAST, GitHub Advisory Database) with AI reasoning (Claude), coordinated through ERC-8004 on-chain trust, inter-agent message passing, x402 micropayments, and autonomous PR creation.

**Live demo:** https://forge-protocol-eight.vercel.app
**Synthesis Agent #35843** (Base Mainnet) | **ERC-8004 Agent #2221** (Ethereum Sepolia)

---

## Why This Exists

Free tools exist for security scanning. Semgrep, CodeQL, Snyk, Dependabot — a developer can add these to CI and catch known vulnerability patterns. But three problems remain unsolved:

1. **No accountability.** When an automated tool reports (or misses) a vulnerability, there's no way to verify the tool's track record. A tool that hallucinates findings and a tool that catches real bugs look identical until something breaks in production.

2. **No contextual reasoning.** SAST tools match patterns. They can't understand business logic, evaluate whether a "vulnerability" is actually exploitable in context, or propose fixes that preserve the code's intent.

3. **No autonomous operation.** Existing tools require human setup, configuration, triage, and remediation. The gap between "tool finds a bug" and "bug gets fixed" is weeks to months.

Forge Protocol closes all three gaps:

- **On-chain accountability via ERC-8004.** Every audit builds verifiable reputation. Agent #2221's identity, every reputation score, and every audit attestation are recorded on Ethereum Sepolia — permanently, transparently, cryptographically signed. A developer can check an auditor's track record before trusting its findings.

- **Hybrid deterministic + AI analysis.** Semgrep and custom SAST provide ground truth. Claude provides contextual reasoning. CVE databases provide known vulnerability data. The combination catches what either approach alone would miss.

- **Full autonomy with self-correction.** Give it a repo URL. The Orchestrator plans, Scanner scans with real tools, Analyzer performs deep CWE analysis, Fixer generates patches, Reviewer validates — and if the Reviewer rejects, the Fixer automatically retries. No human in the loop.

**No production system combines these three capabilities.** Autonomous security auditing with on-chain identity and verifiable reputation does not exist in the current tooling landscape.

---

## Architecture

```
                     USER INPUT (GitHub repo URL)
                              |
                     [Orchestrator Agent]
                     Parses JSON plan dynamically
                     Decides which agents to invoke
                              |
              +---------------+---------------+
              |               |               |
      [Scanner Agent]   [Analyzer Agent]  [Fixer Agent]
      Runs 4 tools:     Deep CWE analysis  Generates fixes
      - Semgrep SAST    Exploit scenarios   Follows code style
      - Custom SAST     Impact assessment   Minimal diffs
      - GitHub Advisory                          |
      - GitHub API                          [Reviewer Agent]
              |                             Approves/rejects
              |                             If rejected:
              |                             [Self-Correction]
              |                             Fixer retries
              |                                  |
              +------ Inter-Agent Message Bus ---+
              |       (typed: task_assignment,   |
              |        result, feedback,         |
              |        rejection, trust_query)   |
              |                                  |
         [ERC-8004 Trust Gate]           [x402 Payment Layer]
         ownerOf() verification          Cost calculation
         tokenURI() check                Payment headers
         Dynamic reputation              Receipt verification
              |                                  |
         [On-Chain]                        [Output]
         Identity Registry               Security report
         Reputation Registry             GitHub PR
         Ethereum Sepolia                agent_log.json
```

### Security Tool Stack (4 Ground-Truth Tools)

| Tool | Type | What It Does |
|------|------|-------------|
| **Semgrep** (v1.156.0) | Production SAST | Runs real Semgrep rules against fetched source code in temp sandbox |
| **Custom SAST** | Pattern scanner | 12 OWASP-aligned regex rules with CWE mapping (CWE-78 through CWE-942) |
| **GitHub Advisory Database** | CVE lookup | Queries real known vulnerabilities for every npm dependency |
| **GitHub API** | Code access | Fetches repository structure, source files, package manifests |

These tools run BEFORE the AI analysis. Claude receives their results as ground truth and uses them alongside its own contextual reasoning. This hybrid approach means findings are backed by real evidence, not just LLM opinions.

---

## On-Chain Proof

All verifiable on blockchain explorers:

| Asset | Details | Link |
|-------|---------|------|
| **ERC-8004 Identity** | Agent #2221, Ethereum Sepolia | [View TX](https://sepolia.etherscan.io/tx/0xadf3b56f10b60f40ca7a7973749c9612fd9ed5b0d160a45223e7ae5eb5c9a2ab) |
| **Reputation Score** | 95/100 from independent Reviewer agent | [View TX](https://sepolia.etherscan.io/tx/0x96b4ae35ec3d52657f3be1bf135cac24da1b344055eac7196c697daf4ec99929) |
| **Synthesis Identity** | Agent #35843, Base Mainnet | [View TX](https://basescan.org/tx/0xc53f8a24b9d206c9134d986b7e4b5452a1d41e3e5a3e2f772d57b3c0d83cd977) |
| **Reviewer Funding** | ETH transfer to reviewer wallet | [View TX](https://sepolia.etherscan.io/tx/0x1ee6e604344b0c8d3787ffa37ee43f84daec8aedb1dd0110948997c7f5679db3) |

**Trust-gating in action:** Before agents collaborate, the Orchestrator queries `ownerOf()` on the ERC-8004 Identity Registry to verify the agent has a registered on-chain identity. Agents without verified identities are refused collaboration. This is checked every run (visible in agent_log.json).

**Dynamic reputation:** After each audit, a reputation score is computed from actual results (number of findings, severity distribution, completion rate) and submitted to the Reputation Registry. This score is NOT hardcoded -- it varies based on audit quality.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/run` | Start security audit. Returns x402 payment headers. |
| `GET` | `/api/run` | Poll pipeline status (with cached results fallback) |
| `POST` | `/api/stream` | SSE stream of real-time pipeline updates |
| `GET` | `/api/register` | Agent identity, balance, ERC-8004 IDs, TX hashes |
| `POST` | `/api/register` | Register new ERC-8004 identity on-chain |
| `POST` | `/api/create-pr` | Fork repo, create audit branch, open PR with findings |
| `GET` | `/api/agent-log` | Full structured execution log |

### x402 Micropayment Protocol

The `/api/run` endpoint implements x402. Responses include:
```
X-Payment-Required: true
X-Payment-Amount: 0.60
X-Payment-Currency: USDC
X-Payment-Chain: base
X-Payment-Recipient: 0xad114d421E106a845b196BdBe527A9dc4b7e8EF5
```

Agents can pay for audits by including `X-Payment-Tx`, `X-Payment-Amount`, and `X-Payment-Payer` headers.

---

## Demo: OWASP Juice Shop Audit

Forge Protocol was pointed at [OWASP Juice Shop](https://github.com/juice-shop/juice-shop), a deliberately vulnerable web application used for security training. The autonomous pipeline produced:

**12 real vulnerabilities found:**
- **[CRITICAL]** Hardcoded encryption keys in repository
- **[HIGH]** Vulnerable body-parser dependency causing DoS
- **[HIGH]** Vulnerable colors.js dependency causing infinite loop DoS
- **[HIGH]** Intentionally insecure JWT implementation
- **[HIGH]** Weak password hashing implementation
- **[MEDIUM]** SQL injection vulnerabilities
- **[MEDIUM]** File upload vulnerabilities
- **[MEDIUM]** Insecure direct object references
- Plus 4 additional medium/low/info findings

**Pipeline execution:**
- 5 ground-truth tools: Semgrep 1.156.0 + custom SAST (12 rules) + GitHub Advisory Database + GitHub API + Claude
- 6 pipeline steps: Plan, Scan, Analyze, Fix, Review, Self-Correct
- Trust gate: Agent #2221 identity verified via ownerOf() before agent collaboration
- Dynamic reputation: Score computed from actual audit metrics (not hardcoded)
- Inter-agent messages: Structured delegations via AgentMessageBus
- Autonomous PR creation: fork + audit branch + SECURITY_AUDIT.md + pull request
- 56K tokens, 18 API calls, $0.51 total cost

See `agent_log.json` for the complete execution trace with all 35+ log entries.

---

## Inter-Agent Communication

Agents communicate via typed messages through AgentMessageBus:

```typescript
interface AgentMessage {
  from: AgentRole;       // "orchestrator" | "scanner" | "analyzer" | "fixer" | "reviewer"
  to: AgentRole;
  type: "task_assignment" | "result" | "feedback" | "rejection" | "trust_query";
  payload: unknown;
  timestamp: string;
  messageId: string;
}
```

Message flow per run:
1. Orchestrator -> Scanner: `task_assignment` (repo to scan)
2. Scanner -> Orchestrator: `result` (findings)
3. Orchestrator -> Analyzer: `task_assignment` (critical findings)
4. Fixer -> Reviewer: `result` (proposed fixes)
5. Reviewer -> Fixer: `rejection` or `feedback` (triggers self-correction)

---

## Safety and Guardrails

| Guardrail | Mechanism |
|-----------|-----------|
| **ERC-8004 Trust Gate** | ownerOf() + tokenURI() verification before agent collaboration |
| **Sensitive Path Blocking** | Agents cannot access .env, credentials, .git/config |
| **File Size Truncation** | Files > 5KB truncated to prevent context overflow |
| **Max Iteration Limits** | 10 tool-use iterations per agent (prevents infinite loops) |
| **Compute Budget** | Token/API call/cost limits enforced; pipeline halts if exceeded |
| **Review Gate** | All fixes require Reviewer approval; rejection triggers retry |
| **Self-Correction** | Fixer automatically retries with Reviewer feedback on rejection |

---

## Quick Start

```bash
git clone https://github.com/ElijahUmana/forge-protocol.git
cd forge-protocol
npm install
cp .env.example .env.local  # Add your API keys
npm run dev                  # Open http://localhost:3000
```

### Environment Variables

```
ANTHROPIC_API_KEY=           # Claude API for agent reasoning
AGENT_PRIVATE_KEY=0x...      # EVM wallet for ERC-8004 transactions
AGENT_ADDRESS=0x...          # Derived wallet address
GITHUB_TOKEN=ghp_...         # GitHub API (higher rate limits + Advisory DB)
```

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.2.1 | Full-stack framework |
| TypeScript | 5.x | Language |
| Tailwind CSS | 4.x | Styling |
| Claude API | claude-sonnet-4 | Agent reasoning with tool_use |
| Semgrep | 1.156.0 | Production SAST scanning |
| viem | 2.47.6 | EVM/blockchain interaction |
| ERC-8004 | Mainnet + Sepolia | On-chain agent identity and reputation |
| GitHub API | v3 | Repository scanning, Advisory Database, PR creation |
| x402 Protocol | - | Agent-to-agent micropayments |

---

## Submission Artifacts

- `agent.json` -- Machine-readable capability manifest with ERC-8004 IDs and TX hashes
- `agent_log.json` -- 49-entry structured execution log from real pipeline run
- `AGENTS.md` -- Full API documentation for agentic judges
- Live deployment at https://forge-protocol-eight.vercel.app

---

## Team

**Elijah Umana** -- [GitHub](https://github.com/ElijahUmana) | Minerva University

Built for the Synthesis Hackathon (March 2026) x PL_Genesis: Frontiers of Collaboration.

## License

MIT
