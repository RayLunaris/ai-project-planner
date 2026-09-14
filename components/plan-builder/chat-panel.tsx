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
  options?: Array<{ id: string; label: string }> | null;
  selectedOptionId?: string | null;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-idea",
      role: "system",
      content: initialIdea,
    },
  ]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState<string | null>(null);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, isGenerating, isLoadingHistory]);

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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal memulai sesi klarifikasi");
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

      let finalContent = streamedText;
      let finalOptions: Array<{ id: string; label: string }> | null = null;
      try {
        const parsed = JSON.parse(streamedText);
        if (parsed.question) {
          finalContent = parsed.question;
          if (Array.isArray(parsed.options)) {
            finalOptions = parsed.options;
          }
        }
      } catch {
        // Plain text fallback
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, content: finalContent, options: finalOptions, isStreaming: false }
            : msg
        )
      );

      if (finalContent.includes("[READY_TO_GENERATE]")) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan streaming");
    } finally {
      setIsStreaming(false);
    }
  }, [planId]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const initialAnswersRef = useRef(initialAnswers);
  initialAnswersRef.current = initialAnswers;

  const initialIdeaRef = useRef(initialIdea);
  initialIdeaRef.current = initialIdea;

  // Fetch message history on mount
  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`/api/plans/${planId}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const baseList: ChatMessage[] = initialIdeaRef.current?.trim()
              ? [
                  {
                    id: "init-idea",
                    role: "system",
                    content: initialIdeaRef.current,
                  },
                ]
              : [];

            if (Array.isArray(data) && data.length > 0) {
              const fetched: ChatMessage[] = data.map((m: {
                id: string;
                role: "assistant" | "user";
                content: string;
                options?: Array<{ id: string; label: string }> | null;
                selectedOptionId?: string | null;
              }) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                options: m.options,
                selectedOptionId: m.selectedOptionId,
              }));
              setMessages([...baseList, ...fetched]);

              if (fetched.some((m) => m.content?.includes("[READY_TO_GENERATE]"))) {
                setReadyToGenerate(true);
              }
            } else if (initialAnswersRef.current && initialAnswersRef.current.length > 0) {
              const fallback: ChatMessage[] = [];
              initialAnswersRef.current.forEach((qa, idx) => {
                fallback.push({
                  id: `q-${idx}`,
                  role: "assistant",
                  content: qa.question,
                });
                fallback.push({
                  id: `a-${idx}`,
                  role: "user",
                  content: qa.answer,
                });
              });
              setMessages([...baseList, ...fallback]);
            } else {
              setMessages(baseList);
              if (statusRef.current === "clarifying" && !hasTriggeredRef.current) {
                hasTriggeredRef.current = true;
                triggerInitialClarification();
              }
            }
          }
        } else {
          if (
            isMounted &&
            statusRef.current === "clarifying" &&
            (!initialAnswersRef.current || initialAnswersRef.current.length === 0) &&
            !hasTriggeredRef.current
          ) {
            hasTriggeredRef.current = true;
            triggerInitialClarification();
          }
        }
      } catch (err) {
        console.error("Failed to load message history:", err);
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [planId, triggerInitialClarification]);

  // Helper to determine if an assistant question message has been answered
  function getAnswerForMessage(
    msg: ChatMessage,
    index: number,
    allMessages: ChatMessage[]
  ) {
    if (msg.role !== "assistant" || !msg.options || msg.options.length === 0) {
      return null;
    }

    // Look ahead for an answering user message following this assistant message
    for (let j = index + 1; j < allMessages.length; j++) {
      const nextMsg = allMessages[j];
      if (nextMsg.role === "assistant") {
        break;
      }
      if (nextMsg.role === "user") {
        return {
          selectedOptionId: nextMsg.selectedOptionId || null,
          content: nextMsg.content,
        };
      }
    }

    // If there is another assistant message later in the conversation,
    // this question was already answered / superseded
    const hasSubsequentAssistant = allMessages
      .slice(index + 1)
      .some((m) => m.role === "assistant");
    if (hasSubsequentAssistant) {
      return {
        selectedOptionId: null,
        content: "Sudah terjawab",
      };
    }

    return null;
  }

  // Handle user clicking an option button in clarification mode
  async function handleSelectOption(
    questionMessage: ChatMessage,
    option: { id: string; label: string }
  ) {
    if (isStreaming || isGenerating) return;

    setError(null);

    const questionText =
      questionMessage.content.replace(/\[READY_TO_GENERATE\]/g, "").trim() ||
      "Klarifikasi Ide";

    // If this option is confirming PRD generation (e.g. id === "generate")
    if (option.id === "generate") {
      const userMessageId = "user-" + Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          content: option.label,
          selectedOptionId: option.id,
        },
      ]);

      try {
        await fetch(`/api/plans/${planId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "user",
            content: option.label,
            selectedOptionId: option.id,
            selectedOptionLabel: option.label,
          }),
        });
      } catch (err) {
        console.error("Failed to record generation choice message:", err);
      }

      handleGeneratePrd();
      return;
    }

    const userMessageId = "user-" + Date.now();
    const botMessageId = "stream-" + Date.now();

    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user",
        content: option.label,
        selectedOptionId: option.id,
      },
      {
        id: botMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      },
    ]);

    try {
      const res = await fetch(`/api/plans/${planId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          answer: option.label,
          selectedOptionId: option.id,
          selectedOptionLabel: option.label,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal mengirim jawaban klarifikasi");
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

      let finalContent = streamedText;
      let finalOptions: Array<{ id: string; label: string }> | null = null;
      try {
        const parsed = JSON.parse(streamedText);
        if (parsed.question) {
          finalContent = parsed.question;
          if (Array.isArray(parsed.options)) {
            finalOptions = parsed.options;
          }
        }
      } catch {
        // Plain text fallback
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, content: finalContent, options: finalOptions, isStreaming: false }
            : msg
        )
      );

      if (finalContent.includes("[READY_TO_GENERATE]")) {
        setReadyToGenerate(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan pengiriman");
      // Rollback optimistic messages on error so user can re-try
      setMessages((prev) =>
        prev.filter((m) => m.id !== botMessageId && m.id !== userMessageId)
      );
    } finally {
      setIsStreaming(false);
    }
  }

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
          const message = errData.details
            ? `${errData.error || "Gagal memproses pesan"}: ${errData.details}`
            : errData.error || "Gagal memproses pesan";
          throw new Error(message);
        }

        const data = await res.json();

        if (data.isRevision) {
          const replyHeader = data.reply ? `${data.reply}\n\n` : "";
          const summaryText = data.changeSummary
            ? `📌 **Ringkasan Perubahan (Versi ${data.versionNumber}):**\n${data.changeSummary}`
            : `✅ Revisi berhasil diterapkan sebagai Versi ${data.versionNumber}.`;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    content: `${replyHeader}${summaryText}`,
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
        } else {
          // Conversational chat / question / praise
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    content: data.reply || "Pesan Anda telah diterima.",
                    isStreaming: false,
                  }
                : msg
            )
          );
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal mengirim jawaban klarifikasi");
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

      let finalContent = streamedText;
      let finalOptions: Array<{ id: string; label: string }> | null = null;
      try {
        const parsed = JSON.parse(streamedText);
        if (parsed.question) {
          finalContent = parsed.question;
          if (Array.isArray(parsed.options)) {
            finalOptions = parsed.options;
          }
        }
      } catch {
        // Plain text fallback
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, content: finalContent, options: finalOptions, isStreaming: false }
            : msg
        )
      );

      if (finalContent.includes("[READY_TO_GENERATE]")) {
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
    setGeneratingStatus(null);
    setError(null);

    try {
      const res = await fetch(`/api/plans/${planId}/generate`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal memulai proses pembuatan PRD");
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
            } else if (data.type === "status" && data.message) {
              setGeneratingStatus(data.message);
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
              const fullError = data.details
                ? `${data.error} (${data.details})`
                : (data.error || "Gagal menghasilkan PRD");
              setError(fullError);
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
      setGeneratingStatus(null);
    }
  }

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const latestMessageIndex = latestAssistantMessage
    ? messages.lastIndexOf(latestAssistantMessage)
    : -1;
  const latestAssistantAnswer =
    latestAssistantMessage && latestMessageIndex !== -1
      ? getAnswerForMessage(latestAssistantMessage, latestMessageIndex, messages)
      : null;

  const hasActiveOptions =
    status === "clarifying" &&
    Boolean(
      latestAssistantMessage &&
      !latestAssistantAnswer &&
      latestAssistantMessage.options &&
      latestAssistantMessage.options.length > 0
    );

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
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-muted-foreground gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs font-medium">Memuat riwayat percakapan...</span>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
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

              // Check if this assistant question has already been answered
              const answer = isBot ? getAnswerForMessage(msg, index, messages) : null;
              const isQuestionActive =
                isBot &&
                status === "clarifying" &&
                !answer &&
                !msg.isStreaming &&
                index === latestMessageIndex;

              const selectedOption = answer && msg.options
                ? (answer.selectedOptionId
                    ? msg.options.find((o) => o.id === answer.selectedOptionId)
                    : msg.options.find(
                        (o) =>
                          o.label.toLowerCase() === answer.content.toLowerCase() ||
                          o.id.toLowerCase() === answer.content.toLowerCase()
                      ))
                : null;
              const selectedLabel = selectedOption?.label || answer?.content || "";

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

                  <div className="flex flex-col gap-2 max-w-[85%] sm:max-w-[80%]">
                    <div
                      className={`rounded-2xl px-4 py-2.5 leading-relaxed ${
                        isBot
                          ? "bg-muted/70 text-foreground rounded-tl-sm border border-border/40"
                          : "bg-primary text-primary-foreground rounded-tr-sm"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">
                        {displayContent || (msg.isStreaming && <span className="animate-pulse">Sedang berpikir...</span>)}
                      </div>
                    </div>

                    {/* Options / Answered State for Assistant Message */}
                    {isBot && !msg.isStreaming && msg.options && msg.options.length > 0 && (
                      <div className="w-full">
                        {answer ? (
                          // Kondisi sudah terjawab (riwayat lama atau yang baru saja dijawab)
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 border border-border/40">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-medium text-foreground/80">
                              Pilihan terjawab:{" "}
                              <span className="text-primary font-semibold">
                                {selectedLabel}
                              </span>
                            </span>
                          </div>
                        ) : isQuestionActive ? (
                          // Kondisi aktif: Tampilkan tombol-tombol pilihan
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              <Sparkles className="h-3 w-3 text-primary shrink-0" />
                              <span>Pilih salah satu jawaban:</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              {msg.options.map((opt) => (
                                <Button
                                  key={opt.id}
                                  variant="outline"
                                  size="sm"
                                  disabled={isStreaming || isGenerating}
                                  onClick={() => handleSelectOption(msg, opt)}
                                  className="w-full justify-start text-left h-auto py-2.5 px-3.5 rounded-xl border-border/80 hover:border-primary/60 hover:bg-primary/5 hover:text-primary transition-all text-xs font-medium leading-relaxed group shadow-xs whitespace-normal bg-card/80"
                                >
                                  <div className="flex items-center gap-2.5 w-full">
                                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                      {opt.id.length <= 2 ? opt.id.toUpperCase() : "•"}
                                    </span>
                                    <span className="flex-1 text-foreground/90 group-hover:text-primary">
                                      {opt.label}
                                    </span>
                                  </div>
                                </Button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
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
                  <span>{generatingStatus || "AI sedang menyusun PRD terstruktur..."}</span>
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
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {hasActiveOptions ? (
        <div className="p-3.5 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span>
              {isStreaming
                ? "AI sedang menyiapkan pertanyaan klarifikasi berikutnya..."
                : "Silakan pilih salah satu tombol opsi di atas untuk menjawab."}
            </span>
          </div>
          {readyToGenerate && (
            <Button
              size="sm"
              onClick={handleGeneratePrd}
              disabled={isGenerating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs shadow-xs shrink-0"
            >
              <Sparkles className="h-3 w-3" />
              <span>Generate PRD</span>
            </Button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSendAnswer} className="p-3 border-t border-border/40 bg-background/50">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isLoadingHistory
                  ? "Memuat riwayat chat..."
                  : status === "clarifying"
                  ? "Ketik jawaban klarifikasi Anda..."
                  : "Tanyakan sesuatu atau ketik instruksi revisi PRD..."
              }
              className="min-h-[44px] max-h-32 text-sm resize-none rounded-xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendAnswer(e);
                }
              }}
              disabled={isLoadingHistory || isStreaming || isGenerating}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoadingHistory || !input.trim() || isStreaming || isGenerating}
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
      )}
    </div>
  );
}
