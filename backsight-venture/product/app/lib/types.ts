export type ClientKind =
  | "title_co"
  | "builder"
  | "homeowner"
  | "attorney"
  | "government";

export type JobType =
  | "boundary"
  | "alta"
  | "topo"
  | "construction_staking"
  | "subdivision_plat"
  | "elevation_cert";

export type Stage =
  | "request"
  | "quoted"
  | "scheduled"
  | "fieldwork"
  | "drafting"
  | "review"
  | "delivered"
  | "invoiced";

export const STAGES: Stage[] = [
  "request",
  "quoted",
  "scheduled",
  "fieldwork",
  "drafting",
  "review",
  "delivered",
  "invoiced",
];

export const STAGE_LABELS: Record<Stage, string> = {
  request: "Request",
  quoted: "Quoted",
  scheduled: "Scheduled",
  fieldwork: "Fieldwork",
  drafting: "Drafting",
  review: "Review",
  delivered: "Delivered",
  invoiced: "Invoiced",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  boundary: "Boundary Survey",
  alta: "ALTA/NSPS Survey",
  topo: "Topographic Survey",
  construction_staking: "Construction Staking",
  subdivision_plat: "Subdivision Plat",
  elevation_cert: "Elevation Certificate",
};

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  title_co: "Title Company",
  builder: "Builder",
  homeowner: "Homeowner",
  attorney: "Attorney",
  government: "Government",
};

export interface ClientRow {
  id: number;
  name: string;
  kind: ClientKind;
  contact_email: string;
  phone: string;
}

export interface JobRow {
  id: number;
  job_number: string;
  client_id: number;
  type: JobType;
  stage: Stage;
  quote_amount: number | null;
  address: string;
  county: string;
  state: string;
  lat: number;
  lng: number;
  plss_trs: string | null;
  plss_meridian: string | null;
  crew: string | null;
  due_date: string | null;
  created_at: string;
  delivered_at: string | null;
  notes: string | null;
  share_token: string;
}

export interface JobEventRow {
  id: number;
  job_id: number;
  at: string;
  actor: string;
  from_stage: Stage | null;
  to_stage: Stage;
  note: string | null;
}

export interface AttachmentRow {
  id: number;
  job_id: number;
  filename: string;
  label: string;
}

export interface OutboxRow {
  id: number;
  at: string;
  to_email: string;
  subject: string;
  body: string;
  job_id: number | null;
}

export interface JobWithClient extends JobRow {
  client_name: string;
  client_kind: ClientKind;
  client_email: string;
}

export interface DemoUser {
  id: string;
  name: string;
  role: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: "dana", name: "Dana Whitfield, PLS", role: "Owner / Licensed Surveyor" },
  { id: "marcus", name: "Marcus Lee", role: "Office Manager" },
];

export const FIRM = {
  name: "Whitfield Land Surveying, PLS",
  city: "Fort Collins",
  county: "Larimer County",
  state: "CO",
  phone: "(970) 555-0164",
  email: "office@whitfieldpls.example.com",
};
