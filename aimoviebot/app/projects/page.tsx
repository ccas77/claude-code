"use client";
import { useEffect, useState } from "react";

type ProjectSummary = {
  jobId: string;
  title?: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  characterCount: number;
  thumbnailUrl?: string;
  hasVideo: boolean;
  inflightCount: number;
  errorStage?: string;
  errorMessage?: string;
};

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  concept: "Drafting concept",
  awaiting_approval: "Awaiting scene approval",
  char_sheets: "Character sheets",
  loc_sheet: "Location sheet",
  shot_list: "16-shot list",
  awaiting_shotlist_approval: "Awaiting shot list approval",
  storyboard: "Storyboards",
  awaiting_storyboard_approval: "Awaiting storyboard approval",
  video: "Rendering clips",
  captioning: "Stitching + captions",
  done: "Done",
  failed: "Failed",
};

const STAGE_TONE: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  awaiting_approval: "bg-amber-50 text-amber-800 border-amber-200",
  awaiting_shotlist_approval: "bg-amber-50 text-amber-800 border-amber-200",
  awaiting_storyboard_approval: "bg-amber-50 text-amber-800 border-amber-200",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!projects) return <p>Loading…</p>;
  if (projects.length === 0)
    return (
      <main className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-stone-500 text-sm">
          No projects yet. Start one from the Render page.
        </p>
      </main>
    );

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-stone-600 text-sm mt-1">
          Every render attempted, in any state. Click a card to inspect or
          resume.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.jobId} project={p} />
        ))}
      </div>
    </main>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const tone =
    STAGE_TONE[project.status] ??
    "bg-stone-50 text-stone-700 border-stone-200";
  return (
    <a
      href={`/status/${project.jobId}`}
      className="block border border-stone-200 rounded-lg overflow-hidden bg-white hover:border-violet-300 transition"
    >
      {project.thumbnailUrl ? (
        <img
          src={project.thumbnailUrl}
          alt=""
          className="w-full aspect-[9/16] object-cover bg-stone-100"
        />
      ) : (
        <div className="w-full aspect-[9/16] bg-stone-100 flex items-center justify-center text-stone-400 text-xs">
          no preview
        </div>
      )}
      <div className="p-2 space-y-1">
        <p
          className="text-sm font-medium text-stone-800 line-clamp-2"
          title={project.title ?? "Untitled"}
        >
          {project.title ?? "Untitled render"}
        </p>
        <span
          className={`inline-block text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5 ${tone}`}
        >
          {STAGE_LABEL[project.status] ?? project.status}
        </span>
        {project.errorStage ? (
          <p
            className="text-[10px] text-red-700 truncate"
            title={project.errorMessage ?? ""}
          >
            {project.errorStage}: {project.errorMessage ?? ""}
          </p>
        ) : null}
        <p className="text-[11px] text-stone-500">
          {project.characterCount} char{project.characterCount === 1 ? "" : "s"}{" "}
          · {fmtTime(project.updatedAt)}
        </p>
        {project.inflightCount > 0 ? (
          <p className="text-[10px] text-violet-700">
            {project.inflightCount} in flight on Higgsfield
          </p>
        ) : null}
        {project.hasVideo ? (
          <p className="text-[10px] text-emerald-700">final video ready</p>
        ) : null}
        <p className="text-[10px] font-mono text-stone-400 truncate">
          {project.jobId}
        </p>
      </div>
    </a>
  );
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
