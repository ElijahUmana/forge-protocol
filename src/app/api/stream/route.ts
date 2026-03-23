import { NextRequest } from "next/server";
import { runForgeProtocol } from "@/lib/agent-engine";
import type { AgentRunConfig } from "@/lib/types";

export const maxDuration = 300;

// SSE streaming endpoint — real-time pipeline updates instead of polling
export async function POST(request: NextRequest) {
  const body = await request.json();
  const config: AgentRunConfig = {
    targetRepo: body.targetRepo,
    maxTokens: body.maxTokens ?? 500000,
    maxApiCalls: body.maxApiCalls ?? 100,
    maxDurationMinutes: body.maxDurationMinutes ?? 30,
    focusAreas: body.focusAreas ?? ["security", "code_quality"],
  };

  if (!config.targetRepo?.match(/github\.com\/([^/]+)\/([^/]+)/)) {
    return Response.json({ error: "Invalid GitHub repository URL" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("connected", { message: "Forge Protocol SSE stream connected" });

      try {
        const finalRun = await runForgeProtocol(config, (update) => {
          // Stream every pipeline update in real-time
          send("update", {
            status: update.status,
            stepsCount: update.steps.length,
            currentStep: update.steps[update.steps.length - 1] ?? null,
            findingsCount: update.findings.length,
            budget: update.budget,
            logCount: update.log.length,
            latestLog: update.log[update.log.length - 1] ?? null,
          });
        });

        send("complete", {
          status: finalRun.status,
          totalSteps: finalRun.steps.length,
          totalFindings: finalRun.findings.length,
          findings: finalRun.findings,
          budget: finalRun.budget,
          erc8004Txs: finalRun.erc8004Txs,
          logEntries: finalRun.log.length,
        });
      } catch (err) {
        send("error", { error: String(err) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
