"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Sparkles,
  Loader2,
  Bot,
  User,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export interface ClarificationItem {
  id?: string;
  question: string;
  answer: string;
  order: number;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  isStreaming?: boolean;
}

interface ChatPanelProps {
  planId: string;
  initialIdea: string;
  initialAnswers: ClarificationItem[];
  status: "draft" | "clarifying" | "generated" | "finalized";
  onStreamingPrdChunk?: (chunk: string) => void;
  onPrdGenerated?: (versionData: {
    versionId: string;
    versionNumber: number;
    markdown: string;
    json: unknown;
  }) => void;
  onStatusChange?: (newStatus: "draft" | "clarifying" | "generated" | "finalized") => void;
}

export function ChatPanel({
  planId,
  initialIdea,
  initialAnswers,
  status: initialStatus,
  onStreamingPrdChunk,
  onPrdGenerated,
  onStatusChange,
}: ChatPanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const list: ChatMessage[] = [];

    // First message: Initial Idea summary
    list.push({
      id: "init-idea",
      role: "system",
      content: initialIdea,
    });

    // Populate existing Q&A
    initialAnswers.forEach((qa, idx) => {
      list.push({
        id: `q-${idx}`,
        role: "assistant",
        content: qa.question,
      });
      list.push({
        id: `a-${idx}`,
        role: "user",
        content: qa.answer,
      });
    });

    return list;
  });

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, isGenerating]);

  const hasTriggeredRef = useRef(false);

  const triggerInitialClarification = React.useCallback(async () => {
    setIsStreaming(true);
    setError(null);

    const botMessageId = "stream-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: botMessageId, role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      const res = await fetch(`/api/plans/${planId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error("Gagal memulai sesi klarifikasi");
      }

      if (!res.body) throw new Error("Body response kosong");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, content: streamedText }
              : msg
          )
        );
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );

      if (streamedText.includes("[READY_TO_GENERATE]")) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan streaming");
    } finally {
      setIsStreaming(false);
    }
  }, [planId]);

  // If there are no answers yet, trigger initial clarification question from AI
  useEffect(() => {
    if (
      !hasTriggeredRef.current &&
      status === "clarifying" &&
      initialAnswers.length === 0
    ) {
      hasTriggeredRef.current = true;
      triggerInitialClarification();
    }
  }, [status, initialAnswers.length, triggerInitialClarification]);

  async function handleSendAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming || isGenerating) return;

    const userText = input.trim();
    setInput("");
    setError(null);

    // Find the latest question asked by the assistant
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const questionText = lastAssistantMessage?.content || "Klarifikasi Ide";

    // Add user message to state
    const userMessageId = "user-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: userText },
    ]);

    // Add placeholder for streaming assistant response
    const botMessageId = "stream-" + Date.now();
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: botMessageId, role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      // If PRD is already generated, send revision request if in revision mode
      if (status === "generated" || status === "finalized") {
        const res = await fetch(`/api/plans/${planId}/revise`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionInstruction: userText }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal memproses revisi");
        }

        const data = await res.json();
        const summaryText = data.changeSummary ? `\n\n📌 **Ringkasan Perubahan:**\n${data.changeSummary}` : "";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? {
                  ...msg,
                  content: `✅ Revisi berhasil diterapkan sebagai Versi ${data.versionNumber}.${summaryText}`,
                  isStreaming: false,
                }
              : msg
          )
        );

        if (onPrdGenerated) {
          onPrdGenerated({
            versionId: data.versionId,
            versionNumber: data.versionNumber,
            markdown: data.markdown,
            json: data.json,
          });
        }
        return;
      }

      // Clarification mode
      const res = await fetch(`/api/plans/${planId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionText, answer: userText }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengirim jawaban klarifikasi");
      }

      if (!res.body) throw new Error("Body response kosong");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, content: streamedText }
              : msg
          )
        );
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );

      if (streamedText.includes("[READY_TO_GENERATE]")) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan pengiriman");
      setMessages((prev) => prev.filter((m) => m.id !== botMessageId));
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleGeneratePrd() {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/plans/${planId}/generate`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Gagal memulai proses pembuatan PRD");
      }

      if (!res.body) throw new Error("Stream response kosong");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          try {
            const data = JSON.parse(dataStr);

            if (data.type === "chunk" && data.text) {
              if (onStreamingPrdChunk) {
                onStreamingPrdChunk(data.text);
              }
            } else if (data.type === "complete") {
              setStatus("generated");
              if (onStatusChange) onStatusChange("generated");
              if (onPrdGenerated) {
                onPrdGenerated({
                  versionId: data.versionId,
                  versionNumber: data.versionNumber,
                  markdown: data.markdown,
                  json: data.json,
                });
              }

              setMessages((prev) => [
                ...prev,
                {
                  id: "gen-success-" + Date.now(),
                  role: "assistant",
                  content: `🎉 PRD Versi ${data.versionNumber} telah berhasil dibuat! Anda dapat melihat hasilnya pada panel preview di sebelah kanan atau mengajukan revisi melalui chat ini.`,
                },
              ]);
            } else if (data.type === "error") {
              setError(data.error || "Gagal menghasilkan PRD");
            }
          } catch {
            // Ignore non-JSON SSE frames
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat PRD");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/60 rounded-xl border border-border/60 overflow-hidden shadow-sm">
      {/* Panel Header */}
      <div className="px-4 py-3.5 border-b border-border/40 bg-muted/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm sm:text-base">
            {status === "clarifying" ? "Klarifikasi Ide" : "Revisi & Asisten PRD"}
          </h2>
        </div>
        <Badge
          variant={status === "clarifying" ? "secondary" : "default"}
          className="text-xs capitalize font-medium"
        >
          {status}
        </Badge>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {messages.map((msg) => {
          if (msg.role === "system") {
            return (
              <Card key={msg.id} className="p-3.5 bg-primary/5 border-primary/20 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
                  <Lightbulb className="h-4 w-4" />
                  <span>Ide Awal Aplikasi</span>
                </div>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </Card>
            );
          }

          const isBot = msg.role === "assistant";

          // Filter out the [READY_TO_GENERATE] tag for clean display
          const displayContent = msg.content.replace(/\[READY_TO_GENERATE\]/g, "").trim();

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isBot ? "items-start" : "items-start flex-row-reverse"}`}
            >
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                  isBot
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-muted text-foreground border border-border"
                }`}
              >
                {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] leading-relaxed ${
                  isBot
                    ? "bg-muted/70 text-foreground rounded-tl-sm border border-border/40"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">
                  {displayContent || (msg.isStreaming && <span className="animate-pulse">Sedang berpikir...</span>)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Ready to generate PRD Banner */}
        {(readyToGenerate || status === "clarifying") && !isGenerating && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 my-2">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {readyToGenerate
                  ? "Informasi klarifikasi sudah cukup! Siap generate PRD?"
                  : "Sudah cukup menjawab? Anda bisa langsung generate PRD kapan saja."}
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleGeneratePrd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate PRD</span>
            </Button>
          </div>
        )}

        {isGenerating && (
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center space-y-2 animate-pulse my-2">
            <div className="flex items-center justify-center gap-2 text-primary font-medium text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI sedang menyusun PRD terstruktur...</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Teks dokumen muncul bertahap pada panel preview di sebelah kanan.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendAnswer} className="p-3 border-t border-border/40 bg-background/50">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              status === "clarifying"
                ? "Ketik jawaban klarifikasi Anda..."
                : "Ketik instruksi revisi PRD..."
            }
            className="min-h-[44px] max-h-32 text-sm resize-none rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendAnswer(e);
              }
            }}
            disabled={isStreaming || isGenerating}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming || isGenerating}
            className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
