"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cpu, Sparkles, Check, ChevronDown, Loader2, Search } from "lucide-react";

interface ModelOption {
  id: string;
  displayName: string;
}

interface ModelSelectorProps {
  planId: string;
  initialProvider?: string | null;
  initialModel?: string | null;
}

export function ModelSelector({
  planId,
  initialProvider,
  initialModel,
}: ModelSelectorProps) {
  const normalizedInitialModel =
    initialModel && initialModel.startsWith("gemini-2.")
      ? "gemini-3.5-flash"
      : initialModel;

  const [provider, setProvider] = useState<"openrouter" | "gemini">(
    initialProvider === "gemini" ? "gemini" : "openrouter"
  );
  const [model, setModel] = useState<string>(
    normalizedInitialModel ||
      (initialProvider === "gemini"
        ? "gemini-3.5-flash"
        : "deepseek/deepseek-chat")
  );

  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchModelsForProvider = useCallback(
    async (targetProvider: "openrouter" | "gemini") => {
      setLoadingModels(true);
      try {
        const res = await fetch(`/api/ai/models?provider=${targetProvider}`);
        if (!res.ok) throw new Error("Gagal mengambil daftar model");
        const data = await res.json();
        if (Array.isArray(data)) {
          setModels(data);
          return data;
        }
      } catch (err) {
        console.error("Error fetching models:", err);
      } finally {
        setLoadingModels(false);
      }
      return [];
    },
    []
  );

  useEffect(() => {
    fetchModelsForProvider(provider);
  }, [provider, fetchModelsForProvider]);

  const savePreferences = async (prov: "openrouter" | "gemini", mod: string) => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProvider: prov,
          selectedModel: mod,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal menyimpan model");
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to patch plan model:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderSelect = async (newProvider: "openrouter" | "gemini") => {
    if (newProvider === provider) return;

    setProvider(newProvider);
    setSearchQuery("");
    const fetched = await fetchModelsForProvider(newProvider);

    let nextModel = "";
    if (newProvider === "gemini") {
      nextModel = fetched.some((m: ModelOption) => m.id === "gemini-3.5-flash")
        ? "gemini-3.5-flash"
        : fetched[0]?.id || "gemini-3.5-flash";
    } else {
      nextModel = fetched[0]?.id || "deepseek/deepseek-chat";
    }

    setModel(nextModel);
    await savePreferences(newProvider, nextModel);
  };

  const handleModelSelect = async (newModelId: string) => {
    if (newModelId === model) return;
    setModel(newModelId);
    await savePreferences(provider, newModelId);
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const query = searchQuery.toLowerCase().trim();
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  const currentModelOption = models.find((m) => m.id === model);
  const currentModelLabel = currentModelOption
    ? currentModelOption.displayName
    : model || (loadingModels ? "Memuat..." : "Pilih Model");

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* 1. Dropdown Provider */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1.5 h-8 text-xs font-medium border border-border/60 rounded-md px-2.5 bg-background hover:bg-muted text-foreground transition cursor-pointer shadow-xs shrink-0"
          aria-label="Pilih AI Provider"
        >
          {provider === "gemini" ? (
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          ) : (
            <Cpu className="h-3.5 w-3.5 text-purple-500" />
          )}
          <span className="font-semibold">
            {provider === "gemini" ? "Gemini" : "OpenRouter"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-60 ml-0.5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            Pilih AI Provider
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => handleProviderSelect("gemini")}
            className="flex items-center justify-between text-xs py-2 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <div>
                <p className="font-medium">Google Gemini</p>
                <p className="text-[10px] text-muted-foreground">Google AI Studio</p>
              </div>
            </div>
            {provider === "gemini" && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleProviderSelect("openrouter")}
            className="flex items-center justify-between text-xs py-2 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-purple-500" />
              <div>
                <p className="font-medium">OpenRouter</p>
                <p className="text-[10px] text-muted-foreground">DeepSeek, Claude, dll.</p>
              </div>
            </div>
            {provider === "openrouter" && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 2. Dropdown Model */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1.5 h-8 text-xs font-medium border border-border/60 rounded-md px-2.5 bg-background hover:bg-muted text-foreground transition cursor-pointer shadow-xs max-w-[170px] sm:max-w-[220px]"
          aria-label="Pilih Model AI"
          disabled={loadingModels}
        >
          {loadingModels ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          )}
          <span className="truncate">{currentModelLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-60 ml-auto shrink-0" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-hidden flex flex-col p-0">
          <div className="p-2 border-b border-border/40 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1 bg-background border border-input rounded-md">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Cari model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-1">
            <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground px-2 py-1">
              Model {provider === "gemini" ? "Google Gemini" : "OpenRouter"} ({filteredModels.length})
            </DropdownMenuLabel>

            {filteredModels.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Tidak ada model ditemukan
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = m.id === model;
                return (
                  <DropdownMenuItem
                    key={m.id}
                    onClick={() => handleModelSelect(m.id)}
                    className="flex items-center justify-between text-xs py-1.5 px-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <div className="w-3.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate ${isSelected ? "font-semibold text-foreground" : "text-foreground/90"}`}>
                          {m.displayName}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {m.id}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 3. Saving Indicator */}
      {isSaving && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="hidden sm:inline">Menyimpan...</span>
        </span>
      )}
      {!isSaving && savedSuccess && (
        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
          <Check className="h-3 w-3" />
          <span className="hidden sm:inline">Tersimpan</span>
        </span>
      )}
    </div>
  );
}
