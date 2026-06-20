export type Backend = "higgsfield" | "gateway";

export type DialogueLine = {
  speaker: string;
  line: string;
};

// Shared output of Stage 0, regardless of mode A/B/C. dialogue is first-class
// data; it MUST survive into Stage 3 (attached per shot) and into Stage 5's
// Seedance prompt verbatim, or the characters won't speak.
export type ConceptResult = {
  mode: "A" | "B" | "C";
  sceneDescription: string;
  dialogue: DialogueLine[];
  alternates?: string[];
  notes?: string;
};

// One parsed storyboard panel. dialogue is the subset of the scene's lines
// spoken on this shot, in order. May be empty for wordless shots.
export type Shot = {
  n: number;
  camera: string;
  action: string;
  dialogue: DialogueLine[];
};

export type ShotList = Shot[]; // length always 16

export type Artifacts = {
  sceneDescription?: string;
  dialogue?: DialogueLine[];
  characterSheetUrl?: string;
  locationSheetUrl?: string;
  shotList?: ShotList;
  storyboardUrl?: string;
  videoUrl?: string;
};

export type JobStatus =
  | "queued"
  | "concept"
  | "awaiting_approval"
  | "char_sheet"
  | "loc_sheet"
  | "shot_list"
  | "storyboard"
  | "video"
  | "done"
  | "failed";

export type StageName =
  | "concept"
  | "stage1"
  | "stage2"
  | "stage3"
  | "stage4"
  | "stage5";

export type StageResult = {
  url?: string;
  json?: unknown;
  backend?: Backend;
};

export type Job = {
  jobId: string;
  status: JobStatus;
  characterImageUrl: string;
  locationImageUrl: string;
  videoDurationSec?: number;
  artifacts: Artifacts;
  servedBy?: Partial<Record<StageName, Backend>>;
  error?: { stage: StageName; message: string };
  createdAt: string;
  updatedAt: string;
};

export type ConceptMode = "A" | "B" | "C";

export type ConceptInput = {
  mode: ConceptMode;
  conceptInput: string;
  characterImageUrl: string;
  locationImageUrl: string;
};

export type ApproveInput = {
  jobId: string;
  sceneDescription: string;
  dialogue: DialogueLine[];
  videoDurationSec?: number;
};
