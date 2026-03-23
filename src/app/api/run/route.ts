import { NextRequest } from "next/server";
import { runForgeProtocol } from "@/lib/agent-engine";
import type { AgentRunConfig, ExecutionRun } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";
import { createX402Headers, verifyX402Payment, calculateAuditCost } from "@/lib/x402";

// Allow up to 300s for pipeline execution (Vercel Pro) or 60s (Hobby)
export const maxDuration = 300;

// Store current run state globally for polling
let currentRun: ExecutionRun | null = null;

// Load cached results from agent_log.json on first request
function getCachedRun(): ExecutionRun | null {
  try {
    const logPath = join(process.cwd(), "agent_log.json");
    const content = JSON.parse(readFileSync(logPath, "utf-8"));
    if (content.entries && content.entries.length > 0) {
      return {
        id: content.runId ?? "cached-run",
        startedAt: content.entries[0]?.timestamp ?? "",
        completedAt: content.generatedAt ?? null,
        status: "completed",
        targetRepo: content.targetRepo ?? "https://github.com/juice-shop/juice-shop",
        steps: [
          {
            id: "cached-1", agent: "orchestrator", action: "Plan repository analysis",
            status: "completed", input: {}, output: "Plan generated",
            startedAt: content.entries[0]?.timestamp ?? "", completedAt: content.entries[1]?.timestamp ?? "",
            tokensUsed: 0, toolCalls: [],
          },
          {
            id: "cached-2", agent: "scanner", action: "Scan repository for issues",
            status: "completed", input: {}, output: "Scan complete",
            startedAt: content.entries[2]?.timestamp ?? "", completedAt: content.entries[content.entries.length - 1]?.timestamp ?? "",
            tokensUsed: 0, toolCalls: [],
          },
        ],
        log: content.entries,
        budget: content.budget ?? {
          maxTokens: 500000, usedTokens: 0, maxApiCalls: 100,
          usedApiCalls: 0, maxDurationMs: 1800000, elapsedMs: 0, estimatedCostUSD: 0,
        },
        findings: content.findings ?? [],
        erc8004Txs: content.erc8004Txs ?? [],
      };
    }
  } catch {
    // No cached results available
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const config: AgentRunConfig = {
    targetRepo: body.targetRepo,
    maxTokens: body.maxTokens ?? 500000,
    maxApiCalls: body.maxApiCalls ?? 100,
    maxDurationMinutes: body.maxDurationMinutes ?? 30,
    focusAreas: body.focusAreas ?? ["security", "code_quality"],
  };

  if (!config.targetRepo) {
    return Response.json({ error: "targetRepo is required" }, { status: 400 });
  }

  const ghMatch = config.targetRepo.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!ghMatch) {
    return Response.json({ error: "Invalid GitHub repository URL" }, { status: 400 });
  }

  // x402 Payment Protocol: check for payment or return payment-required headers
  const auditCost = calculateAuditCost(10, 2000, "standard"); // Default estimate
  const paymentCheck = verifyX402Payment(request.headers);
  const x402Info = {
    paymentRequired: !paymentCheck.paid,
    cost: auditCost,
    currency: "USDC",
    chain: "base",
    recipient: process.env.AGENT_ADDRESS ?? "0xad114d421E106a845b196BdBe527A9dc4b7e8EF5",
    receipt: paymentCheck.receipt,
    // For hackathon demo: proceed even without payment, but log it
    proceeding: true,
  };

  // Start the run — on Vercel this runs within the function's maxDuration
  currentRun = null;
  const runPromise = runForgeProtocol(config, (update) => {
    currentRun = update;
  });

  runPromise.then((finalRun) => {
    currentRun = finalRun;
  }).catch((err) => {
    if (currentRun) {
      currentRun.status = "failed";
      currentRun.completedAt = new Date().toISOString();
    }
    console.error("Run failed:", err);
  });

  return Response.json({
    started: true,
    message: "Forge Protocol pipeline started",
    x402: x402Info,
  }, {
    headers: paymentCheck.paid ? {} : createX402Headers(auditCost, x402Info.recipient),
  });
}

export async function GET() {
  // Return live run if available
  if (currentRun) {
    return Response.json({ status: currentRun.status, run: currentRun });
  }
  // Fall back to cached results
  const cached = getCachedRun();
  if (cached) {
    return Response.json({ status: "completed", run: cached, cached: true });
  }
  return Response.json({ status: "idle", run: null });
}
