export type AgentRole = "orchestrator" | "scanner" | "analyzer" | "fixer" | "reviewer";

// Inter-agent message passing protocol
export interface AgentMessage {
  from: AgentRole;
  to: AgentRole;
  type: "task_assignment" | "result" | "feedback" | "rejection" | "trust_query" | "trust_response";
  payload: unknown;
  timestamp: string;
  messageId: string;
}

// Agent message bus for inter-agent communication
export class AgentMessageBus {
  private messages: AgentMessage[] = [];
  private listeners: Map<AgentRole, ((msg: AgentMessage) => void)[]> = new Map();

  send(msg: Omit<AgentMessage, "timestamp" | "messageId">) {
    const fullMsg: AgentMessage = {
      ...msg,
      timestamp: new Date().toISOString(),
      messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.messages.push(fullMsg);
    const listeners = this.listeners.get(msg.to) ?? [];
    for (const listener of listeners) listener(fullMsg);
    return fullMsg;
  }

  getMessages(agent?: AgentRole): AgentMessage[] {
    if (!agent) return [...this.messages];
    return this.messages.filter((m) => m.to === agent || m.from === agent);
  }

  getConversation(agent1: AgentRole, agent2: AgentRole): AgentMessage[] {
    return this.messages.filter(
      (m) => (m.from === agent1 && m.to === agent2) || (m.from === agent2 && m.to === agent1)
    );
  }

  onMessage(agent: AgentRole, callback: (msg: AgentMessage) => void) {
    const existing = this.listeners.get(agent) ?? [];
    existing.push(callback);
    this.listeners.set(agent, existing);
  }
}

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
