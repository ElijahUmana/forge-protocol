import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// Generate an AI summary of audit findings
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { findings, targetRepo, steps, budget } = body;

  if (!findings || findings.length === 0) {
    return Response.json({ summary: "No findings to summarize." });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `You are a security auditor summarizing an autonomous audit. Write a concise, professional summary (3-5 sentences) of this security audit.

Repository: ${targetRepo}
Pipeline steps completed: ${steps}
Total cost: $${budget?.estimatedCostUSD?.toFixed(2) ?? "0"}
Findings: ${JSON.stringify(findings.map((f: { severity: string; title: string; file: string }) => ({
  severity: f.severity,
  title: f.title,
  file: f.file,
})))}

Write the summary as if you are reporting to a developer. Be specific about the most critical issues found. End with a recommendation.`,
    }],
  });

  const summary = response.content[0].type === "text" ? response.content[0].text : "Summary generation failed.";

  return Response.json({ summary });
}
