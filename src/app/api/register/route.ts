import { registerAgentIdentity, getAgentBalance, getAgentAddress } from "@/lib/erc8004";

export async function POST() {
  try {
    const balance = await getAgentBalance();
    if (parseFloat(balance) < 0.001) {
      return Response.json(
        {
          error: "Insufficient Sepolia ETH",
          address: getAgentAddress(),
          balance,
          faucet: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
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
      explorer: `https://sepolia.etherscan.io/tx/${hash}`,
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
    return Response.json({
      address,
      balance,
      chain: "ethereum-sepolia",
      chainId: 11155111,
      erc8004AgentId: 2221,
      identityTx: "0xadf3b56f10b60f40ca7a7973749c9612fd9ed5b0d160a45223e7ae5eb5c9a2ab",
      reputationTx: "0x96b4ae35ec3d52657f3be1bf135cac24da1b344055eac7196c697daf4ec99929",
      synthesisAgentId: 35843,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
