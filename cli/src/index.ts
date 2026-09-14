#!/usr/bin/env node

import { Command } from "commander";
import { connectCommand } from "./commands/connect.js";
import { indexCommand } from "./commands/index-command.js";
import { syncCommand } from "./commands/sync-command.js";
import { mcpCommand } from "./commands/mcp-command.js";

const program = new Command();

program
  .name("project-planner")
  .description(
    "CLI tool for AI Project Planner — scan, index, and sync your codebase with the web app"
  )
  .version("0.1.0");

program
  .command("doctor")
  .description("Cek koneksi ke server dan validasi token")
  .action(() => {
    console.log("🩺 doctor: belum diimplementasi");
  });

program
  .command("connect")
  .description("Link folder lokal ke sebuah Project di web app")
  .action(connectCommand);

program
  .command("index")
  .description(
    "Scan codebase, generate file tree + summary, simpan ke .project-planner/index.json"
  )
  .action(indexCommand);

program
  .command("sync")
  .description("Kirim index ke server (basic atau full mode)")
  .action(syncCommand);

program
  .command("mcp")
  .description("Menjalankan MCP Server menggunakan stdio transport")
  .action(mcpCommand);

program
  .command("status")
  .description("Tampilkan status sync terakhir")
  .action(() => {
    console.log("📊 status: belum diimplementasi");
  });

program.parse();
