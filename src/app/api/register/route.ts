import { registerAgentIdentity, getAgentBalance, getAgentAddress } from "@/lib/erc8004";

export async function POST() {
  try {
    const balance = await getAgentBalance();
    if (parseFloat(balance) < 0.001) {
      return Response.json(
        {
          error: "Insufficient Base Sepolia ETH",
          address: getAgentAddress(),
          balance,
          faucet: "https://faucet.quicknode.com/base/sepolia",
        },
        { status: 400 }
      );
    }

    const agentURI = "https://raw.githubusercontent.com/ElijahUmana/forge-protocol/main/agent.json";
    const { hash, agentId } = await registerAgentIdentity(agentURI);

    return Response.json({
      success: true,
      hash,
      agentId: agentId?.toString() ?? null,
      explorer: `https://sepolia.basescan.org/tx/${hash}`,
      scan8004: agentId ? `https://www.8004scan.io/agents/${agentId}` : null,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const address = getAgentAddress();
    const balance = await getAgentBalance();
    return Response.json({ address, balance, chain: "base-sepolia", chainId: 84532 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
