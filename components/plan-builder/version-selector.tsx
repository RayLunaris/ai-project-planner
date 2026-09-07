"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { History, ChevronDown, Check, RotateCcw, Loader2 } from "lucide-react";

export interface PlanVersion {
  id: string;
  versionNumber: number;
  contentMarkdown: string;
  changeSummary?: string | null;
  createdAt?: Date | string | null;
}

interface VersionSelectorProps {
  planId: string;
  currentVersionId: string | null;
  activeVersionId: string | null;
  onSelectVersion: (version: PlanVersion) => void;
  onVersionRestored: (version: PlanVersion) => void;
}

export function VersionSelector({
  planId,
  currentVersionId,
  activeVersionId,
  onSelectVersion,
  onVersionRestored,
}: VersionSelectorProps) {
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/plans/${planId}/versions`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (err) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions, currentVersionId]);

  async function handleRestore() {
    if (!activeVersionId || activeVersionId === currentVersionId || restoring) return;

    try {
      setRestoring(true);
      const res = await fetch(
        `/api/plans/${planId}/versions/${activeVersionId}/restore`,
        { method: "POST" }
      );

      if (!res.ok) throw new Error("Gagal me-restore versi");

      const data = await res.json();
      if (data.restoredVersion) {
        onVersionRestored(data.restoredVersion);
        fetchVersions();
      }
    } catch (err) {
      console.error("Error restoring version:", err);
    } finally {
      setRestoring(false);
    }
  }

  if (versions.length === 0 && !loading) {
    return null;
  }

  const activeVersion =
    versions.find((v) => v.id === activeVersionId) ||
    versions.find((v) => v.id === currentVersionId) ||
    versions[0];

  const isViewingOlderVersion =
    activeVersion && currentVersionId && activeVersion.id !== currentVersionId;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1.5 h-8 text-xs font-medium border border-border/60 rounded-md px-2.5 bg-background hover:bg-muted text-foreground transition cursor-pointer shadow-xs"
          disabled={loading}
        >
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {activeVersion ? `Version: v${activeVersion.versionNumber}` : "Pilih Versi"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            Riwayat Versi PRD
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {versions.map((ver) => {
            const isCurrent = ver.id === currentVersionId;
            const isSelected = ver.id === activeVersion?.id;
            const dateStr = ver.createdAt
              ? new Date(ver.createdAt).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <DropdownMenuItem
                key={ver.id}
                onClick={() => onSelectVersion(ver)}
                className="flex items-center justify-between text-xs py-2 cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <div className="w-3.5" />
                  )}
                  <div className="truncate">
                    <span className="font-semibold">v{ver.versionNumber}</span>
                    <span className="text-muted-foreground text-[11px] ml-1.5">
                      {dateStr}
                    </span>
                    {ver.changeSummary && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                        {ver.changeSummary}
                      </p>
                    )}
                  </div>
                </div>

                {isCurrent && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                    Current
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Restore Button when viewing non-current version */}
      {isViewingOlderVersion && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestore}
          disabled={restoring}
          className="h-8 text-xs gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
        >
          {restoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          <span>Restore</span>
        </Button>
      )}
    </div>
  );
}
