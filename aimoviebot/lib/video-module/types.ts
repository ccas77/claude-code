export type Backend = "higgsfield" | "gateway";

export type DialogueLine = {
  speaker: string;
  line: string;
};

// One member of the cast. name doubles as the dialogue speaker label, so
// dialogue.speaker strings should match a character name (with the exception
// of narrators / off-screen voices, which stay free-text).
export type Character = {
  name: string;
  imageUrl: string;
};

export type CharacterSheet = {
  name: string;
  url: string;
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

// One Higgsfield job currently in flight for this app job. Persisted as
// soon as the MCP returns a jobId so the status page can show what's
// happening BEFORE the gen completes (lets the user click into Higgsfield
// directly if a job hangs or needs manual ip approval).
export type InflightHiggsfieldJob = {
  hfJobId: string;
  stage: "stage1" | "stage2" | "stage4" | "stage5";
  label: string; // e.g. "Character: Mira" or "Location" or "Storyboard" or "Video"
  submittedAt: string;
};

export type Artifacts = {
  sceneDescription?: string;
  dialogue?: DialogueLine[];
  characterSheets?: CharacterSheet[];
  locationSheetUrl?: string;
  shotList?: ShotList;
  storyboardUrl?: string;
  videoUrl?: string;
  inflightHiggsfieldJobs?: InflightHiggsfieldJob[];
};

export type JobStatus =
  | "queued"
  | "concept"
  | "awaiting_approval"
  | "char_sheets"
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

// Optional per-job override of the Higgsfield image model. When set, image
// stages call generate_image with this slug instead of MODELS.image.higgsfield.
// Used to switch between gpt_image_2 (default, faithful identity but
// content-moderation-sensitive) and nano_banana_pro (more permissive) on
// retry when one model rejects an upload.
export type Job = {
  jobId: string;
  status: JobStatus;
  characters: Character[]; // 1+ characters
  locationImageUrl: string;
  videoDurationSec?: number;
  imageModelOverride?: string;
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
  characters: Character[];
  locationImageUrl: string;
};

export type ApproveInput = {
  jobId: string;
  sceneDescription: string;
  dialogue: DialogueLine[];
  videoDurationSec?: number;
};
