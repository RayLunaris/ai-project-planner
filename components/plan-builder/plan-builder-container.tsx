"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChatPanel, ClarificationItem } from "./chat-panel";
import { PrdPreview } from "./prd-preview";
import { ModelSelector } from "./model-selector";
import { FeatureList } from "./feature-list";

interface VersionItem {
  id: string;
  versionNumber: number;
  contentMarkdown: string;
  changeSummary?: string | null;
  createdAt?: Date | string | null;
}

interface PlanBuilderContainerProps {
  projectId: string;
  projectName: string;
  planId: string;
  initialStatus: "draft" | "clarifying" | "generated" | "finalized";
  initialIdea: string;
  initialAnswers: ClarificationItem[];
  initialVersion: VersionItem | null;
  initialSelectedProvider?: string | null;
  initialSelectedModel?: string | null;
}

export function PlanBuilderContainer({
  projectId,
  projectName,
  planId,
  initialStatus,
  initialIdea,
  initialAnswers,
  initialVersion,
  initialSelectedProvider,
  initialSelectedModel,
}: PlanBuilderContainerProps) {
  const [status, setStatus] = useState(initialStatus);
  const [currentVersion, setCurrentVersion] = useState<VersionItem | null>(initialVersion);
  const [viewedVersion, setViewedVersion] = useState<VersionItem | null>(initialVersion);
  const [streamedText, setStreamedText] = useState("");
  const [isStreamingPrd, setIsStreamingPrd] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"prd" | "features">("prd");

  function handleStreamingChunk(chunk: string) {
    setIsStreamingPrd(true);
    setStreamedText((prev) => prev + chunk);
  }

  function handlePrdGenerated(versionData: {
    versionId: string;
    versionNumber: number;
    markdown: string;
    json: unknown;
  }) {
    setIsStreamingPrd(false);
    setStreamedText("");
    const newVer: VersionItem = {
      id: versionData.versionId,
      versionNumber: versionData.versionNumber,
      contentMarkdown: versionData.markdown,
    };
    setCurrentVersion(newVer);
    setViewedVersion(newVer);
    setStatus("generated");
  }

  function handleSelectVersion(ver: VersionItem) {
    setViewedVersion(ver);
  }

  function handleVersionRestored(ver: VersionItem) {
    setCurrentVersion(ver);
    setViewedVersion(ver);
    setStatus("generated");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="h-14 px-4 sm:px-6 border-b border-border/40 bg-background/95 backdrop-blur flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{projectName}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-foreground">Plan Builder</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ModelSelector
            planId={planId}
            initialProvider={initialSelectedProvider}
            initialModel={initialSelectedModel}
          />
          <div className="h-4 w-px bg-border/60 hidden md:block" />
          <Badge variant="outline" className="capitalize text-xs hidden sm:inline-flex">
            Status: {status}
          </Badge>
          {currentVersion && (
            <Badge variant="secondary" className="text-xs font-mono">
              v{currentVersion.versionNumber}
            </Badge>
          )}
        </div>
      </div>

      {/* Split View Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
        {/* Left Column: Chat Panel */}
        <div className="lg:col-span-5 h-full overflow-hidden">
          <ChatPanel
            planId={planId}
            initialIdea={initialIdea}
            initialAnswers={initialAnswers}
            status={status}
            onStreamingPrdChunk={handleStreamingChunk}
            onPrdGenerated={handlePrdGenerated}
            onStatusChange={setStatus}
          />
        </div>

        {/* Right Column: PRD Preview Panel or Feature List */}
        <div className="lg:col-span-7 h-full flex flex-col min-h-0 overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 mb-2.5 shrink-0 bg-muted/40 p-1 rounded-lg border border-border/40 w-fit">
            <button
              type="button"
              onClick={() => setActiveRightTab("prd")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeRightTab === "prd"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Dokumen PRD
            </button>
            <button
              type="button"
              onClick={() => setActiveRightTab("features")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeRightTab === "features"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Features
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeRightTab === "prd" ? (
              <PrdPreview
                planId={planId}
                markdown={viewedVersion?.contentMarkdown || currentVersion?.contentMarkdown || null}
                streamingText={streamedText}
                isStreaming={isStreamingPrd}
                versionNumber={viewedVersion?.versionNumber || currentVersion?.versionNumber}
                currentVersionId={currentVersion?.id || null}
                activeVersionId={viewedVersion?.id || currentVersion?.id || null}
                onSelectVersion={handleSelectVersion}
                onVersionRestored={handleVersionRestored}
              />
            ) : (
              <FeatureList
                planId={planId}
                hasPrd={Boolean(currentVersion)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
