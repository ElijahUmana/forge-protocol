import { getLogger } from "@/lib/logger";

export async function GET() {
  const logger = getLogger();
  return Response.json(logger.toAgentLogJson());
}
