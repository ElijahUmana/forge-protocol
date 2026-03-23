import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  type Hash,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const IDENTITY_REGISTRY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION_REGISTRY: Address = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

// Using Ethereum Sepolia (same ERC-8004 contract addresses deployed across all testnets)
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

function getClients() {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });
  return { publicClient, walletClient, account };
}

export async function registerAgentIdentity(agentURI: string): Promise<{
  hash: Hash;
  agentId: bigint | null;
}> {
  const { publicClient, walletClient } = getClients();

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: [
      parseAbiItem("function register(string agentURI) external returns (uint256)"),
    ],
    functionName: "register",
    args: [agentURI],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse AgentRegistered event to get agentId
  let agentId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() && log.topics.length >= 2) {
      agentId = BigInt(log.topics[1] ?? "0");
      break;
    }
  }

  return { hash, agentId };
}

export async function setAgentURI(agentId: bigint, newURI: string): Promise<Hash> {
  const { walletClient } = getClients();

  return walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: [
      parseAbiItem("function setAgentURI(uint256 agentId, string newURI) external"),
    ],
    functionName: "setAgentURI",
    args: [agentId, newURI],
  });
}

export async function giveFeedback(
  agentId: bigint,
  value: bigint,
  valueDecimals: number,
  tag1: string,
  tag2: string,
  feedbackURI: string,
): Promise<Hash> {
  const { walletClient } = getClients();

  return walletClient.writeContract({
    address: REPUTATION_REGISTRY,
    abi: [
      parseAbiItem(
        "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external"
      ),
    ],
    functionName: "giveFeedback",
    args: [
      agentId,
      value,
      valueDecimals,
      tag1,
      tag2,
      "",
      feedbackURI,
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    ],
  });
}

export async function getReputationSummary(
  agentId: bigint,
  tag1: string,
  tag2: string,
): Promise<{ count: bigint; summaryValue: bigint; summaryValueDecimals: number }> {
  const { publicClient } = getClients();

  const result = await publicClient.readContract({
    address: REPUTATION_REGISTRY,
    abi: [
      parseAbiItem(
        "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)"
      ),
    ],
    functionName: "getSummary",
    args: [agentId, [], tag1, tag2],
  });

  return {
    count: result[0],
    summaryValue: result[1],
    summaryValueDecimals: result[2],
  };
}

export async function getAgentBalance(): Promise<string> {
  const { publicClient, account } = getClients();
  const balance = await publicClient.getBalance({ address: account.address });
  return (Number(balance) / 1e18).toFixed(6);
}

export function getAgentAddress(): string {
  return process.env.AGENT_ADDRESS ?? "0x0000000000000000000000000000000000000000";
}

// Trust-gating: check if an agent's reputation meets the minimum threshold
export async function checkAgentTrust(
  agentId: bigint,
  minScore: number,
  tag: string,
): Promise<{ trusted: boolean; score: number; count: number; reason: string }> {
  try {
    const summary = await getReputationSummary(agentId, tag, "");
    const score = Number(summary.summaryValue);
    const count = Number(summary.count);

    if (count === 0) {
      return {
        trusted: true, // New agents get benefit of the doubt
        score: 0,
        count: 0,
        reason: "No reputation history — granting provisional trust",
      };
    }

    const trusted = score >= minScore;
    return {
      trusted,
      score,
      count,
      reason: trusted
        ? `Agent reputation ${score}/${100} meets threshold ${minScore}`
        : `Agent reputation ${score}/${100} BELOW threshold ${minScore} — REFUSING collaboration`,
    };
  } catch {
    // If reputation check fails, allow with warning
    return {
      trusted: true,
      score: -1,
      count: 0,
      reason: "Reputation check failed (network error) — proceeding with caution",
    };
  }
}

export { IDENTITY_REGISTRY, REPUTATION_REGISTRY, RPC_URL };
