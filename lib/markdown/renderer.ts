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
      if (table.primaryKey) {
        dbLines.push(`- **Primary Key**: \`${table.primaryKey}\``);
      }
      if (table.columns && table.columns.length > 0) {
        const hasExtraDetails =
          Boolean(table.primaryKey) ||
          (table.foreignKeys && table.foreignKeys.length > 0) ||
          (table.constraints && table.constraints.length > 0);

        if (hasExtraDetails) {
          dbLines.push(`- **Kolom**:`);
          table.columns.forEach((col) => {
            dbLines.push(`  - \`${col}\``);
          });
        } else {
          table.columns.forEach((col) => {
            dbLines.push(`- \`${col}\``);
          });
        }
      }
      if (table.foreignKeys && table.foreignKeys.length > 0) {
        dbLines.push(`- **Foreign Keys**:`);
        table.foreignKeys.forEach((fk) => {
          dbLines.push(`  - \`${fk}\``);
        });
      }
      if (table.constraints && table.constraints.length > 0) {
        dbLines.push(`- **Constraints**:`);
        table.constraints.forEach((c) => {
          dbLines.push(`  - \`${c}\``);
        });
      }
      dbLines.push("");
    });
    sections.push(dbLines.join("\n"));
  }

  // 9. Struktur Folder & File Proyek
  if (prd.folderStructure && prd.folderStructure.length > 0) {
    const folderLines: string[] = [`## 9. Struktur Folder & File Proyek`];
    folderLines.push(`| Path File / Folder | Deskripsi |`);
    folderLines.push(`|:---|:---|`);
    prd.folderStructure.forEach((item) => {
      folderLines.push(`| \`${escapeTableCell(item.path)}\` | ${escapeTableCell(item.description || "-")} |`);
    });
    sections.push(folderLines.join("\n"));
  }

  // 10. Spesifikasi API Endpoint
  if (prd.apiEndpoints && prd.apiEndpoints.length > 0) {
    const apiLines: string[] = [`## 10. Spesifikasi API Endpoint`];
    apiLines.push(`| Method | Path Endpoint | Auth | Deskripsi | Request Body | Response |`);
    apiLines.push(`|:---:|:---|:---:|:---|:---|:---|`);
    prd.apiEndpoints.forEach((ep) => {
      const auth = ep.authRequired ? "🔒 Ya" : "🌐 Publik";
      const req = ep.requestBody ? `\`${escapeTableCell(ep.requestBody)}\`` : "-";
      const res = ep.responseBody ? `\`${escapeTableCell(ep.responseBody)}\`` : "-";
      apiLines.push(`| **${escapeTableCell(ep.method)}** | \`${escapeTableCell(ep.path)}\` | ${auth} | ${escapeTableCell(ep.description || "-")} | ${req} | ${res} |`);
    });
    sections.push(apiLines.join("\n"));
  }

  // 11. Spesifikasi Halaman
  if (prd.pageSpecs && prd.pageSpecs.length > 0) {
    const pageLines: string[] = [`## 11. Spesifikasi Halaman (Page Specs)`];
    prd.pageSpecs.forEach((page, idx) => {
      pageLines.push(`### ${idx + 1}. ${page.name} (\`${page.path}\`)`);
      if (page.description) {
        pageLines.push(`${page.description}\n`);
      }
      if (page.components && page.components.length > 0) {
        pageLines.push(`**Komponen Utama:**`);
        page.components.forEach((c) => {
          pageLines.push(`- ${c}`);
        });
        pageLines.push("");
      }
    });
    sections.push(pageLines.join("\n"));
  }

  // 12. Aturan Validasi
  if (prd.validationRules && prd.validationRules.length > 0) {
    const valLines: string[] = [`## 12. Aturan Validasi (Validation Rules)`];
    prd.validationRules.forEach((vr) => {
      valLines.push(`### Entitas / Form: \`${vr.entity}\``);
      if (vr.rules && vr.rules.length > 0) {
        vr.rules.forEach((r) => {
          valLines.push(`- ${r}`);
        });
      }
      valLines.push("");
    });
    sections.push(valLines.join("\n"));
  }

  // 13. Skenario Kasus Batas (Edge Cases)
  if (prd.edgeCases && prd.edgeCases.length > 0) {
    const edgeLines: string[] = [`## 13. Skenario Kasus Batas (Edge Cases)`];
    edgeLines.push(`| No | Skenario Edge Case | Penanganan / Mitigasi |`);
    edgeLines.push(`|:---:|:---|:---|`);
    prd.edgeCases.forEach((ec, idx) => {
      edgeLines.push(`| ${idx + 1} | ${escapeTableCell(ec.scenario)} | ${escapeTableCell(ec.handling)} |`);
    });
    sections.push(edgeLines.join("\n"));
  }

  // 14. Strategi SEO & Metadata
  if (
    prd.seoStrategy &&
    (prd.seoStrategy.metaTitle ||
      prd.seoStrategy.metaDescription ||
      (prd.seoStrategy.keywords && prd.seoStrategy.keywords.length > 0) ||
      prd.seoStrategy.indexingStrategy ||
      prd.seoStrategy.openGraph)
  ) {
    const seoLines: string[] = [`## 14. Strategi SEO & Metadata`];
    seoLines.push(`| Atribut | Nilai / Konfigurasi |`);
    seoLines.push(`|:---|:---|`);
    if (prd.seoStrategy.metaTitle) {
      seoLines.push(`| **Meta Title** | ${escapeTableCell(prd.seoStrategy.metaTitle)} |`);
    }
    if (prd.seoStrategy.metaDescription) {
      seoLines.push(`| **Meta Description** | ${escapeTableCell(prd.seoStrategy.metaDescription)} |`);
    }
    if (prd.seoStrategy.keywords && prd.seoStrategy.keywords.length > 0) {
      seoLines.push(`| **Keywords** | ${escapeTableCell(prd.seoStrategy.keywords.join(", "))} |`);
    }
    if (prd.seoStrategy.indexingStrategy) {
      seoLines.push(`| **Indexing Strategy** | ${escapeTableCell(prd.seoStrategy.indexingStrategy)} |`);
    }
    if (prd.seoStrategy.openGraph) {
      if (prd.seoStrategy.openGraph.title) {
        seoLines.push(`| **OpenGraph Title** | ${escapeTableCell(prd.seoStrategy.openGraph.title)} |`);
      }
      if (prd.seoStrategy.openGraph.description) {
        seoLines.push(`| **OpenGraph Description** | ${escapeTableCell(prd.seoStrategy.openGraph.description)} |`);
      }
      if (prd.seoStrategy.openGraph.image) {
        seoLines.push(`| **OpenGraph Image** | ${escapeTableCell(prd.seoStrategy.openGraph.image)} |`);
      }
    }
    sections.push(seoLines.join("\n"));
  }

  // 15. Metrik Keberhasilan
  if (prd.successMetrics && prd.successMetrics.length > 0) {
    const metricLines: string[] = [`## 15. Metrik Keberhasilan (Success Metrics)`];
    metricLines.push(`| No | Metrik (KPI) | Target | Metode Pengukuran |`);
    metricLines.push(`|:---:|:---|:---|:---|`);
    prd.successMetrics.forEach((sm, idx) => {
      metricLines.push(`| ${idx + 1} | ${escapeTableCell(sm.metric)} | ${escapeTableCell(sm.target)} | ${escapeTableCell(sm.measurementMethod || "-")} |`);
    });
    sections.push(metricLines.join("\n"));
  }

  return sections.join("\n\n");
}
