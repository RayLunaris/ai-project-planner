"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  ChevronUp,
  ChevronDown,
  Edit2,
  Trash2,
  Check,
  X,
  Plus,
  AlertCircle,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskBoard } from "./task-board";

export interface FeatureItem {
  id: string;
  planVersionId: string;
  name: string;
  description: string | null;
  priority: "must-have" | "nice-to-have";
  order: number;
  createdAt?: string | null;
}

interface FeatureListProps {
  planId: string;
  hasPrd: boolean;
  onSelectFeature?: (feature: FeatureItem) => void;
  selectedFeatureId?: string | null;
}

export function FeatureList({
  planId,
  hasPrd,
  onSelectFeature,
  selectedFeatureId,
}: FeatureListProps) {
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"must-have" | "nice-to-have">("must-have");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Checkbox selection state (for visual selection/tracking)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [activeFeature, setActiveFeature] = useState<FeatureItem | null>(null);

  // Fetch features on mount
  useEffect(() => {
    fetchFeatures();
  }, [planId]);

  async function fetchFeatures() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/features`);
      const data = await res.json();
      if (res.ok && data.features) {
        setFeatures(data.features);
      } else {
        setError(data.error || "Gagal memuat fitur");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan saat memuat fitur");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerateFeatures() {
    if (!hasPrd) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/features/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.features) {
        setFeatures(data.features);
        setEditingId(null);
      } else {
        setError(data.error || "Gagal membedah fitur dari PRD");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan saat membedah fitur");
    } finally {
      setIsGenerating(false);
    }
  }

  function startEditing(feature: FeatureItem) {
    setEditingId(feature.id);
    setEditName(feature.name);
    setEditDescription(feature.description || "");
    setEditPriority(feature.priority);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  async function saveEditing(featureId: string) {
    if (!editName.trim()) return;
    setIsSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/features/${featureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          priority: editPriority,
        }),
      });
      const data = await res.json();
      if (res.ok && data.feature) {
        setFeatures((prev) =>
          prev.map((f) => (f.id === featureId ? { ...f, ...data.feature } : f))
        );
        setEditingId(null);
      } else {
        setError(data.error || "Gagal memperbarui fitur");
      }
    } catch (err) {
      setError("Gagal menghubungi server untuk update fitur");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteFeature(featureId: string) {
    if (!confirm("Hapus fitur ini beserta task dan dependency terkait?")) return;
    try {
      const res = await fetch(`/api/features/${featureId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFeatures((prev) => prev.filter((f) => f.id !== featureId));
        if (selectedFeatureId === featureId && onSelectFeature) {
          onSelectFeature(null as any);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Gagal menghapus fitur");
      }
    } catch (err) {
      setError("Gagal menghubungi server saat menghapus fitur");
    }
  }

  async function moveOrder(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= features.length) return;

    const currentItem = features[index];
    const targetItem = features[targetIndex];

    const currentOrder = currentItem.order;
    const targetOrder = targetItem.order;

    // Update state secara optimistik
    const newFeatures = [...features];
    newFeatures[index] = { ...currentItem, order: targetOrder };
    newFeatures[targetIndex] = { ...targetItem, order: currentOrder };
    newFeatures.sort((a, b) => a.order - b.order);
    setFeatures(newFeatures);

    // Kirim patch ke backend
    try {
      await Promise.all([
        fetch(`/api/features/${currentItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: targetOrder }),
        }),
        fetch(`/api/features/${targetItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: currentOrder }),
        }),
      ]);
    } catch (err) {
      console.error("Gagal menyimpan urutan baru:", err);
      // Rollback jika gagal
      fetchFeatures();
    }
  }

  function toggleCheckbox(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (activeFeature) {
    return (
      <TaskBoard
        feature={activeFeature}
        onBack={() => setActiveFeature(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-card/40 border border-border/40 rounded-xl overflow-hidden shadow-xs">
      {/* Header bar */}
      <div className="p-3.5 px-4 border-b border-border/40 flex items-center justify-between bg-card/60">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Features</h3>
          <Badge variant="outline" className="text-xs font-mono ml-1">
            {features.length}
          </Badge>
        </div>

        <Button
          size="sm"
          onClick={handleGenerateFeatures}
          disabled={!hasPrd || isGenerating}
          className="gap-1.5 h-8 text-xs font-medium"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Membedah Fitur...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {features.length > 0 ? "Regenerate Features" : "Generate Features"}
            </>
          )}
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-2.5 px-4 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-75">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Content list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Memuat daftar fitur...</p>
          </div>
        ) : !hasPrd ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              PRD Belum Siap
            </p>
            <p className="text-xs text-muted-foreground/75 mt-1 max-w-sm">
              Selesaikan sesi klarifikasi di panel kiri dan generate PRD terlebih
              dahulu sebelum membedah daftar fitur.
            </p>
          </div>
        ) : features.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Sparkles className="h-8 w-8 text-primary/40 mb-2" />
            <p className="text-sm font-medium text-foreground">
              Belum Ada Fitur
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3 max-w-sm">
              Klik tombol di bawah untuk meminta AI membedah core features dari
              PRD menjadi daftar fitur terstruktur.
            </p>
            <Button
              size="sm"
              onClick={handleGenerateFeatures}
              disabled={isGenerating}
              className="gap-1.5 text-xs"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Generate Features dari PRD
            </Button>
          </div>
        ) : (
          features.map((feature, index) => {
            const isEditing = editingId === feature.id;
            const isSelected = selectedFeatureId === feature.id;
            const isChecked = checkedIds.has(feature.id);

            if (isEditing) {
              return (
                <div
                  key={feature.id}
                  className="p-3 bg-card border border-primary/40 rounded-lg space-y-2.5 shadow-xs"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Nama Fitur
                    </label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-xs"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Deskripsi
                    </label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Prioritas:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPriority((p) =>
                            p === "must-have" ? "nice-to-have" : "must-have"
                          )
                        }
                        className="cursor-pointer"
                      >
                        <span className="text-xs tracking-wide uppercase text-gray-500 font-mono">
                          {editPriority === "must-have" ? "MUST-HAVE" : "NICE-TO-HAVE"}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditing}
                        disabled={isSavingEdit}
                        className="h-7 px-2 text-xs"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Batal
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEditing(feature.id)}
                        disabled={isSavingEdit || !editName.trim()}
                        className="h-7 px-2.5 text-xs gap-1"
                      >
                        {isSavingEdit ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Simpan
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={feature.id}
                onClick={() => {
                  setActiveFeature(feature);
                  onSelectFeature?.(feature);
                }}
                className={`group p-3 bg-card border rounded-lg transition flex items-start justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border/40 hover:border-border/80 hover:bg-card/80"
                }`}
              >
                {/* Left: Checkbox & Name/Description */}
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleCheckbox(feature.id);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                  />

                  <div className="space-y-0.5 flex-1 min-w-0">
<div className="flex items-center gap-2 flex-wrap">
                       <span
                         className={`text-xs font-semibold truncate ${
                           isChecked
                             ? "line-through text-muted-foreground"
                             : "text-foreground"
                         }`}
                       >
                         {feature.name}
                       </span>
                       <span className="text-xs tracking-wide uppercase text-gray-500 font-mono shrink-0">
                         {feature.priority === "must-have" ? "MUST-HAVE" : "NICE-TO-HAVE"}
                       </span>
                     </div>

                    {feature.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {feature.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions (Tasks, Reorder Up/Down, Edit, Delete) */}
                <div
                  className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveFeature(feature);
                      onSelectFeature?.(feature);
                    }}
                    className="h-6 px-2 text-[10px] gap-1 font-medium bg-muted/40 hover:bg-muted"
                  >
                    Tasks &rarr;
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveOrder(index, "up")}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Naikkan urutan"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === features.length - 1}
                    onClick={() => moveOrder(index, "down")}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Turunkan urutan"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEditing(feature)}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Edit fitur"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteFeature(feature.id)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Hapus fitur"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
