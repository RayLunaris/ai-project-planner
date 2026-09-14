"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  FileCode,
  AlertCircle,
  X,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureItem } from "./feature-list";
import type { TaskStatus, TaskLayer } from "@/lib/db/schema";

export interface TaskItem {
  id: string;
  featureId: string;
  title: string;
  description: string;
  layer: TaskLayer;
  phase: number;
  order: number;
  status: TaskStatus;
  targetFile: string | null;
  dependencies?: string[];
  createdAt?: string | null;
  completedAt?: string | null;
}

interface TaskBoardProps {
  feature: FeatureItem;
  onBack: () => void;
}

const COLUMNS: {
  key: TaskStatus;
  label: string;
}[] = [
  { key: "todo", label: "TODO" },
  { key: "doing", label: "DOING" },
  { key: "blocked", label: "BLOCKED" },
  { key: "done", label: "DONE" },
  { key: "failed", label: "FAILED" },
];

const LAYER_LABELS: Record<TaskLayer, string> = {
  database: "DATABASE",
  backend: "BACKEND",
  frontend: "FRONTEND",
  integration: "INTEGRATION",
  testing: "TESTING",
};

export function TaskBoard({ feature, onBack }: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);

  function formatTaskPrompt(task: TaskItem): string {
    const depsList =
      task.dependencies && task.dependencies.length > 0
        ? task.dependencies.map((d) => `- ${d}`).join("\n")
        : "- Tidak ada dependensi (siap dieksekusi langsung)";

    return `Kerjakan task berikut untuk fitur "${feature.name}":

**Title**: ${task.title}
**Layer**: ${task.layer} (Phase ${task.phase}, Urutan #${task.order})
**Target File**: \`${task.targetFile || "-"}\`
**Status**: ${task.status}

**Dependencies**:
${depsList}

**Deskripsi & Instruksi Pengerjaan**:
${task.description}

Setelah selesai, jalankan pemeriksaan/typecheck dan konfirmasi hasilnya.`;
  }

  function handleCopyPrompt(task: TaskItem) {
    const promptText = formatTaskPrompt(task);
    navigator.clipboard.writeText(promptText);
    setCopiedTaskId(task.id);
    setTimeout(() => {
      setCopiedTaskId((prev) => (prev === task.id ? null : prev));
    }, 2000);
  }

  useEffect(() => {
    fetchTasks();
  }, [feature.id]);

  async function fetchTasks() {
    setIsLoading(true);
    setErrorNotification(null);
    try {
      const res = await fetch(`/api/features/${feature.id}/tasks`);
      const data = await res.json();
      if (res.ok && data.tasks) {
        setTasks(data.tasks);
      } else {
        setErrorNotification(data.error || "Gagal memuat tasks");
      }
    } catch (err) {
      setErrorNotification("Terjadi kesalahan jaringan saat memuat tasks");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerateTasks() {
    setIsGenerating(true);
    setErrorNotification(null);
    try {
      const res = await fetch(`/api/features/${feature.id}/tasks/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.tasks) {
        setTasks(data.tasks);
      } else {
        setErrorNotification(data.error || "Gagal memecah tasks");
      }
    } catch (err) {
      setErrorNotification("Terjadi kesalahan jaringan saat generate tasks");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleStatusChange(taskId: string, targetStatus: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    setUpdatingTaskId(taskId);
    setErrorNotification(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();

      if (res.ok && data.task) {
        // Berhasil: pindahkan card ke kolom baru
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
        );
      } else {
        // Gagal: tampilkan error server (misal dependency belum selesai), card TETAP di kolom lama
        setErrorNotification(
          data.error || `Gagal mengubah status task ke '${targetStatus}'`
        );
      }
    } catch (err) {
      setErrorNotification("Terjadi kesalahan saat memperbarui status task");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/40 border border-border/40 rounded-xl overflow-hidden shadow-xs">
      {/* Header bar */}
      <div className="p-3.5 px-4 border-b border-border/40 flex items-center justify-between bg-card/60 shrink-0 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Features
          </Button>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2 truncate">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {feature.name}
            </h3>
            <span className="text-xs tracking-wide uppercase text-gray-500 font-mono shrink-0">
              {feature.priority === "must-have" ? "MUST-HAVE" : "NICE-TO-HAVE"}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleGenerateTasks}
          disabled={isGenerating}
          className="gap-1.5 h-8 text-xs font-medium shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 transition shadow-xs focus-visible:ring-indigo-500/50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Memecah Tasks...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {tasks.length > 0 ? "Regenerate Tasks" : "Breakdown to Tasks"}
            </>
          )}
        </Button>
      </div>

      {/* Error Notification Banner */}
      {errorNotification && (
        <div className="p-2.5 px-4 bg-destructive/10 border-b border-destructive/30 text-destructive text-xs flex items-start gap-2 animate-in fade-in duration-200 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed font-medium">
            {errorNotification}
          </span>
          <button
            onClick={() => setErrorNotification(null)}
            className="hover:opacity-75 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="flex-1 min-h-0 overflow-x-auto p-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Memuat tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-center p-6 border border-dashed border-border/60 rounded-xl m-2">
            <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-foreground">
              Belum Ada Tasks untuk Fitur Ini
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3 max-w-sm">
              Klik &quot;Breakdown to Tasks&quot; agar AI memecah fitur ini menjadi
              langkah-langkah teknis frontend-first dan backend dengan dependency.
            </p>
            <Button
              size="sm"
              onClick={handleGenerateTasks}
              disabled={isGenerating}
              className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 transition shadow-xs focus-visible:ring-indigo-500/50"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Breakdown to Tasks Sekarang
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 min-w-[820px] h-full">
            {COLUMNS.map((col) => {
              const columnTasks = tasks.filter((t) => t.status === col.key);
              const isDone = col.key === "done";

              return (
                <div
                  key={col.key}
                  className="flex flex-col rounded-lg border border-border/20 bg-muted/20 overflow-hidden shrink-0"
                  style={{
                    flexGrow: columnTasks.length > 0 ? Math.max(2, columnTasks.length) : 1,
                    flexBasis: 0,
                    minWidth: columnTasks.length > 0 ? 180 : 100,
                  }}
                >
                  {/* Column Header */}
                  <div className="p-2 px-3 border-b border-border/20 flex items-center justify-between bg-card/60">
                    <span
                      className={`text-xs font-medium tracking-wide ${
                        isDone
                          ? "text-muted-foreground/60"
                          : "text-foreground/80"
                      }`}
                    >
                      {col.label}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono h-4 px-1.5 border-border/30 text-muted-foreground font-medium"
                    >
                      {columnTasks.length}
                    </Badge>
                  </div>

                  {/* Tasks List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
                    {columnTasks.length === 0 ? (
                      <div className="h-16 flex items-center justify-center text-[10px] text-muted-foreground/30 italic">
                        Kosong
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const isUpdating = updatingTaskId === task.id;
                        return (
                          <div
                            key={task.id}
                            className={`p-3 bg-card border border-border/20 rounded-lg space-y-2 transition hover:border-border/40 ${
                              isDone ? "opacity-75 hover:opacity-100" : ""
                            } ${isUpdating ? "opacity-60 pointer-events-none" : ""} group`}
                          >
                            {/* Card Header: Title & Layer */}
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="text-xs font-medium text-foreground leading-snug">
                                  {task.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-xs tracking-wide uppercase text-gray-500 font-mono">
                                  {LAYER_LABELS[task.layer] || task.layer.toUpperCase()} &middot; P{task.phase}.{task.order}
                                </span>
                              </div>
                            </div>

                            {/* Target File */}
                            {task.targetFile && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 p-1 px-1.5 rounded font-mono truncate">
                                <FileCode className="h-3 w-3 shrink-0" />
                                <span className="truncate">{task.targetFile}</span>
                              </div>
                            )}

                            {/* Card Footer: Copy Prompt button (icon only, show on hover) */}
                            <div className="pt-1.5 border-t border-border/30 flex items-center justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleCopyPrompt(task)}
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Copy prompt siap-paste untuk AI coding agent"
                              >
                                {copiedTaskId === task.id ? (
                                  <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
