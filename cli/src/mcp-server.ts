import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

const CONFIG_FILE = "project-planner.config.json";

export class ProjectPlannerMCPServer {
  private server: Server;
  private config: any = null;

  constructor() {
    this.server = new Server(
      {
        name: "project-planner-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_prd",
            description: "Get the current version of the Product Requirements Document (PRD) for a project.",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
              },
              required: ["projectId"],
            },
          },
          {
            name: "list_features",
            description: "List all features for a given plan.",
            inputSchema: {
              type: "object",
              properties: {
                planId: { type: "string" },
              },
              required: ["planId"],
            },
          },
          {
            name: "list_tasks",
            description: "List tasks for a given feature or plan, optionally filtered by status.",
            inputSchema: {
              type: "object",
              properties: {
                featureId: { type: "string" },
                planId: { type: "string" },
                status: { type: "string", enum: ["todo", "doing", "blocked", "done", "failed"] },
              },
            },
          },
          {
            name: "get_next_task",
            description: "Get the next available task to work on for a given plan.",
            inputSchema: {
              type: "object",
              properties: {
                planId: { type: "string" },
              },
              required: ["planId"],
            },
          },
          {
            name: "start_task",
            description: "Mark a task as 'doing'.",
            inputSchema: {
              type: "object",
              properties: {
                taskId: { type: "string" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "complete_task",
            description: "Mark a task as 'done'.",
            inputSchema: {
              type: "object",
              properties: {
                taskId: { type: "string" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "fail_task",
            description: "Mark a task as 'failed' with a reason.",
            inputSchema: {
              type: "object",
              properties: {
                taskId: { type: "string" },
                reason: { type: "string" },
              },
              required: ["taskId", "reason"],
            },
          },
          {
            name: "get_codebase_context",
            description: "Search for relevant files in a project's codebase context.",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                query: { type: "string" },
              },
              required: ["projectId", "query"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.config) {
        throw new Error("Configuration not loaded");
      }
      
      const { apiUrl, token } = this.config;
      const baseUrl = apiUrl.replace(/\/+$/, "");
      const headers = { Authorization: `Bearer ${token}` };

      try {
        if (request.params.name === "get_prd") {
          const { projectId } = request.params.arguments as { projectId: string };
          
          // 1. Get plan for project
          const plansRes = await fetch(`${baseUrl}/api/plans?projectId=${projectId}`, { headers });
          if (!plansRes.ok) throw new Error(`Failed to fetch plans: ${await plansRes.text()}`);
          const plansData = await plansRes.json();
          const plans = plansData.plans || [];
          if (plans.length === 0) throw new Error("No plans found for this project.");
          
          const planId = plans[0].id; // ambil plan terbaru
          
          // 2. Fetch PRD (Markdown export)
          const prdRes = await fetch(`${baseUrl}/api/plans/${planId}/export`, { headers });
          if (!prdRes.ok) throw new Error(`Failed to fetch PRD: ${await prdRes.text()}`);
          const prdMarkdown = await prdRes.text();
          
          return {
            content: [{ type: "text", text: prdMarkdown }],
          };
        }
        
        else if (request.params.name === "list_features") {
          const { planId } = request.params.arguments as { planId: string };
          
          const res = await fetch(`${baseUrl}/api/plans/${planId}/features`, { headers });
          if (!res.ok) throw new Error(`Failed to fetch features: ${await res.text()}`);
          
          const data = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(data.features, null, 2) }],
          };
        }
        
        else if (request.params.name === "list_tasks") {
          const { featureId, planId, status } = request.params.arguments as { featureId?: string; planId?: string; status?: string };
          
          let allTasks: any[] = [];
          
          if (featureId) {
            const res = await fetch(`${baseUrl}/api/features/${featureId}/tasks`, { headers });
            if (!res.ok) throw new Error(`Failed to fetch tasks: ${await res.text()}`);
            const data = await res.json();
            allTasks = data.tasks || [];
          } else if (planId) {
            // Get all features first
            const featRes = await fetch(`${baseUrl}/api/plans/${planId}/features`, { headers });
            if (!featRes.ok) throw new Error(`Failed to fetch features: ${await featRes.text()}`);
            const featData = await featRes.json();
            const features = featData.features || [];
            
            // For each feature, get tasks
            for (const f of features) {
              const taskRes = await fetch(`${baseUrl}/api/features/${f.id}/tasks`, { headers });
              if (taskRes.ok) {
                const taskData = await taskRes.json();
                allTasks.push(...(taskData.tasks || []));
              }
            }
          } else {
            throw new Error("Must provide either featureId or planId");
          }
          
          if (status) {
            allTasks = allTasks.filter(t => t.status === status);
          }
          
          return {
            content: [{ type: "text", text: JSON.stringify(allTasks, null, 2) }],
          };
        }
        
        else if (request.params.name === "get_next_task") {
          const { planId } = request.params.arguments as { planId: string };
          const res = await fetch(`${baseUrl}/api/plans/${planId}/tasks/next`, { headers });
          if (!res.ok) throw new Error(`Failed to get next task: ${await res.text()}`);
          const data = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }
        
        else if (request.params.name === "start_task") {
          const { taskId } = request.params.arguments as { taskId: string };
          const res = await fetch(`${baseUrl}/api/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "doing" })
          });
          if (!res.ok) throw new Error(`Failed to start task: ${await res.text()}`);
          const data = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }
        
        else if (request.params.name === "complete_task") {
          const { taskId } = request.params.arguments as { taskId: string };
          const res = await fetch(`${baseUrl}/api/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done" })
          });
          if (!res.ok) throw new Error(`Failed to complete task: ${await res.text()}`);
          const data = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }
        
        else if (request.params.name === "fail_task") {
          const { taskId, reason } = request.params.arguments as { taskId: string; reason: string };
          const res = await fetch(`${baseUrl}/api/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "failed", reason })
          });
          if (!res.ok) throw new Error(`Failed to fail task: ${await res.text()}`);
          const data = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }
        
        else if (request.params.name === "get_codebase_context") {
          const { projectId, query } = request.params.arguments as { projectId: string; query: string };
          
          // Cari codebaseId untuk projectId ini
          const codebasesRes = await fetch(`${baseUrl}/api/codebases?projectId=${projectId}`, { headers });
          if (!codebasesRes.ok) throw new Error(`Failed to check codebases: ${await codebasesRes.text()}`);
          
          const codebasesData = await codebasesRes.json();
          const codebases = codebasesData.codebases || [];
          
          if (codebases.length === 0) {
            return {
              content: [{ type: "text", text: "Error: Belum ada codebase yang di-sync untuk project ini. Silakan jalankan 'npx project-planner index' lalu 'npx project-planner sync' di direktori project Anda terlebih dahulu." }],
              isError: true,
            };
          }
          
          const codebaseId = codebases[0].id;
          
          const contextRes = await fetch(`${baseUrl}/api/codebases/${codebaseId}/context?query=${encodeURIComponent(query)}`, { headers });
          if (!contextRes.ok) throw new Error(`Failed to get codebase context: ${await contextRes.text()}`);
          
          const contextData = await contextRes.json();
          return {
            content: [{ type: "text", text: JSON.stringify(contextData, null, 2) }],
          };
        }
        
        throw new Error(`Tool not found: ${request.params.name}`);
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error executing tool: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const cwd = process.cwd();
    const configPath = path.join(cwd, CONFIG_FILE);

    try {
      const configContent = await fs.readFile(configPath, "utf8");
      this.config = JSON.parse(configContent);
    } catch {
      console.error(
        "❌ Gagal membaca project-planner.config.json. Pastikan Anda sudah menjalankan `npx project-planner connect`."
      );
      process.exit(1);
    }

    if (!this.config.codebaseId) {
      console.error(
        "⚠️ codebaseId belum diset di config lokal. Server tetap berjalan, namun codebase context untuk project lokal ini mungkin belum tersedia sampai Anda menjalankan `index` dan `sync`."
      );
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error("🚀 MCP Server Project Planner berjalan menggunakan stdio transport.");
  }
}
