"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Copy,
  Check,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";

import { VersionSelector, PlanVersion } from "./version-selector";

interface PrdPreviewProps {
  planId: string;
  markdown: string | null;
  streamingText?: string;
  isStreaming?: boolean;
  versionNumber?: number | null;
  currentVersionId?: string | null;
  activeVersionId?: string | null;
  onSelectVersion?: (version: PlanVersion) => void;
  onVersionRestored?: (version: PlanVersion) => void;
  onExportClick?: () => void;
}

export function PrdPreview({
  planId,
  markdown,
  streamingText,
  isStreaming,
  versionNumber,
  currentVersionId,
  activeVersionId,
  onSelectVersion,
  onVersionRestored,
  onExportClick,
}: PrdPreviewProps) {
  const [copied, setCopied] = useState(false);

  const activeContent = isStreaming && streamingText ? streamingText : markdown;

  function handleCopy() {
    if (!activeContent) return;
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (onExportClick) {
      onExportClick();
      return;
    }
    const exportUrl = activeVersionId
      ? `/api/plans/${planId}/export?versionId=${activeVersionId}`
      : `/api/plans/${planId}/export`;
    window.location.href = exportUrl;
  }

  return (
    <div className="flex flex-col h-full bg-card/60 rounded-xl border border-border/60 overflow-hidden shadow-sm">
      {/* Preview Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm sm:text-base">PRD Preview</h2>
          {typeof versionNumber === "number" && (
            <Badge variant="secondary" className="text-xs font-mono">
              v{versionNumber}
            </Badge>
          )}
          {isStreaming && (
            <Badge variant="outline" className="text-xs text-primary gap-1 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Generating...</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentVersionId && onSelectVersion && onVersionRestored && (
            <VersionSelector
              planId={planId}
              currentVersionId={currentVersionId}
              activeVersionId={activeVersionId || currentVersionId}
              onSelectVersion={onSelectVersion}
              onVersionRestored={onVersionRestored}
            />
          )}

          {activeContent && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8 text-xs gap-1.5"
              >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Salin .md</span>
                </>
              )}
            </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                className="h-8 text-xs gap-1.5 shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export .md</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Markdown Content Area */}
      <div className="flex-1 overflow-y-auto p-6 text-sm">
        {isStreaming && streamingText ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-primary font-medium p-2.5 rounded-lg bg-primary/10 border border-primary/20 animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Streaming dokumen PRD dari model AI...</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-xl border border-border/40 leading-relaxed">
              {streamingText}
            </div>
          </div>
        ) : markdown ? (
          <article className="prose prose-sm dark:prose-invert max-w-none leading-relaxed prose-headings:font-bold prose-h1:text-xl prose-h1:border-b prose-h1:border-border/40 prose-h1:pb-2 prose-h2:text-lg prose-h2:mt-6 prose-h3:text-base prose-table:border prose-table:border-border/60 prose-th:bg-muted/50 prose-th:p-2.5 prose-td:p-2.5 prose-td:border-t prose-td:border-border/40 prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </article>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <div className="h-14 w-14 rounded-2xl bg-muted/80 flex items-center justify-center mb-3 shadow-inner">
              <Sparkles className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">PRD Belum Digenerate</h3>
            <p className="text-xs max-w-xs mt-1.5 leading-relaxed">
              Lengkapi pertanyaan klarifikasi dari AI pada panel kiri, lalu klik &ldquo;Generate PRD&rdquo; untuk merender dokumen spesifikasi di sini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
