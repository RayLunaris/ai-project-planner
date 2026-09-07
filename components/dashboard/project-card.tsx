import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { FolderKanban, Calendar, ArrowRight } from "lucide-react";

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | string | null;
  planCount?: number;
}

interface ProjectCardProps {
  project: ProjectItem;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const formattedDate = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";

  return (
    <Link href={`/projects/${project.id}`} className="group block focus:outline-none">
      <Card className="h-full transition-all duration-200 border-border/60 hover:border-primary/50 hover:shadow-md group-hover:-translate-y-0.5 flex flex-col justify-between">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <FolderKanban className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100 transform -translate-x-1 group-hover:translate-x-0 duration-200" />
          </div>
          <CardTitle className="text-lg font-semibold tracking-tight mt-3 text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {project.name}
          </CardTitle>
          <CardDescription className="line-clamp-2 text-sm text-muted-foreground mt-1 min-h-[40px]">
            {project.description || "Tidak ada deskripsi tambahan."}
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-2">
          {typeof project.planCount === "number" && (
            <div className="text-xs text-muted-foreground">
              {project.planCount} {project.planCount === 1 ? "Plan" : "Plans"}
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2 border-t border-border/40 text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formattedDate}</span>
          </div>
          <span className="font-medium text-xs text-primary group-hover:underline">
            Buka Project &rarr;
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
