import { NextRequest } from "next/server";
import { runForgeProtocol } from "@/lib/agent-engine";
import type { AgentRunConfig, ExecutionRun } from "@/lib/types";

// Store current run state globally for polling
let currentRun: ExecutionRun | null = null;

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

  // Validate GitHub URL format
  const ghMatch = config.targetRepo.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!ghMatch) {
    return Response.json({ error: "Invalid GitHub repository URL" }, { status: 400 });
  }

  // Start the run asynchronously
  currentRun = null;
  const runPromise = runForgeProtocol(config, (update) => {
    currentRun = update;
  });

  // Don't await — let it run in background
  runPromise.then((finalRun) => {
    currentRun = finalRun;
  }).catch((err) => {
    if (currentRun) {
      currentRun.status = "failed";
      currentRun.completedAt = new Date().toISOString();
    }
    console.error("Run failed:", err);
  });

  return Response.json({ started: true, message: "Forge Protocol pipeline started" });
}

export async function GET() {
  if (!currentRun) {
    return Response.json({ status: "idle", run: null });
  }
  return Response.json({ status: currentRun.status, run: currentRun });
}

export { currentRun };
