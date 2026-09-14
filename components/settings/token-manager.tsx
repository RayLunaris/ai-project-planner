"use client";

import React, { useState } from "react";
import {
  Plus,
  Loader2,
  Copy,
  Check,
  Trash2,
  Key,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TokenInfo {
  id: string;
  label: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

interface TokenManagerProps {
  initialTokens: TokenInfo[];
}

export function TokenManager({ initialTokens }: TokenManagerProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>(initialTokens);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [newRawToken, setNewRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        setNewRawToken(data.token.rawToken);
        setTokens((prev) => [
          {
            id: data.token.id,
            label: data.token.label,
            createdAt: data.token.createdAt,
            lastUsedAt: data.token.lastUsedAt,
          },
          ...prev,
        ]);
        setShowForm(false);
        setLabel("");
      } else {
        setError(data.error || "Gagal membuat token");
      }
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    setRevokingId(tokenId);
    setError(null);

    try {
      const res = await fetch(`/api/settings/tokens/${tokenId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      } else {
        const data = await res.json();
        setError(data.error || "Gagal menghapus token");
      }
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopy() {
    if (newRawToken) {
      navigator.clipboard.writeText(newRawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      {/* New Token Display — shown once after generation */}
      {newRawToken && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] space-y-3 animate-in fade-in duration-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Token berhasil dibuat
              </p>
              <p className="text-xs text-muted-foreground">
                Salin token ini sekarang. Token ini{" "}
                <strong>tidak akan ditampilkan lagi</strong> setelah Anda
                meninggalkan halaman ini.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border/40 rounded px-3 py-2 break-all select-all">
              {newRawToken}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="shrink-0 gap-1.5 h-8"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Salin
                </>
              )}
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNewRawToken(null)}
            className="text-xs text-muted-foreground"
          >
            Tutup pesan ini
          </Button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] text-destructive text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Generate Form / Button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Personal Access Tokens
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Token digunakan untuk autentikasi CLI dan MCP Server ke aplikasi ini.
          </p>
        </div>

        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Generate Token
          </Button>
        )}
      </div>

      {showForm && (
        <div className="flex items-end gap-3 p-4 rounded-lg border border-border/40 bg-card/60 animate-in slide-in-from-top-2 duration-200">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="token-label"
              className="text-xs font-medium text-foreground"
            >
              Label{" "}
              <span className="text-muted-foreground font-normal">
                (opsional)
              </span>
            </label>
            <Input
              id="token-label"
              placeholder="Contoh: MacBook Pro, CI Pipeline"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerate();
                if (e.key === "Escape") {
                  setShowForm(false);
                  setLabel("");
                }
              }}
            />
          </div>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Key className="h-3.5 w-3.5" />
            )}
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowForm(false);
              setLabel("");
            }}
            className="h-9 text-muted-foreground"
          >
            Batal
          </Button>
        </div>
      )}

      {/* Token List */}
      {tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60 rounded-xl">
          <Key className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">
            Belum ada token
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Buat personal access token untuk menghubungkan CLI atau MCP Server
            ke aplikasi ini.
          </p>
        </div>
      ) : (
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Label
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Dibuat
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Terakhir Dipakai
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const isRevoking = revokingId === token.id;
                return (
                  <tr
                    key={token.id}
                    className={`border-b border-border/20 last:border-b-0 transition ${
                      isRevoking ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <span className="font-medium text-foreground">
                          {token.label || (
                            <span className="text-muted-foreground italic">
                              Tanpa label
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(token.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {token.lastUsedAt ? (
                        <span className="text-muted-foreground">
                          {formatDate(token.lastUsedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 italic">
                          Belum pernah
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(token.id)}
                        disabled={isRevoking}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                      >
                        {isRevoking ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Revoke
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
