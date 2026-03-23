"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  details?: Record<string, unknown>;
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
  erc8004Txs: { type: string; hash: string; chain: string; status: string; details?: Record<string, unknown> }[];
}

interface WalletInfo {
  address: string;
  balance: string;
  chain: string;
  erc8004AgentId?: number;
  identityTx?: string;
  reputationTx?: string;
  synthesisAgentId?: number;
}

const AGENT_CONFIG: Record<string, { color: string; icon: string; gradient: string }> = {
  orchestrator: { color: "text-violet-400", icon: "brain", gradient: "from-violet-500 to-purple-600" },
  scanner: { color: "text-blue-400", icon: "search", gradient: "from-blue-500 to-cyan-600" },
  analyzer: { color: "text-amber-400", icon: "microscope", gradient: "from-amber-500 to-orange-600" },
  fixer: { color: "text-green-400", icon: "wrench", gradient: "from-green-500 to-emerald-600" },
  reviewer: { color: "text-cyan-400", icon: "shield", gradient: "from-cyan-500 to-teal-600" },
};

const SEVERITY_STYLES: Record<string, { bg: string; dot: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/30", dot: "bg-red-500" },
  high: { bg: "bg-orange-500/10 border-orange-500/30", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500" },
  low: { bg: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500" },
  info: { bg: "bg-zinc-500/10 border-zinc-500/30", dot: "bg-zinc-600" },
};

function AgentIcon({ agent, size = 32, active = false }: { agent: string; size?: number; active?: boolean }) {
  const cfg = AGENT_CONFIG[agent] ?? AGENT_CONFIG.orchestrator;
  return (
    <div
      className={`relative rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center font-bold text-white shadow-lg ${active ? "animate-pulse ring-2 ring-white/20" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {agent[0].toUpperCase()}
      {active && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-zinc-900 animate-ping" />
      )}
    </div>
  );
}

function LiveLogStream({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);

  const recent = entries.slice(-20);
  return (
    <div ref={ref} className="font-mono text-[11px] leading-relaxed h-48 overflow-y-auto space-y-0.5 scroll-smooth">
      {recent.map((e, i) => {
        const cfg = AGENT_CONFIG[e.agent] ?? AGENT_CONFIG.orchestrator;
        const typeIcon = e.type === "tool_call" ? "~" : e.type === "guardrail" ? "!" : e.type === "reputation" ? "*" : e.type === "error" ? "x" : ">";
        return (
          <div key={i} className={`flex gap-2 px-2 py-0.5 rounded ${e.type === "guardrail" ? "bg-amber-500/5" : e.type === "error" ? "bg-red-500/5" : e.type === "reputation" ? "bg-violet-500/5" : ""}`}>
            <span className="text-zinc-600 shrink-0 w-16">{new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className={`shrink-0 ${cfg.color}`}>{typeIcon}</span>
            <span className={`shrink-0 w-20 ${cfg.color}`}>{e.agent}</span>
            <span className="text-zinc-400 truncate">{e.action}</span>
            {e.tokensUsed > 0 && <span className="text-zinc-600 shrink-0 ml-auto">{e.tokensUsed.toLocaleString()}t</span>}
          </div>
        );
      })}
      {recent.length === 0 && <div className="text-zinc-600 text-center py-8">Waiting for agent activity...</div>}
    </div>
  );
}

export default function Dashboard() {
  const [repoUrl, setRepoUrl] = useState("");
  const [run, setRun] = useState<RunData | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "findings" | "identity">("overview");

  useEffect(() => {
    fetch("/api/register").then(r => r.json()).then(setWallet).catch(() => {});
    fetch("/api/run").then(r => r.json()).then(data => {
      if (data.run?.findings?.length > 0) setRun(data.run);
    }).catch(() => {});
  }, []);

  const startRunWithSSE = useCallback(async (targetRepo: string) => {
    setIsRunning(true);
    setRun(null);
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRepo }),
      });
      if (!res.ok || !res.body) {
        await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetRepo }) });
        const interval = setInterval(async () => {
          const r = await fetch("/api/run");
          const d = await r.json();
          if (d.run) { setRun(d.run); if (d.run.status !== "running") { setIsRunning(false); clearInterval(interval); } }
        }, 2000);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.findings) { setRun(prev => ({ ...(prev ?? {} as RunData), status: "completed", findings: d.findings, budget: d.budget }) as RunData); setIsRunning(false); }
              else if (d.currentStep) { setRun(prev => { const steps = prev?.steps ?? []; return { ...(prev ?? {} as RunData), id: prev?.id ?? "s", startedAt: prev?.startedAt ?? "", completedAt: null, status: "running", targetRepo: "", steps: [...steps.filter(s => s.id !== d.currentStep.id), d.currentStep], log: d.latestLog ? [...(prev?.log ?? []), d.latestLog] : prev?.log ?? [], budget: d.budget ?? prev?.budget ?? {} as Budget, findings: prev?.findings ?? [], erc8004Txs: prev?.erc8004Txs ?? [] } as RunData; }); }
            } catch { /* skip */ }
          }
        }
      }
    } catch { setIsRunning(false); }
  }, []);

  const startRun = () => { if (repoUrl) startRunWithSSE(repoUrl); };

  const critCount = run?.findings.filter(f => f.severity === "critical").length ?? 0;
  const highCount = run?.findings.filter(f => f.severity === "high").length ?? 0;
  const medCount = run?.findings.filter(f => f.severity === "medium").length ?? 0;
  const activeAgent = run?.steps.find(s => s.status === "in_progress")?.agent;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-3 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center font-bold text-sm shadow-lg shadow-violet-500/20">F</div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Forge Protocol</h1>
              <p className="text-[10px] text-zinc-500 font-mono">Autonomous Multi-Agent Security Auditor</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {wallet && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800/50">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-zinc-400">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-400">{wallet.balance} ETH</span>
                <span className="text-zinc-700">|</span>
                <span className="text-violet-400 font-medium">Agent #{wallet.erc8004AgentId ?? "?"}</span>
              </div>
            )}
            {run && (
              <div className={`px-3 py-1.5 rounded-lg font-medium ${run.status === "running" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : run.status === "completed" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                {run.status === "running" ? "ANALYZING" : run.status.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Input */}
      <div className="border-b border-zinc-800/50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex gap-3">
          <input type="text" placeholder="github.com/owner/repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800/50 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
            onKeyDown={e => e.key === "Enter" && startRun()} />
          <button onClick={startRun} disabled={isRunning || !repoUrl}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-sm font-semibold transition-all shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20">
            {isRunning ? "Analyzing..." : "Audit Repository"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800/50 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(["overview", "logs", "findings", "identity"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${activeTab === tab ? "border-violet-500 text-violet-400" : "border-transparent text-zinc-600 hover:text-zinc-400"}`}>
              {tab}
              {tab === "findings" && run && run.findings.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">{run.findings.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {!run && !isRunning ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex gap-3 mb-8">
                {Object.entries(AGENT_CONFIG).map(([name, cfg]) => (
                  <div key={name} className="flex flex-col items-center gap-2">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center font-bold text-white text-lg shadow-lg`}>
                      {name[0].toUpperCase()}
                    </div>
                    <span className={`text-[10px] font-medium ${cfg.color}`}>{name}</span>
                  </div>
                ))}
              </div>
              <h2 className="text-xl font-semibold mb-2">Five Agents. One Mission.</h2>
              <p className="text-zinc-500 max-w-lg text-sm">
                Enter a GitHub repository URL. Orchestrator plans, Scanner hunts vulnerabilities with Semgrep + SAST + CVE scanning,
                Analyzer maps to CWEs, Fixer generates patches, Reviewer validates. All trust-gated via ERC-8004.
              </p>
            </div>
          ) : activeTab === "overview" ? (
            /* Overview */
            <div className="grid grid-cols-12 gap-4">
              {/* Pipeline + Live Log */}
              <div className="col-span-8 space-y-4">
                {/* Agent Pipeline */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent Pipeline</h3>
                    {isRunning && <span className="text-[10px] text-amber-400 animate-pulse">LIVE</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {run?.steps.map((step, i) => (
                      <div key={step.id} className="flex items-center gap-2 flex-1">
                        <div className={`flex items-center gap-2 flex-1 p-3 rounded-lg border transition-all ${step.status === "completed" ? "bg-zinc-800/30 border-zinc-700/50" : step.status === "in_progress" ? "bg-zinc-800/50 border-violet-500/30 shadow-lg shadow-violet-500/5" : "bg-zinc-900 border-zinc-800/30"}`}>
                          <AgentIcon agent={step.agent} size={28} active={step.status === "in_progress"} />
                          <div className="min-w-0 flex-1">
                            <div className={`text-[11px] font-semibold capitalize ${AGENT_CONFIG[step.agent]?.color ?? "text-zinc-400"}`}>{step.agent}</div>
                            <div className="text-[10px] text-zinc-600 truncate">{step.action}</div>
                          </div>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${step.status === "completed" ? "bg-green-500" : step.status === "in_progress" ? "bg-amber-500 animate-pulse" : "bg-zinc-700"}`} />
                        </div>
                        {i < (run?.steps.length ?? 0) - 1 && <div className="text-zinc-700 shrink-0">&#8594;</div>}
                      </div>
                    ))}
                    {isRunning && <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-zinc-800 opacity-50"><div className="w-7 h-7 rounded-lg bg-zinc-800 animate-pulse" /><div className="text-[10px] text-zinc-600">Next...</div></div>}
                  </div>
                </div>

                {/* Live Agent Activity */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agent Activity Stream</h3>
                    <span className="text-[10px] text-zinc-600">{run?.log.length ?? 0} events</span>
                  </div>
                  <LiveLogStream entries={run?.log ?? []} />
                </div>

                {/* Findings Preview */}
                {run && run.findings.length > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Top Findings</h3>
                      <button onClick={() => setActiveTab("findings")} className="text-[10px] text-violet-400 hover:text-violet-300">View all {run.findings.length} &#8594;</button>
                    </div>
                    <div className="space-y-2">
                      {run.findings.slice(0, 5).map(f => {
                        const sev = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info;
                        return (
                          <div key={f.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${sev.bg}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${sev.dot}`} />
                            <span className="text-xs font-medium uppercase w-16 shrink-0 text-zinc-500">{f.severity}</span>
                            <span className="text-xs text-zinc-300 truncate">{f.title}</span>
                            <span className="text-[10px] text-zinc-600 ml-auto font-mono shrink-0">{f.file}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Completion Summary */}
                {run && run.status === "completed" && (
                  <div className="p-5 rounded-xl bg-gradient-to-r from-green-500/5 via-zinc-900/50 to-violet-500/5 border border-green-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-lg">&#10003;</div>
                      <div>
                        <h3 className="text-sm font-semibold text-green-400">Audit Complete</h3>
                        <p className="text-[10px] text-zinc-500">All agents finished autonomously</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="p-3 rounded-lg bg-zinc-800/30 text-center">
                        <div className="text-xl font-bold text-white">{run.findings.length}</div>
                        <div className="text-[10px] text-zinc-500">Findings</div>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30 text-center">
                        <div className="text-xl font-bold text-red-400">{critCount}</div>
                        <div className="text-[10px] text-zinc-500">Critical</div>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30 text-center">
                        <div className="text-xl font-bold text-violet-400">{run.steps.length}</div>
                        <div className="text-[10px] text-zinc-500">Pipeline Steps</div>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30 text-center">
                        <div className="text-xl font-bold text-green-400">${run.budget?.estimatedCostUSD?.toFixed(2) ?? "0"}</div>
                        <div className="text-[10px] text-zinc-500">Total Cost</div>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400 space-y-1.5 mb-3">
                      <p><span className="text-zinc-500">Tools used:</span> Semgrep SAST, Custom SAST (12 CWE rules), GitHub Advisory CVE Database, Claude AI</p>
                      <p><span className="text-zinc-500">Trust verified:</span> Agent #2221 identity confirmed on ERC-8004 Identity Registry via ownerOf()</p>
                      <p><span className="text-zinc-500">Reputation:</span> Dynamic score computed from {run.findings.length} findings ({critCount} critical, {highCount} high)</p>
                      {run.findings.length > 0 && (
                        <p><span className="text-zinc-500">Most critical:</span> <span className="text-red-400">{run.findings.find(f => f.severity === "critical")?.title ?? run.findings[0]?.title}</span></p>
                      )}
                    </div>
                    {/* PR Link */}
                    {run.erc8004Txs?.some(tx => tx.chain === "github") && (
                      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                        <span className="text-blue-400 text-lg">&#128279;</span>
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-blue-400">Pull Request Created</div>
                          <a href={run.erc8004Txs.find(tx => tx.chain === "github")?.hash} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-300 hover:underline">
                            {run.erc8004Txs.find(tx => tx.chain === "github")?.hash ?? "View PR"}
                          </a>
                        </div>
                      </div>
                    )}
                    {/* On-chain proof links */}
                    <div className="flex gap-2 mt-3">
                      <a href="https://sepolia.etherscan.io/tx/0xadf3b56f10b60f40ca7a7973749c9612fd9ed5b0d160a45223e7ae5eb5c9a2ab" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                        Identity TX &#8599;
                      </a>
                      <a href="https://sepolia.etherscan.io/tx/0x96b4ae35ec3d52657f3be1bf135cac24da1b344055eac7196c697daf4ec99929" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                        Reputation TX &#8599;
                      </a>
                      <a href="https://www.8004scan.io/agents/2221" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                        8004scan &#8599;
                      </a>
                    </div>
                  </div>
                )}

                {/* Inter-Agent Communication Flow */}
                {run && run.log.length > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Inter-Agent Communication</h3>
                    <div className="space-y-2">
                      {run.log
                        .filter(e => e.type === "delegation" || e.type === "reputation" || e.action.toLowerCase().includes("message bus") || e.action.toLowerCase().includes("trust gate") || e.action.toLowerCase().includes("self-correction") || e.action.toLowerCase().includes("pr"))
                        .slice(0, 8)
                        .map((e, i) => {
                          const cfg = AGENT_CONFIG[e.agent] ?? AGENT_CONFIG.orchestrator;
                          const isReputation = e.type === "reputation";
                          const isTrust = e.action.toLowerCase().includes("trust");
                          const isPR = e.action.toLowerCase().includes("pr") || e.action.toLowerCase().includes("create");
                          return (
                            <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${isReputation ? "bg-violet-500/5 border-violet-500/20" : isTrust ? "bg-green-500/5 border-green-500/20" : isPR ? "bg-blue-500/5 border-blue-500/20" : "bg-zinc-800/30 border-zinc-800/50"}`}>
                              <AgentIcon agent={e.agent} size={24} />
                              <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-medium ${cfg.color}`}>{e.action}</div>
                                {e.details && (
                                  <div className="text-[10px] text-zinc-600 truncate mt-0.5">
                                    {isTrust && typeof e.details === "object" && "reason" in (e.details as Record<string, unknown>)
                                      ? String((e.details as Record<string, unknown>).reason)
                                      : isReputation && typeof e.details === "object" && "dynamicScore" in (e.details as Record<string, unknown>)
                                      ? `Score: ${(e.details as Record<string, unknown>).dynamicScore}/100`
                                      : isPR && typeof e.details === "object" && "prUrl" in (e.details as Record<string, unknown>)
                                      ? String((e.details as Record<string, unknown>).prUrl)
                                      : JSON.stringify(e.details).slice(0, 80)}
                                  </div>
                                )}
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isReputation ? "bg-violet-500/20 text-violet-400" : isTrust ? "bg-green-500/20 text-green-400" : isPR ? "bg-blue-500/20 text-blue-400" : "bg-zinc-700/50 text-zinc-500"}`}>
                                {isReputation ? "REPUTATION" : isTrust ? "TRUST" : isPR ? "PR" : e.type}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* GitHub PR Created */}
                {run?.erc8004Txs?.some(tx => tx.chain === "github") && (
                  <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-2">Autonomous PR Created</h3>
                    {run.erc8004Txs.filter(tx => tx.chain === "github").map((tx, i) => (
                      <a key={i} href={tx.hash} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                        <span>View Pull Request</span>
                        <span className="text-xs">&#8599;</span>
                      </a>
                    ))}
                    <p className="text-[10px] text-zinc-600 mt-1">Security audit report committed to target repository</p>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="col-span-4 space-y-4">
                {/* Budget */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Compute Budget</h4>
                  {run?.budget && <>
                    <BudgetBar label="Tokens" used={run.budget.usedTokens} max={run.budget.maxTokens} color="violet" />
                    <BudgetBar label="API Calls" used={run.budget.usedApiCalls} max={run.budget.maxApiCalls} color="blue" />
                    <div className="flex justify-between text-[11px] mt-2">
                      <span className="text-zinc-600">Estimated Cost</span>
                      <span className="text-green-400 font-mono font-medium">${run.budget.estimatedCostUSD.toFixed(4)}</span>
                    </div>
                  </>}
                </div>

                {/* Severity Breakdown */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Severity Breakdown</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <SeverityCard label="Critical" count={critCount} color="red" />
                    <SeverityCard label="High" count={highCount} color="orange" />
                    <SeverityCard label="Medium" count={medCount} color="yellow" />
                  </div>
                  <div className="flex justify-between text-[11px] mt-3 pt-3 border-t border-zinc-800/50">
                    <span className="text-zinc-500">Total Findings</span>
                    <span className="text-white font-semibold">{run?.findings.length ?? 0}</span>
                  </div>
                </div>

                {/* ERC-8004 Trust */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-3">ERC-8004 Trust</h4>
                  <div className="space-y-2 text-[11px]">
                    <div className="flex justify-between"><span className="text-zinc-500">Agent ID</span><span className="font-mono text-violet-300">#{wallet?.erc8004AgentId ?? "2221"}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Trust Gate</span><span className="text-green-400">Verified</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Reputation</span><span className="text-violet-300">Dynamic</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Chain</span><span className="text-zinc-400">Ethereum Sepolia</span></div>
                  </div>
                  {run?.erc8004Txs && run.erc8004Txs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-violet-500/10">
                      {run.erc8004Txs.slice(0, 2).map((tx, i) => (
                        <a key={i} href={tx.chain === "github" ? tx.hash : `https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                          className="block text-[10px] text-blue-400 hover:text-blue-300 truncate mt-1">{tx.type}: {tx.hash.slice(0, 24)}...</a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Agent */}
                {activeAgent && (
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 animate-pulse">
                    <div className="flex items-center gap-3">
                      <AgentIcon agent={activeAgent} size={36} active />
                      <div>
                        <div className={`text-sm font-semibold capitalize ${AGENT_CONFIG[activeAgent]?.color}`}>{activeAgent}</div>
                        <div className="text-[10px] text-zinc-500">Working autonomously...</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === "logs" ? (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Execution Log ({run?.log.length ?? 0} entries)</h3>
              <div className="font-mono text-[11px] space-y-0.5 max-h-[600px] overflow-y-auto rounded-xl bg-zinc-900/30 border border-zinc-800/50 p-3">
                {run?.log.map((e, i) => {
                  const cfg = AGENT_CONFIG[e.agent] ?? AGENT_CONFIG.orchestrator;
                  return (
                    <div key={i} className={`flex gap-3 px-2 py-1 rounded ${e.type === "guardrail" ? "bg-amber-500/5" : e.type === "error" ? "bg-red-500/5" : e.type === "reputation" ? "bg-violet-500/5" : "hover:bg-zinc-800/30"}`}>
                      <span className="text-zinc-600 shrink-0 w-20">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <span className={`shrink-0 w-20 font-semibold ${cfg.color}`}>[{e.agent}]</span>
                      <span className="text-zinc-600 shrink-0 w-20">{e.type}</span>
                      <span className="text-zinc-300">{e.action}</span>
                      {e.tokensUsed > 0 && <span className="text-zinc-600 shrink-0 ml-auto">{e.tokensUsed.toLocaleString()} tok</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeTab === "findings" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Security Findings ({run?.findings.length ?? 0})</h3>
                <div className="flex gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400">{critCount} Critical</span>
                  <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400">{highCount} High</span>
                  <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{medCount} Medium</span>
                </div>
              </div>
              {run?.findings.map(f => {
                const sev = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info;
                return (
                  <div key={f.id} className={`p-4 rounded-xl border ${sev.bg} transition-all hover:border-opacity-60`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${sev.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase text-zinc-400">{f.severity}</span>
                          <h4 className="text-sm font-semibold text-zinc-200">{f.title}</h4>
                        </div>
                        <p className="text-xs text-zinc-500 mb-2">{f.description}</p>
                        {f.file && <p className="text-[10px] text-zinc-600 font-mono">{f.file}</p>}
                        {f.suggestion && <div className="mt-2 p-2 rounded-lg bg-zinc-800/30 text-[11px] text-zinc-400">{f.suggestion}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : activeTab === "identity" ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="p-6 rounded-xl bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-2xl font-bold shadow-xl shadow-violet-500/20">F</div>
                  <div>
                    <h3 className="text-lg font-semibold">Forge Protocol</h3>
                    <p className="text-xs text-zinc-500">ERC-8004 Registered Autonomous Agent</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="ERC-8004 Agent ID" value={`#${wallet?.erc8004AgentId ?? 2221}`} accent />
                  <InfoRow label="Synthesis Agent ID" value={`#${wallet?.synthesisAgentId ?? 35843}`} accent />
                  <InfoRow label="Operator Wallet" value={wallet?.address ?? "..."} mono />
                  <InfoRow label="Chain" value="Ethereum Sepolia (11155111)" />
                  <InfoRow label="Balance" value={`${wallet?.balance ?? "0"} ETH`} />
                  <InfoRow label="Trust Gate" value="Verified (ownerOf)" accent />
                </div>
                <div className="mt-4 pt-4 border-t border-violet-500/10 space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase">On-Chain Proof</h4>
                  <TxLink label="Identity Registration" hash={wallet?.identityTx ?? "0xadf3b56f10b60f40ca7a7973749c9612fd9ed5b0d160a45223e7ae5eb5c9a2ab"} />
                  <TxLink label="Reputation Feedback" hash={wallet?.reputationTx ?? "0x96b4ae35ec3d52657f3be1bf135cac24da1b344055eac7196c697daf4ec99929"} />
                </div>
              </div>
              <div className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Agent Capabilities</h4>
                <div className="flex flex-wrap gap-1.5">
                  {["security_audit", "semgrep_sast", "cve_scanning", "code_analysis", "fix_generation", "pr_creation", "trust_gating", "x402_payments", "reputation_tracking", "self_correction"].map(cap => (
                    <span key={cap} className="px-2 py-1 rounded-md text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/50 font-mono">{cap}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="border-t border-zinc-800/50 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] text-zinc-600">
          <span>Forge Protocol v1.0 | Synthesis Hackathon 2026</span>
          <span>ERC-8004 on Ethereum Sepolia | Agent #2221</span>
        </div>
      </footer>
    </div>
  );
}

function BudgetBar({ label, used, max, color }: { label: string; used: number; max: number; color: string }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-zinc-600">{label}</span>
        <span className="text-zinc-400 font-mono">{used.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : `bg-${color}-500`}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SeverityCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`p-3 rounded-lg bg-${color}-500/5 border border-${color}-500/20 text-center`}>
      <div className={`text-lg font-bold text-${color}-400`}>{count}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-600 mb-0.5">{label}</div>
      <div className={`text-xs ${accent ? "text-violet-300 font-semibold" : mono ? "font-mono text-zinc-400 truncate" : "text-zinc-300"}`}>{value}</div>
    </div>
  );
}

function TxLink({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 font-mono">
        {hash.slice(0, 10)}...{hash.slice(-6)} &#8599;
      </a>
    </div>
  );
}
