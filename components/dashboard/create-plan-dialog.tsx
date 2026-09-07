"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, PlusCircle } from "lucide-react";

interface CreatePlanDialogProps {
  projectId: string;
  triggerButton?: React.ReactNode;
}

export function CreatePlanDialog({ projectId, triggerButton }: CreatePlanDialogProps) {
  const [open, setOpen] = useState(false);
  const [initialIdea, setInitialIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initialIdea.trim() || initialIdea.trim().length < 5) {
      setError("Ide awal minimal harus 5 karakter");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, initialIdea: initialIdea.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat plan");
      }

      setOpen(false);
      setInitialIdea("");
      // Navigate to Plan Builder
      router.push(`/projects/${projectId}/plans/${data.plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setLoading(false);
    }
  }

  return (
    <>
      {triggerButton ? (
        <span onClick={() => setOpen(true)} role="button" tabIndex={0} className="inline-block cursor-pointer">
          {triggerButton}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-2 shadow-sm">
          <PlusCircle className="h-4 w-4" />
          <span>Buat Plan Baru</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>Mulai Rancang Plan PRD Baru</span>
              </DialogTitle>
              <DialogDescription>
                Tuliskan ide mentah aplikasi yang ingin Anda bangun. AI akan membedah dan mengajukan pertanyaan klarifikasi untuk melengkapinya.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="initial-idea" className="text-sm font-medium">
                  Ide Awal Aplikasi <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="initial-idea"
                  placeholder="Contoh: Saya ingin membuat aplikasi web untuk reservasi meja kafe secara online, di mana pelanggan bisa memilih tempat duduk visual dan membayar DP via QRIS..."
                  value={initialIdea}
                  onChange={(e) => setInitialIdea(e.target.value)}
                  disabled={loading}
                  rows={5}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Semakin banyak konteks yang Anda berikan di awal, semakin cepat AI memahami visi produk Anda.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Batal
              </Button>
              <Button type="submit" disabled={loading || !initialIdea.trim()}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mulai Klarifikasi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
