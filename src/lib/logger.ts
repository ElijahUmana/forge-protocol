import type { AgentLogEntry, AgentRole, ExecutionRun, ComputeBudget } from "./types";

class AgentLogger {
  private entries: AgentLogEntry[] = [];
  private budget: ComputeBudget;

  constructor(maxTokens = 500000, maxApiCalls = 100, maxDurationMs = 30 * 60 * 1000) {
    this.budget = {
      maxTokens,
      usedTokens: 0,
      maxApiCalls,
      usedApiCalls: 0,
      maxDurationMs,
      elapsedMs: 0,
      estimatedCostUSD: 0,
    };
  }

  log(
    agent: AgentRole,
    type: AgentLogEntry["type"],
    action: string,
    details: unknown,
    tokensUsed = 0
  ) {
    const entry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      agent,
      type,
      action,
      details,
      tokensUsed,
    };
    this.entries.push(entry);
    this.budget.usedTokens += tokensUsed;
    this.budget.usedApiCalls += type === "tool_call" ? 1 : 0;
    // ~$3/M input tokens + $15/M output tokens, rough estimate
    this.budget.estimatedCostUSD = (this.budget.usedTokens / 1_000_000) * 9;
  }

  getEntries(): AgentLogEntry[] {
    return [...this.entries];
  }

  getBudget(): ComputeBudget {
    return { ...this.budget };
  }

  isBudgetExceeded(): boolean {
    return (
      this.budget.usedTokens >= this.budget.maxTokens ||
      this.budget.usedApiCalls >= this.budget.maxApiCalls
    );
  }

  toAgentLogJson(): object {
    return {
      version: "1.0.0",
      agent: "Forge Protocol",
      generatedAt: new Date().toISOString(),
      totalEntries: this.entries.length,
      budget: this.budget,
      entries: this.entries,
    };
  }
}

// Global singleton for the current run
let currentLogger: AgentLogger | null = null;

export function createLogger(): AgentLogger {
  currentLogger = new AgentLogger();
  return currentLogger;
}

export function getLogger(): AgentLogger {
  if (!currentLogger) {
    currentLogger = new AgentLogger();
  }
  return currentLogger;
}

export { AgentLogger };
