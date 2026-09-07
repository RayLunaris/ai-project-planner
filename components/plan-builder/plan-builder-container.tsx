"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChatPanel, ClarificationItem } from "./chat-panel";
import { PrdPreview } from "./prd-preview";

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
}

export function PlanBuilderContainer({
  projectId,
  projectName,
  planId,
  initialStatus,
  initialIdea,
  initialAnswers,
  initialVersion,
}: PlanBuilderContainerProps) {
  const [status, setStatus] = useState(initialStatus);
  const [currentVersion, setCurrentVersion] = useState<VersionItem | null>(initialVersion);
  const [viewedVersion, setViewedVersion] = useState<VersionItem | null>(initialVersion);
  const [streamedText, setStreamedText] = useState("");
  const [isStreamingPrd, setIsStreamingPrd] = useState(false);

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

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="capitalize text-xs">
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

        {/* Right Column: PRD Preview Panel */}
        <div className="lg:col-span-7 h-full overflow-hidden">
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
        </div>
      </div>
    </div>
  );
}
