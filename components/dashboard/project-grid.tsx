import { ProjectCard, ProjectItem } from "./project-card";
import { CreateProjectDialog } from "./create-project-dialog";
import { FolderPlus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectGridProps {
  projects: ProjectItem[];
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/40 my-6">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4 shadow-inner">
          <Layers className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Belum ada Project</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1.5 mb-6">
          Mulai rancang aplikasi impian Anda dengan membuat project pertama, lalu buat rencana PRD terstruktur di dalamnya.
        </p>
        <CreateProjectDialog
          triggerButton={
            <Button size="lg" className="gap-2 shadow-sm">
              <FolderPlus className="h-4 w-4" />
              <span>Buat Project Pertama</span>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 my-6">
      {projects.map((proj) => (
        <ProjectCard key={proj.id} project={proj} />
      ))}
    </div>
  );
}
