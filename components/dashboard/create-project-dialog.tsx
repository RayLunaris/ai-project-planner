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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus, Loader2 } from "lucide-react";

interface CreateProjectDialogProps {
  onCreated?: () => void;
  triggerButton?: React.ReactNode;
}

export function CreateProjectDialog({ onCreated, triggerButton }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nama project wajib diisi");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat project");
      }

      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
      if (onCreated) {
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
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
          <FolderPlus className="h-4 w-4" />
          <span>New Project</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Buat Project Baru</DialogTitle>
            <DialogDescription>
              Beri nama dan deskripsi singkat untuk mengelompokkan rencana PRD aplikasi Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="project-name" className="text-sm font-medium">
                Nama Project <span className="text-destructive">*</span>
              </label>
              <Input
                id="project-name"
                placeholder="mis. E-Commerce Multi-Vendor, Task Automation CLI"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="project-desc" className="text-sm font-medium">
                Deskripsi Singkat (Opsional)
              </label>
              <Textarea
                id="project-desc"
                placeholder="Penjelasan ringkas mengenai tujuan atau fokus utama project ini..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={3}
              />
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
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Buat Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
