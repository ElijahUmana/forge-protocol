// x402 Micropayment Protocol Support
// Agents can charge for security audits via x402 HTTP payment headers

export interface X402PaymentRequest {
  amount: string; // in USDC (e.g., "0.50")
  currency: string; // "USDC"
  chain: string; // "base" | "ethereum"
  recipient: string; // wallet address
  description: string;
}

export interface X402PaymentReceipt {
  txHash: string;
  amount: string;
  payer: string;
  timestamp: string;
  verified: boolean;
}

// Generate x402 payment-required headers
export function createX402Headers(auditCost: string, recipient: string): Record<string, string> {
  return {
    "X-Payment-Required": "true",
    "X-Payment-Amount": auditCost,
    "X-Payment-Currency": "USDC",
    "X-Payment-Chain": "base",
    "X-Payment-Recipient": recipient,
    "X-Payment-Description": "Forge Protocol security audit",
    "X-Payment-Protocol": "x402",
  };
}

// Verify an x402 payment from request headers
export function verifyX402Payment(headers: Headers): {
  paid: boolean;
  receipt: X402PaymentReceipt | null;
  error: string | null;
} {
  const paymentTx = headers.get("X-Payment-Tx");
  const paymentAmount = headers.get("X-Payment-Amount");
  const payerAddress = headers.get("X-Payment-Payer");

  if (!paymentTx || !paymentAmount || !payerAddress) {
    return {
      paid: false,
      receipt: null,
      error: "Missing x402 payment headers. Required: X-Payment-Tx, X-Payment-Amount, X-Payment-Payer",
    };
  }

  // In production, verify the transaction on-chain
  // For hackathon: accept the headers as proof of intent
  return {
    paid: true,
    receipt: {
      txHash: paymentTx,
      amount: paymentAmount,
      payer: payerAddress,
      timestamp: new Date().toISOString(),
      verified: true, // Would verify on-chain in production
    },
    error: null,
  };
}

// Calculate audit cost based on repository size and depth
export function calculateAuditCost(
  fileCount: number,
  linesOfCode: number,
  depth: "basic" | "standard" | "deep"
): string {
  const baseCost = 0.1; // $0.10 base
  const fileCost = fileCount * 0.02; // $0.02 per file
  const locCost = (linesOfCode / 1000) * 0.05; // $0.05 per 1K LoC
  const depthMultiplier = depth === "deep" ? 3 : depth === "standard" ? 1.5 : 1;

  const total = (baseCost + fileCost + locCost) * depthMultiplier;
  return total.toFixed(2);
}
