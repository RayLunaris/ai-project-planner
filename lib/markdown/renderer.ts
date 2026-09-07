import { PrdContentJson } from "@/lib/prompts/prd-generation";

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderPrdToMarkdown(prd: PrdContentJson): string {
  const sections: string[] = [];

  // Header & Product Name
  sections.push(`# Product Requirements Document (PRD)`);
  sections.push(`> Dokumen spesifikasi teknis untuk pengembangan sistem **${prd.productName}**.\n`);

  // Overview
  const overviewLines: string[] = [`## 1. Gambaran Umum (Overview)`];
  overviewLines.push(`### Problem\n${prd.overview.problem}\n`);
  overviewLines.push(`### Solution\n${prd.overview.solution}\n`);
  if (prd.overview.targetUsers && prd.overview.targetUsers.length > 0) {
    overviewLines.push(`### Target Pengguna`);
    prd.overview.targetUsers.forEach((u) => {
      overviewLines.push(`- ${u}`);
    });
  }
  sections.push(overviewLines.join("\n"));

  // Goals & Non-Goals
  const goalsLines: string[] = [`## 2. Goals & Non-Goals`];
  if (prd.goals && prd.goals.length > 0) {
    goalsLines.push(`### Goals`);
    prd.goals.forEach((g) => goalsLines.push(`- [ ] ${g}`));
  }
  if (prd.nonGoals && prd.nonGoals.length > 0) {
    goalsLines.push(`\n### Non-Goals (Di luar cakupan)`);
    prd.nonGoals.forEach((ng) => goalsLines.push(`- ⛔ ${ng}`));
  }
  sections.push(goalsLines.join("\n"));

  // Requirements
  const reqLines: string[] = [`## 3. Spesifikasi Kebutuhan (Requirements)`];
  if (prd.requirements.functional && prd.requirements.functional.length > 0) {
    reqLines.push(`### Functional Requirements`);
    prd.requirements.functional.forEach((f, idx) => {
      reqLines.push(`${idx + 1}. ${f}`);
    });
  }
  if (prd.requirements.nonFunctional && prd.requirements.nonFunctional.length > 0) {
    reqLines.push(`\n### Non-Functional Requirements`);
    prd.requirements.nonFunctional.forEach((nf, idx) => {
      reqLines.push(`${idx + 1}. ${nf}`);
    });
  }
  sections.push(reqLines.join("\n"));

  // Constraints & Assumptions
  if ((prd.constraints && prd.constraints.length > 0) || (prd.assumptions && prd.assumptions.length > 0)) {
    const caLines: string[] = [`## 4. Batasan & Asumsi`];
    if (prd.constraints && prd.constraints.length > 0) {
      caLines.push(`### Constraints (Batasan Teknis / Operasional)`);
      prd.constraints.forEach((c) => caLines.push(`- ⚠️ ${c}`));
    }
    if (prd.assumptions && prd.assumptions.length > 0) {
      caLines.push(`\n### Assumptions (Asumsi Perancangan)`);
      prd.assumptions.forEach((a) => caLines.push(`- ℹ️ ${a}`));
    }
    sections.push(caLines.join("\n"));
  }

  // Core Features
  if (prd.coreFeatures && prd.coreFeatures.length > 0) {
    const featLines: string[] = [`## 5. Fitur Utama (Core Features)`];
    featLines.push(`| No | Fitur | Prioritas | Deskripsi |`);
    featLines.push(`|:---|:---|:---:|:---|`);
    prd.coreFeatures.forEach((feat, idx) => {
      const priorityBadge = feat.priority === "must-have" ? "**Must-Have**" : "Nice-to-Have";
      featLines.push(`| ${idx + 1} | ${escapeTableCell(feat.name)} | ${priorityBadge} | ${escapeTableCell(feat.description)} |`);
    });
    sections.push(featLines.join("\n"));
  }

  // User Flow
  if (prd.userFlow && prd.userFlow.length > 0) {
    const flowLines: string[] = [`## 6. Alur Pengguna (User Flow)`];
    prd.userFlow.forEach((step, idx) => {
      flowLines.push(`${idx + 1}. ${step}`);
    });
    sections.push(flowLines.join("\n"));
  }

  // Technical Architecture
  const archLines: string[] = [`## 7. Arsitektur Teknis`];
  archLines.push(`| Komponen | Spesifikasi / Teknologi |`);
  archLines.push(`|:---|:---|`);
  archLines.push(`| **Frontend** | ${escapeTableCell(prd.architecture.frontend)} |`);
  archLines.push(`| **Backend** | ${escapeTableCell(prd.architecture.backend)} |`);
  archLines.push(`| **Database** | ${escapeTableCell(prd.architecture.database)} |`);
  archLines.push(`| **Autentikasi** | ${escapeTableCell(prd.architecture.authentication)} |`);
  if (prd.architecture.externalServices && prd.architecture.externalServices.length > 0) {
    archLines.push(`| **External Services** | ${escapeTableCell(prd.architecture.externalServices.join(", "))} |`);
  }
  sections.push(archLines.join("\n"));

  // Database Schema
  if (prd.databaseSchema && prd.databaseSchema.length > 0) {
    const dbLines: string[] = [`## 8. Desain Skema Database`];
    prd.databaseSchema.forEach((table) => {
      dbLines.push(`### Tabel: \`${table.table}\``);
      table.columns.forEach((col) => {
        dbLines.push(`- \`${col}\``);
      });
      dbLines.push("");
    });
    sections.push(dbLines.join("\n"));
  }

  return sections.join("\n\n");
}
