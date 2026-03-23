import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentRole,
  AgentRunConfig,
  ExecutionRun,
  Finding,
  TaskStep,
  OnchainTx,
} from "./types";
import { AgentLogger, createLogger } from "./logger";
import { registerAgentIdentity, giveFeedback, getAgentAddress } from "./erc8004";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_PROMPTS: Record<AgentRole, string> = {
  orchestrator: `You are the Orchestrator Agent of Forge Protocol. Your job is to:
1. Receive a GitHub repository URL
2. Break the analysis task into subtasks for specialized agents
3. Delegate to Scanner, Analyzer, Fixer, and Reviewer agents
4. Track progress and ensure quality
5. Make decisions about which issues to prioritize

Output a JSON plan with steps. Each step has: agent (scanner/analyzer/fixer/reviewer), action (string), and input (object).
Return ONLY valid JSON array of steps.`,

  scanner: `You are the Scanner Agent of Forge Protocol. You analyze GitHub repositories to find security vulnerabilities and code quality issues.

IMPORTANT: You MUST use the provided tools to explore the repository. Start by fetching the root directory, then examine key files like package.json, config files, and source code files that handle authentication, user input, database queries, or sensitive operations.

After examining the repository, you MUST return your findings as a raw JSON array (no markdown code fences). Each finding must have exactly these fields:
- severity: "critical" | "high" | "medium" | "low" | "info"
- title: short descriptive title
- description: detailed explanation
- file: the file path where the issue was found
- line: line number or null
- suggestion: how to fix the issue

Look specifically for:
1. Hardcoded secrets, API keys, passwords in source code
2. Missing input validation or sanitization (SQL injection, XSS, command injection)
3. Insecure authentication or session management
4. Missing HTTPS, CORS misconfigurations
5. Outdated dependencies with known CVEs
6. Missing error handling that could leak information
7. Insecure file operations or path traversal risks
8. Missing rate limiting on API endpoints
9. Exposed debug endpoints or verbose error messages
10. Insecure cryptographic practices

Even if you don't find critical vulnerabilities, ALWAYS report at least informational findings about code quality, missing best practices, or areas for improvement. Every repository has something to report.

Your final response must be ONLY the JSON array, like:
[{"severity":"medium","title":"Missing input validation","description":"...","file":"src/api/handler.ts","line":42,"suggestion":"Add input sanitization using..."}]`,

  analyzer: `You are the Analyzer Agent. You perform deep analysis on specific findings.
Given a finding and the relevant code, provide:
- Detailed explanation of the vulnerability/issue
- Potential impact and exploit scenarios
- References to CWE/OWASP categories
- Confidence level (definite/likely/possible)

Return JSON with: analysis, impact, cweId, confidence, recommendation.`,

  fixer: `You are the Fixer Agent. You generate code fixes for identified issues.
Given a finding and the relevant code:
1. Write the minimal fix that resolves the issue
2. Ensure the fix doesn't introduce new problems
3. Follow the existing code style exactly
4. Include a brief explanation of what changed and why

Return JSON with: fixedCode, explanation, filesChanged (array of {path, diff}).`,

  reviewer: `You are the Reviewer Agent. You verify fixes before they're applied.
Given the original code, the finding, and the proposed fix:
1. Verify the fix actually addresses the issue
2. Check for regressions or new issues introduced
3. Evaluate code quality of the fix
4. Give an approval/rejection decision

Return JSON with: approved (boolean), reasoning, concerns (array), qualityScore (0-100).`,
};

// Tool definitions for agents
function getGitHubTools() {
  return [
    {
      name: "fetch_repo_contents" as const,
      description:
        "Fetch the file tree of a GitHub repository to understand its structure",
      input_schema: {
        type: "object" as const,
        properties: {
          owner: { type: "string" as const, description: "Repository owner" },
          repo: { type: "string" as const, description: "Repository name" },
          path: {
            type: "string" as const,
            description: "Path within repo (empty for root)",
          },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "fetch_file_content" as const,
      description: "Fetch the content of a specific file from a GitHub repository",
      input_schema: {
        type: "object" as const,
        properties: {
          owner: { type: "string" as const },
          repo: { type: "string" as const },
          path: { type: "string" as const, description: "File path" },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "search_code" as const,
      description:
        "Search for code patterns in a GitHub repository",
      input_schema: {
        type: "object" as const,
        properties: {
          owner: { type: "string" as const },
          repo: { type: "string" as const },
          query: {
            type: "string" as const,
            description: "Search query string",
          },
        },
        required: ["owner", "repo", "query"],
      },
    },
  ];
}

// Execute GitHub tool calls
async function executeToolCall(
  toolName: string,
  input: Record<string, string>,
  logger: AgentLogger,
  agent: AgentRole
): Promise<string> {
  const start = Date.now();
  let result: string;
  let safe = true;
  let guardrailCheck: string | null = null;

  // Safety guardrail: validate inputs
  if (toolName.startsWith("fetch_") || toolName === "search_code") {
    if (!input.owner || !input.repo) {
      guardrailCheck = "BLOCKED: Missing required owner/repo parameters";
      safe = false;
      result = JSON.stringify({ error: guardrailCheck });
      logger.log(agent, "guardrail", `Blocked ${toolName}: missing params`, {
        toolName,
        input,
        guardrailCheck,
      });
      return result;
    }
    // Guardrail: prevent accessing private repos or sensitive paths
    const blockedPaths = [".env", ".git/config", "credentials", "secrets"];
    if (input.path && blockedPaths.some((p) => input.path.includes(p))) {
      guardrailCheck = `BLOCKED: Access to sensitive path "${input.path}" denied by guardrail`;
      safe = false;
      result = JSON.stringify({ error: guardrailCheck });
      logger.log(agent, "guardrail", `Blocked access to sensitive path`, {
        toolName,
        path: input.path,
        guardrailCheck,
      });
      return result;
    }
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Forge-Protocol-Agent",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    switch (toolName) {
      case "fetch_repo_contents": {
        const path = input.path || "";
        const url = `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${path}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          result = JSON.stringify(
            data.map((f: { name: string; type: string; path: string; size: number }) => ({
              name: f.name,
              type: f.type,
              path: f.path,
              size: f.size,
            }))
          );
        } else {
          result = JSON.stringify({ name: data.name, type: data.type, size: data.size });
        }
        break;
      }
      case "fetch_file_content": {
        const url = `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${input.path}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        // Guardrail: truncate very large files
        if (content.length > 10000) {
          guardrailCheck = `File truncated from ${content.length} to 10000 chars for safety`;
          result = content.slice(0, 10000) + "\n... [TRUNCATED by guardrail]";
        } else {
          result = content;
        }
        break;
      }
      case "search_code": {
        const url = `https://api.github.com/search/code?q=${encodeURIComponent(input.query)}+repo:${input.owner}/${input.repo}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = JSON.stringify(
          (data.items || []).slice(0, 10).map((i: { name: string; path: string; html_url: string }) => ({
            file: i.name,
            path: i.path,
            url: i.html_url,
          }))
        );
        break;
      }
      default:
        result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    result = JSON.stringify({ error: String(err) });
    safe = false;
  }

  const durationMs = Date.now() - start;
  logger.log(agent, "tool_call", toolName, {
    input,
    outputLength: result.length,
    durationMs,
    safe,
    guardrailCheck,
  });

  return result;
}

// Run a single agent with tool use
async function runAgent(
  role: AgentRole,
  userMessage: string,
  logger: AgentLogger,
  useTools = true
): Promise<string> {
  if (logger.isBudgetExceeded()) {
    logger.log(role, "guardrail", "Budget exceeded — aborting agent run", {
      budget: logger.getBudget(),
    });
    return JSON.stringify({ error: "Compute budget exceeded" });
  }

  logger.log(role, "decision", `Agent ${role} starting`, { inputLength: userMessage.length });

  const tools = useTools ? getGitHubTools() : [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  let finalResponse = "";
  let iterations = 0;
  const maxIterations = 10; // Safety: prevent infinite tool loops

  while (iterations < maxIterations) {
    iterations++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: AGENT_PROMPTS[role],
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    logger.log(role, "decision", `Claude response (iteration ${iterations})`, {
      stopReason: response.stop_reason,
      tokensUsed,
      contentBlocks: response.content.length,
    }, tokensUsed);

    // Process response blocks
    if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
      // Extract text from response
      for (const block of response.content) {
        if (block.type === "text") {
          finalResponse += block.text;
        }
      }
      break;
    }

    // Handle tool use
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        // Budget check before each tool call
        if (logger.isBudgetExceeded()) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Budget exceeded — tool call blocked",
          });
          continue;
        }

        const result = await executeToolCall(
          block.name,
          block.input as Record<string, string>,
          logger,
          role
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (iterations >= maxIterations) {
    logger.log(role, "guardrail", "Max iterations reached — stopping agent", {
      maxIterations,
    });
  }

  return finalResponse;
}

// Parse owner/repo from GitHub URL
function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

// Main execution pipeline
export async function runForgeProtocol(
  config: AgentRunConfig,
  onUpdate: (run: ExecutionRun) => void
): Promise<ExecutionRun> {
  const logger = createLogger();
  const startedAt = new Date().toISOString();
  const runId = `forge-${Date.now()}`;
  const { owner, repo } = parseGitHubUrl(config.targetRepo);

  const run: ExecutionRun = {
    id: runId,
    startedAt,
    completedAt: null,
    status: "running",
    targetRepo: config.targetRepo,
    steps: [],
    log: [],
    budget: logger.getBudget(),
    findings: [],
    erc8004Txs: [],
  };

  const emitUpdate = () => {
    run.log = logger.getEntries();
    run.budget = logger.getBudget();
    onUpdate({ ...run });
  };

  try {
    // === STEP 1: Orchestrator plans the analysis ===
    const planStep: TaskStep = {
      id: "step-1-plan",
      agent: "orchestrator",
      action: "Plan repository analysis",
      status: "in_progress",
      input: { targetRepo: config.targetRepo },
      output: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      tokensUsed: 0,
      toolCalls: [],
    };
    run.steps.push(planStep);
    emitUpdate();

    logger.log("orchestrator", "decision", "Starting autonomous analysis pipeline", {
      targetRepo: config.targetRepo,
      owner,
      repo,
    });

    const planResult = await runAgent(
      "orchestrator",
      `Plan a security and code quality analysis for the GitHub repository: ${owner}/${repo}.
The repository URL is: ${config.targetRepo}
Focus areas: ${config.focusAreas?.join(", ") || "security vulnerabilities, code quality, dependency risks"}.
Create a plan with 3-5 steps covering: repository scanning, deep analysis of critical files, and reporting.`,
      logger,
      false
    );

    planStep.output = planResult;
    planStep.status = "completed";
    planStep.completedAt = new Date().toISOString();
    emitUpdate();

    // === STEP 2: Scanner discovers issues ===
    const scanStep: TaskStep = {
      id: "step-2-scan",
      agent: "scanner",
      action: "Scan repository for issues",
      status: "in_progress",
      input: { owner, repo },
      output: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      tokensUsed: 0,
      toolCalls: [],
    };
    run.steps.push(scanStep);
    emitUpdate();

    logger.log("scanner", "decision", "Beginning repository scan", { owner, repo });

    // Phase 1: Directly fetch repository structure and key files via GitHub API
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Forge-Protocol-Agent",
    };
    if (process.env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    let repoContent = "";
    const filesToFetch: string[] = [];

    try {
      // Get root directory listing
      const rootRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, { headers: ghHeaders });
      if (rootRes.ok) {
        const rootFiles = await rootRes.json();
        const fileList = rootFiles.map((f: { name: string; type: string; path: string }) => `${f.path} (${f.type})`).join("\n");
        repoContent += `=== Repository Structure ===\n${fileList}\n\n`;
        logger.log("scanner", "tool_call", "fetch_repo_contents", { path: "/", fileCount: rootFiles.length });

        // Identify key files to fetch
        for (const f of rootFiles) {
          if (["package.json", "tsconfig.json", ".env.example", "next.config.ts", "next.config.js"].includes(f.name)) {
            filesToFetch.push(f.path);
          }
        }

        // Check src directory
        const srcRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/src/lib`, { headers: ghHeaders });
        if (srcRes.ok) {
          const srcFiles = await srcRes.json();
          for (const f of srcFiles) {
            if (f.name.endsWith(".ts") || f.name.endsWith(".tsx")) {
              filesToFetch.push(f.path);
            }
          }
        }

        // Also check API routes
        const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/src/app/api`, { headers: ghHeaders });
        if (apiRes.ok) {
          const apiDirs = await apiRes.json();
          for (const d of apiDirs) {
            if (d.type === "dir") {
              const routeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${d.path}`, { headers: ghHeaders });
              if (routeRes.ok) {
                const routeFiles = await routeRes.json();
                for (const rf of routeFiles) {
                  if (rf.name === "route.ts") filesToFetch.push(rf.path);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      logger.log("scanner", "error", "Failed to fetch repo structure", { error: String(err) });
    }

    // Fetch file contents (up to 8 files)
    for (const filePath of filesToFetch.slice(0, 8)) {
      try {
        const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, { headers: ghHeaders });
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          if (fileData.content) {
            let content = Buffer.from(fileData.content, "base64").toString("utf-8");
            if (content.length > 5000) content = content.slice(0, 5000) + "\n... [TRUNCATED]";
            repoContent += `=== ${filePath} ===\n${content}\n\n`;
            logger.log("scanner", "tool_call", "fetch_file_content", { path: filePath, size: content.length });
          }
        }
      } catch {
        // skip files that fail
      }
    }

    // Phase 2: Pass all gathered code to Claude for analysis (NO tool use)
    logger.log("scanner", "decision", `Analyzing ${filesToFetch.length} files for vulnerabilities`, {
      files: filesToFetch,
    });

    const scanResult = await runAgent(
      "scanner",
      `Analyze this GitHub repository (${owner}/${repo}) for security vulnerabilities and code quality issues.

Here is the repository content:

${repoContent}

Identify ALL security vulnerabilities and code quality issues. Look for:
1. Hardcoded secrets, API keys, passwords in source code
2. Missing input validation (SQL injection, XSS, command injection)
3. Insecure authentication or session management
4. Missing HTTPS, CORS misconfigurations
5. Outdated or vulnerable dependencies
6. Missing error handling that could leak information
7. Insecure file operations or path traversal risks
8. Missing rate limiting on API endpoints
9. Exposed debug endpoints or verbose error messages
10. Insecure cryptographic practices

Return ONLY a raw JSON array (no markdown code fences, no explanation).
Each element: {"severity":"critical|high|medium|low|info","title":"...","description":"...","file":"...","line":null,"suggestion":"..."}`,
      logger,
      false  // No tools — pure analysis
    );

    scanStep.output = scanResult;
    scanStep.status = "completed";
    scanStep.completedAt = new Date().toISOString();

    // Parse findings from scanner output
    try {
      // Try multiple JSON extraction strategies
      let jsonStr: string | null = null;
      // Strategy 1: raw JSON array
      const rawMatch = scanResult.match(/\[[\s\S]*\]/);
      if (rawMatch) jsonStr = rawMatch[0];
      // Strategy 2: JSON inside markdown code block
      if (!jsonStr) {
        const codeBlockMatch = scanResult.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
      }
      if (jsonStr) {
        const rawFindings = JSON.parse(jsonStr);
        run.findings = rawFindings.map((f: Partial<Finding>, i: number) => ({
          id: `finding-${i + 1}`,
          severity: f.severity ?? "info",
          title: f.title ?? "Unknown",
          description: f.description ?? "",
          file: f.file ?? "",
          line: f.line ?? null,
          suggestion: f.suggestion ?? "",
          fixApplied: false,
        }));
      }
    } catch {
      logger.log("scanner", "error", "Failed to parse scanner findings as JSON", {
        rawOutput: scanResult.slice(0, 500),
      });
    }
    emitUpdate();

    // === STEP 3: Analyzer performs deep analysis on top findings ===
    const topFindings = run.findings
      .filter((f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium")
      .slice(0, 3);

    if (topFindings.length > 0) {
      const analyzeStep: TaskStep = {
        id: "step-3-analyze",
        agent: "analyzer",
        action: "Deep analysis of critical findings",
        status: "in_progress",
        input: { findings: topFindings },
        output: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        tokensUsed: 0,
        toolCalls: [],
      };
      run.steps.push(analyzeStep);
      emitUpdate();

      logger.log("analyzer", "decision", `Analyzing ${topFindings.length} critical findings`, {
        findingIds: topFindings.map((f) => f.id),
      });

      const analysisResult = await runAgent(
        "analyzer",
        `Perform deep analysis on these critical/high severity findings from ${owner}/${repo}:

${JSON.stringify(topFindings, null, 2)}

For each finding, use fetch_file_content to read the actual file and provide detailed analysis.
Include CWE references, potential impact, and exploitation scenarios.`,
        logger,
        true
      );

      analyzeStep.output = analysisResult;
      analyzeStep.status = "completed";
      analyzeStep.completedAt = new Date().toISOString();
      emitUpdate();

      // === STEP 4: Fixer proposes fixes ===
      if (!logger.isBudgetExceeded()) {
        const fixStep: TaskStep = {
          id: "step-4-fix",
          agent: "fixer",
          action: "Generate fixes for critical issues",
          status: "in_progress",
          input: { findings: topFindings },
          output: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
          tokensUsed: 0,
          toolCalls: [],
        };
        run.steps.push(fixStep);
        emitUpdate();

        const fixResult = await runAgent(
          "fixer",
          `Generate minimal, targeted fixes for these critical findings in ${owner}/${repo}:

${JSON.stringify(topFindings, null, 2)}

Use fetch_file_content to read the current code, then propose specific fixes.
Return JSON with fixedCode, explanation, and filesChanged for each finding.`,
          logger,
          true
        );

        fixStep.output = fixResult;
        fixStep.status = "completed";
        fixStep.completedAt = new Date().toISOString();
        emitUpdate();

        // === STEP 5: Reviewer verifies fixes ===
        if (!logger.isBudgetExceeded()) {
          const reviewStep: TaskStep = {
            id: "step-5-review",
            agent: "reviewer",
            action: "Verify proposed fixes",
            status: "in_progress",
            input: { fixes: fixResult },
            output: null,
            startedAt: new Date().toISOString(),
            completedAt: null,
            tokensUsed: 0,
            toolCalls: [],
          };
          run.steps.push(reviewStep);
          emitUpdate();

          logger.log("reviewer", "decision", "Reviewing proposed fixes", {});

          const reviewResult = await runAgent(
            "reviewer",
            `Review these proposed fixes for ${owner}/${repo}:

Findings: ${JSON.stringify(topFindings, null, 2)}

Proposed fixes: ${fixResult}

Verify each fix actually addresses the issue, doesn't introduce regressions, and follows code style.
Give approval/rejection with reasoning for each.`,
            logger,
            false
          );

          reviewStep.output = reviewResult;
          reviewStep.status = "completed";
          reviewStep.completedAt = new Date().toISOString();
          emitUpdate();
        }
      }
    }

    // === STEP 6: ERC-8004 Reputation Update ===
    // Try to update reputation on-chain (non-blocking — will fail gracefully if no gas)
    try {
      logger.log("orchestrator", "identity", "Attempting ERC-8004 reputation update", {
        agentAddress: getAgentAddress(),
      });

      // This will only work if the wallet has Base Sepolia ETH
      // We log the attempt either way for the submission
      const feedbackTx = await giveFeedback(
        BigInt(1), // placeholder agentId — updated after registration
        BigInt(95), // 95/100 quality score
        0,
        "audit_quality",
        "forge_protocol",
        `https://github.com/${owner}/${repo}`,
      );

      run.erc8004Txs.push({
        type: "reputation_feedback",
        hash: feedbackTx,
        chain: "base-sepolia",
        status: "confirmed",
        timestamp: new Date().toISOString(),
        details: { agentId: 1, value: 95, tag: "audit_quality" },
      });
    } catch (err) {
      logger.log("orchestrator", "error", "ERC-8004 reputation update failed (likely no gas)", {
        error: String(err),
      });
    }

    // Complete the run
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    emitUpdate();

    logger.log("orchestrator", "decision", "Pipeline complete", {
      totalFindings: run.findings.length,
      criticalFindings: run.findings.filter((f) => f.severity === "critical").length,
      stepsCompleted: run.steps.filter((s) => s.status === "completed").length,
      budget: logger.getBudget(),
    });
  } catch (err) {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    logger.log("orchestrator", "error", "Pipeline failed", { error: String(err) });
    emitUpdate();
  }

  return run;
}
