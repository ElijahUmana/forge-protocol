"use client";

import { useState, useEffect, useCallback } from "react";

interface Finding {
  id: string;
  severity: string;
  title: string;
  description: string;
  file: string;
  suggestion: string;
}

interface LogEntry {
  timestamp: string;
  agent: string;
  type: string;
  action: string;
  tokensUsed: number;
}

interface Budget {
  maxTokens: number;
  usedTokens: number;
  maxApiCalls: number;
  usedApiCalls: number;
  estimatedCostUSD: number;
}

interface Step {
  id: string;
  agent: string;
  action: string;
  status: string;
}

interface RunData {
  id: string;
  status: string;
  targetRepo: string;
  startedAt: string;
  completedAt: string | null;
  steps: Step[];
  log: LogEntry[];
  budget: Budget;
  findings: Finding[];
  erc8004Txs: { type: string; hash: string; chain: string; status: string }[];
}

interface WalletInfo {
  address: string;
  balance: string;
  chain: string;
}

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "text-purple-400",
  scanner: "text-blue-400",
  analyzer: "text-amber-400",
  fixer: "text-green-400",
  reviewer: "text-cyan-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function Dashboard() {
  const [repoUrl, setRepoUrl] = useState("");
  const [run, setRun] = useState<RunData | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "findings" | "identity">("overview");
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  // Fetch wallet info on mount
  useEffect(() => {
    fetch("/api/register")
      .then((r) => r.json())
      .then(setWallet)
      .catch(() => {});
  }, []);

  // Poll for run status
  const pollStatus = useCallback(() => {
    if (!isRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/run");
        const data = await res.json();
        if (data.run) {
          setRun(data.run);
          if (data.run.status !== "running") {
            setIsRunning(false);
            clearInterval(interval);
          }
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    return pollStatus();
  }, [pollStatus]);

  const startRun = async () => {
    if (!repoUrl) return;
    setIsRunning(true);
    setRun(null);
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetRepo: repoUrl }),
    });
  };

  const registerAgent = async () => {
    setRegisterResult("Registering...");
    try {
      const res = await fetch("/api/register", { method: "POST" });
      const data = await res.json();
      setRegisterResult(
        data.success
          ? `Registered! Agent ID: ${data.agentId} | TX: ${data.hash}`
          : `Error: ${data.error}`
      );
    } catch (err) {
      setRegisterResult(`Failed: ${err}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center font-bold text-sm">
              F
            </div>
            <div>
              <h1 className="text-lg font-semibold">Forge Protocol</h1>
              <p className="text-xs text-zinc-500">
                Autonomous Multi-Agent Security Auditor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {wallet && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-zinc-400">
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-400">{wallet.balance} ETH</span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-500">Base Sepolia</span>
              </div>
            )}
            {run && (
              <div
                className={`px-3 py-1.5 rounded-lg border ${
                  run.status === "running"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : run.status === "completed"
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                {run.status.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Input Bar */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex gap-3">
          <input
            type="text"
            placeholder="Enter GitHub repository URL (e.g., https://github.com/owner/repo)"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
            onKeyDown={(e) => e.key === "Enter" && startRun()}
          />
          <button
            onClick={startRun}
            disabled={isRunning || !repoUrl}
            className="px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-sm font-medium transition-colors"
          >
            {isRunning ? "Running..." : "Analyze"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(["overview", "logs", "findings", "identity"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "findings" && run && run.findings.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                  {run.findings.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {!run && !isRunning ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">Autonomous Security Analysis</h2>
              <p className="text-zinc-500 max-w-md mb-8">
                Enter a GitHub repository URL above. Five specialized AI agents will
                autonomously discover, analyze, fix, and verify security issues.
              </p>
              <div className="grid grid-cols-5 gap-4 max-w-2xl w-full">
                {[
                  { name: "Orchestrator", desc: "Plans & delegates", color: "violet" },
                  { name: "Scanner", desc: "Discovers issues", color: "blue" },
                  { name: "Analyzer", desc: "Deep analysis", color: "amber" },
                  { name: "Fixer", desc: "Generates fixes", color: "green" },
                  { name: "Reviewer", desc: "Verifies quality", color: "cyan" },
                ].map((agent) => (
                  <div
                    key={agent.name}
                    className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-center"
                  >
                    <div className={`text-sm font-medium text-${agent.color}-400`}>
                      {agent.name}
                    </div>
                    <div className="text-xs text-zinc-600 mt-1">{agent.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "overview" ? (
            <div className="grid grid-cols-3 gap-6">
              {/* Pipeline Steps */}
              <div className="col-span-2 space-y-3">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">
                  Execution Pipeline
                </h3>
                {run?.steps.map((step) => (
                  <div
                    key={step.id}
                    className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            step.status === "completed"
                              ? "bg-green-500"
                              : step.status === "in_progress"
                              ? "bg-amber-500 animate-pulse"
                              : step.status === "failed"
                              ? "bg-red-500"
                              : "bg-zinc-700"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium ${
                            AGENT_COLORS[step.agent] ?? "text-zinc-300"
                          }`}
                        >
                          {step.agent.charAt(0).toUpperCase() + step.agent.slice(1)}
                        </span>
                        <span className="text-sm text-zinc-400">{step.action}</span>
                      </div>
                      <span className="text-xs text-zinc-600">
                        {step.status}
                      </span>
                    </div>
                  </div>
                ))}
                {isRunning && (
                  <div className="p-4 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Agents working autonomously...
                    </div>
                  </div>
                )}
              </div>

              {/* Budget & Stats Sidebar */}
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">
                    Compute Budget
                  </h4>
                  {run?.budget && (
                    <div className="space-y-3">
                      <BudgetBar
                        label="Tokens"
                        used={run.budget.usedTokens}
                        max={run.budget.maxTokens}
                      />
                      <BudgetBar
                        label="API Calls"
                        used={run.budget.usedApiCalls}
                        max={run.budget.maxApiCalls}
                      />
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Est. Cost</span>
                        <span className="text-zinc-300">
                          ${run.budget.estimatedCostUSD.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">
                    Summary
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Findings</span>
                      <span>{run?.findings.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Critical</span>
                      <span className="text-red-400">
                        {run?.findings.filter((f) => f.severity === "critical").length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">High</span>
                      <span className="text-orange-400">
                        {run?.findings.filter((f) => f.severity === "high").length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Steps</span>
                      <span>{run?.steps.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Log Entries</span>
                      <span>{run?.log.length ?? 0}</span>
                    </div>
                  </div>
                </div>

                {run?.erc8004Txs && run.erc8004Txs.length > 0 && (
                  <div className="p-4 rounded-lg bg-zinc-900/50 border border-violet-500/20">
                    <h4 className="text-sm font-medium text-violet-400 mb-3">
                      ERC-8004 Transactions
                    </h4>
                    {run.erc8004Txs.map((tx, i) => (
                      <div key={i} className="text-xs space-y-1">
                        <div className="text-zinc-400">{tx.type}</div>
                        <a
                          href={`https://sepolia.basescan.org/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline break-all"
                        >
                          {tx.hash.slice(0, 20)}...
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === "logs" ? (
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">
                Execution Log ({run?.log.length ?? 0} entries)
              </h3>
              <div className="font-mono text-xs space-y-0.5 max-h-[600px] overflow-y-auto">
                {run?.log.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 px-3 py-1.5 rounded ${
                      entry.type === "guardrail"
                        ? "bg-amber-500/5"
                        : entry.type === "error"
                        ? "bg-red-500/5"
                        : "hover:bg-zinc-900/50"
                    }`}
                  >
                    <span className="text-zinc-600 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`shrink-0 w-24 ${
                        AGENT_COLORS[entry.agent] ?? "text-zinc-400"
                      }`}
                    >
                      [{entry.agent}]
                    </span>
                    <span className="text-zinc-600 shrink-0 w-20">
                      {entry.type}
                    </span>
                    <span className="text-zinc-300">{entry.action}</span>
                    {entry.tokensUsed > 0 && (
                      <span className="text-zinc-600 shrink-0">
                        {entry.tokensUsed.toLocaleString()} tok
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "findings" ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">
                Security Findings ({run?.findings.length ?? 0})
              </h3>
              {run?.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium border ${
                        SEVERITY_COLORS[finding.severity] ?? SEVERITY_COLORS.info
                      }`}
                    >
                      {finding.severity.toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{finding.title}</h4>
                      <p className="text-xs text-zinc-500 mt-1">
                        {finding.description}
                      </p>
                      {finding.file && (
                        <p className="text-xs text-zinc-600 mt-2 font-mono">
                          {finding.file}
                        </p>
                      )}
                      {finding.suggestion && (
                        <div className="mt-2 p-2 rounded bg-zinc-800/50 text-xs text-zinc-400">
                          {finding.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!run?.findings || run.findings.length === 0) && (
                <div className="text-center py-12 text-zinc-600">
                  {isRunning
                    ? "Scanning in progress..."
                    : "No findings yet. Run an analysis to see results."}
                </div>
              )}
            </div>
          ) : activeTab === "identity" ? (
            <div className="max-w-xl space-y-6">
              <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">
                  ERC-8004 Agent Identity
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Agent Name</span>
                    <span>Forge Protocol</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Operator Wallet</span>
                    <span className="font-mono text-xs">
                      {wallet?.address ?? "Loading..."}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Chain</span>
                    <span>Base Sepolia (84532)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Balance</span>
                    <span>{wallet?.balance ?? "0"} ETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Identity Registry</span>
                    <span className="font-mono text-xs text-zinc-400">
                      0x8004...BD9e
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Reputation Registry</span>
                    <span className="font-mono text-xs text-zinc-400">
                      0x8004...8713
                    </span>
                  </div>
                </div>
                <button
                  onClick={registerAgent}
                  className="mt-4 w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
                >
                  Register On-Chain Identity
                </button>
                {registerResult && (
                  <p className="mt-3 text-xs text-zinc-400 break-all">
                    {registerResult}
                  </p>
                )}
              </div>

              <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">
                  Agent Capabilities
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    "code_security_audit",
                    "code_quality_review",
                    "bug_detection",
                    "automated_fixes",
                    "multi_agent_orchestration",
                    "erc8004_identity",
                    "reputation_tracking",
                    "github_integration",
                  ].map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-zinc-600">
          <span>Forge Protocol v1.0 | Synthesis Hackathon 2026</span>
          <span>ERC-8004 on Base Sepolia | Chain ID 84532</span>
        </div>
      </footer>
    </div>
  );
}

function BudgetBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-400">
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
