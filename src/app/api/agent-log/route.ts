import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const logPath = join(process.cwd(), "agent_log.json");
    const content = readFileSync(logPath, "utf-8");
    return Response.json(JSON.parse(content));
  } catch {
    // Fallback: try to get from run endpoint
    try {
      const res = await fetch("http://localhost:3000/api/run");
      const data = await res.json();
      const run = data?.run;
      if (run) {
        return Response.json({
          version: "1.0.0",
          agent: "Forge Protocol",
          generatedAt: run.completedAt ?? new Date().toISOString(),
          runId: run.id,
          status: run.status,
          targetRepo: run.targetRepo,
          budget: run.budget,
          totalSteps: run.steps?.length ?? 0,
          totalFindings: run.findings?.length ?? 0,
          totalLogEntries: run.log?.length ?? 0,
          entries: run.log ?? [],
        });
      }
    } catch {
      // ignore
    }
    return Response.json({
      version: "1.0.0",
      agent: "Forge Protocol",
      generatedAt: new Date().toISOString(),
      totalEntries: 0,
      entries: [],
      message: "No execution data available. Run an analysis first via POST /api/run.",
    });
  }
}
