// Static Analysis Security Testing (SAST) — Pattern-based vulnerability detection
// Runs deterministic checks alongside Claude's AI analysis for ground truth

export interface SASTFinding {
  rule: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  file: string;
  line: number | null;
  match: string;
  cwe: string;
}

// OWASP-aligned security patterns
const SAST_RULES: {
  id: string;
  severity: SASTFinding["severity"];
  title: string;
  pattern: RegExp;
  cwe: string;
  description: string;
}[] = [
  {
    id: "SAST-001",
    severity: "critical",
    title: "Hardcoded secret or API key",
    pattern: /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]\s*['"`][A-Za-z0-9+/=_-]{16,}/gi,
    cwe: "CWE-798",
    description: "Hardcoded credentials found in source code. Attackers can extract these from the repository.",
  },
  {
    id: "SAST-002",
    severity: "critical",
    title: "SQL injection risk",
    pattern: /(?:query|execute|raw)\s*\(\s*[`'"].*\$\{/gi,
    cwe: "CWE-89",
    description: "String interpolation in SQL query. Use parameterized queries instead.",
  },
  {
    id: "SAST-003",
    severity: "high",
    title: "Command injection risk",
    pattern: /(?:exec|spawn|execSync|execFile)\s*\([^)]*(?:\$\{|` ?\+)/gi,
    cwe: "CWE-78",
    description: "User-controlled input in shell command execution.",
  },
  {
    id: "SAST-004",
    severity: "high",
    title: "Unsafe eval usage",
    pattern: /\beval\s*\(/gi,
    cwe: "CWE-95",
    description: "eval() executes arbitrary code. Use safe alternatives.",
  },
  {
    id: "SAST-005",
    severity: "high",
    title: "innerHTML assignment (XSS risk)",
    pattern: /\.innerHTML\s*=(?!=)/gi,
    cwe: "CWE-79",
    description: "Direct innerHTML assignment can lead to XSS. Use textContent or sanitize input.",
  },
  {
    id: "SAST-006",
    severity: "medium",
    title: "Insecure HTTP URL",
    pattern: /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/gi,
    cwe: "CWE-319",
    description: "HTTP URL transmits data in cleartext. Use HTTPS.",
  },
  {
    id: "SAST-007",
    severity: "medium",
    title: "Missing error handling",
    pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/gi,
    cwe: "CWE-390",
    description: "Empty catch block silently swallows errors.",
  },
  {
    id: "SAST-008",
    severity: "medium",
    title: "Deprecated crypto usage",
    pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/gi,
    cwe: "CWE-327",
    description: "MD5/SHA1 are cryptographically broken. Use SHA-256 or better.",
  },
  {
    id: "SAST-009",
    severity: "low",
    title: "Console.log in production code",
    pattern: /console\.log\s*\(/gi,
    cwe: "CWE-532",
    description: "Console output may leak sensitive information in production.",
  },
  {
    id: "SAST-010",
    severity: "medium",
    title: "Path traversal risk",
    pattern: /(?:readFile|writeFile|createReadStream|readFileSync)\s*\([^)]*(?:\+|concat|\$\{)/gi,
    cwe: "CWE-22",
    description: "Dynamic file path may allow directory traversal attacks.",
  },
  {
    id: "SAST-011",
    severity: "high",
    title: "Exposed private key pattern",
    pattern: /0x[a-fA-F0-9]{64}/g,
    cwe: "CWE-321",
    description: "Pattern matching a raw Ethereum private key found in source code.",
  },
  {
    id: "SAST-012",
    severity: "medium",
    title: "CORS wildcard",
    pattern: /['"]Access-Control-Allow-Origin['"]\s*[:,]\s*['"]\*['"]/gi,
    cwe: "CWE-942",
    description: "Wildcard CORS allows any origin to access resources.",
  },
];

// Run SAST analysis on source code
export function runSAST(files: { path: string; content: string }[]): SASTFinding[] {
  const findings: SASTFinding[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");

    for (const rule of SAST_RULES) {
      // Skip checking SAST-011 (private key pattern) on files we know have configs
      if (rule.id === "SAST-011" && (file.path.includes(".env") || file.path.includes("example"))) {
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = line.match(rule.pattern);
        if (matches) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            file: file.path,
            line: i + 1,
            match: matches[0].slice(0, 80),
            cwe: rule.cwe,
          });
        }
      }
    }
  }

  return findings;
}
