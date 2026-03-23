export type AgentRole = "orchestrator" | "scanner" | "analyzer" | "fixer" | "reviewer";

export interface AgentIdentity {
  name: string;
  role: AgentRole;
  erc8004Id: number | null;
  walletAddress: string;
  reputationScore: number;
}

export interface TaskStep {
  id: string;
  agent: AgentRole;
  action: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  input: unknown;
  output: unknown;
  startedAt: string | null;
  completedAt: string | null;
  tokensUsed: number;
  toolCalls: ToolCall[];
}

export interface ToolCall {
  tool: string;
  input: unknown;
  output: unknown;
  timestamp: string;
  durationMs: number;
  safe: boolean;
  guardrailCheck: string | null;
}

export interface AgentLogEntry {
  timestamp: string;
  agent: AgentRole;
  type: "decision" | "tool_call" | "guardrail" | "error" | "delegation" | "reputation" | "identity";
  action: string;
  details: unknown;
  tokensUsed: number;
}

export interface ExecutionRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  targetRepo: string;
  steps: TaskStep[];
  log: AgentLogEntry[];
  budget: ComputeBudget;
  findings: Finding[];
  erc8004Txs: OnchainTx[];
}

export interface ComputeBudget {
  maxTokens: number;
  usedTokens: number;
  maxApiCalls: number;
  usedApiCalls: number;
  maxDurationMs: number;
  elapsedMs: number;
  estimatedCostUSD: number;
}

export interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  file: string;
  line: number | null;
  suggestion: string;
  fixApplied: boolean;
}

export interface OnchainTx {
  type: "identity_register" | "reputation_feedback" | "validation_request" | "validation_response";
  hash: string;
  chain: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: string;
  details: unknown;
}

export interface AgentRunConfig {
  targetRepo: string;
  maxTokens?: number;
  maxApiCalls?: number;
  maxDurationMinutes?: number;
  focusAreas?: string[];
}
