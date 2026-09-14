import { ProjectPlannerMCPServer } from "../mcp-server.js";

export async function mcpCommand() {
  const server = new ProjectPlannerMCPServer();
  await server.run();
}
