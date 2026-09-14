# Project Planner CLI & MCP Server

Welcome to the Project Planner CLI. This CLI not only scans and indexes your codebase but also acts as an MCP (Model Context Protocol) server, providing AI agents with context and task management capabilities directly integrated into your workspace.

## Setup & Requirements

Before running the MCP server, ensure you have connected the CLI to your project:

1. Link to your Project Planner workspace:
   ```bash
   npx project-planner connect
   ```
2. Scan and index your codebase:
   ```bash
   npx project-planner index
   ```
3. Sync the codebase context with the remote server:
   ```bash
   npx project-planner sync
   ```

## Connecting the MCP Server

The MCP Server communicates over `stdio`. It exposes several tools to any MCP-compatible client, including:
- `get_prd`, `list_features`, `list_tasks`
- `get_next_task`, `start_task`, `complete_task`, `fail_task`
- `get_codebase_context`

### 1. Claude Code

To add this MCP server to [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), you can use its built-in MCP command.

**Command:**
Navigate to your project directory (where `project-planner.config.json` is located) and run:
```bash
claude mcp add project-planner -- npx project-planner mcp
```

**Verification:**
1. Run `claude mcp list` to ensure `project-planner` is listed as an active server.
2. In a Claude Code session, ask: *"What tools are available?"* or specifically *"Can you list the tasks from my project planner?"*. You should see Claude discovering and using tools like `list_tasks` or `get_prd`.

### 2. Claude Desktop

To add the MCP server to Claude Desktop, you need to edit its configuration file.

**Config File Location:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Example Configuration:**
Open the configuration file and add the server under the `mcpServers` object. If you have the CLI installed globally or locally accessible via `npx`:

```json
{
  "mcpServers": {
    "project-planner": {
      "command": "npx",
      "args": [
        "project-planner",
        "mcp"
      ],
      "env": {}
    }
  }
}
```

*Note: If you are running the project directly from source without installing it, you can point it to the local CLI script:*
```json
{
  "mcpServers": {
    "project-planner": {
      "command": "npx",
      "args": [
        "--yes",
        "tsx",
        "/absolute/path/to/project-planner/cli/src/index.ts",
        "mcp"
      ],
      "env": {}
    }
  }
}
```

**Verification:**
1. Fully quit and restart Claude Desktop.
2. Open a new chat.
3. You should see a plug icon (🔌) in the chat input box. Clicking it will display the list of connected servers and available tools. Verify that the tools from `project-planner` (e.g., `get_codebase_context`, `start_task`) appear in this list.
