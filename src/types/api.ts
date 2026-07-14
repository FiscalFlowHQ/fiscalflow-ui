/**
 * TypeScript mirror of the fiscalflow-api HTTP contract (non-streaming).
 *
 * Authority: UI plans + live BE routers. Target shapes for downstream UI tasks are
 * preferred where the 2026-07 remediation notes ahead of schemas.py — see task-02 handoff
 * for schema drift.
 */

export type DocumentStatus = "uploaded" | "auditing" | "ingesting" | "ready" | "failed";

export type RunStatus =
  | "ingesting"
  | "planning"
  | "awaiting_approval"
  | "generating"
  | "reviewing"
  | "assembling"
  | "completed"
  | "failed"
  | "cancelled";

export type AuditStatus = "pending" | "passed" | "failed" | string;

export type ApprovalPolicyName = "thorough" | "balanced";

export type ResumeAction = "approve" | "edit" | "reject" | "answer";

export type InterruptTier = "global" | "section" | "step";

export type InterruptPhase = "plan" | "review" | "clarification";

export type DocumentFormat = "md" | "pptx" | "pdf";

/** `values.error` channel — BE should send `{ message }`; tolerate plain strings. */
export interface RunError {
  message: string;
}

export interface SessionResponse {
  thread_id: string;
}

export interface DocumentUploadResponse {
  document_ref: string;
}

export interface DocumentStatusResponse {
  status: DocumentStatus | string;
  audit_status?: string | null;
  error?: string | null;
}

export interface StartGenerationRequest {
  selected_sections: string[];
  document_ref?: string | null;
  instruction?: string | null;
  /** UI default for composer: `"balanced"`. BE default if omitted is `"thorough"`. */
  approval_policy?: ApprovalPolicyName | string;
  provider_override?: string | null;
}

export interface ResumeRequest {
  action: ResumeAction;
  /** Required by target contract — stale/duplicate → 409. */
  interrupt_id: string;
  edited_content?: Record<string, unknown> | unknown[] | string | null;
  /** Free text when `action === "reject"` (regen feedback). */
  reason?: string;
}

export interface InstructionRequest {
  text: string;
}

export interface InstructionResponse {
  ok: boolean;
  instruction_count: number;
}

export interface InterruptEnvelope {
  interrupt_id: string;
  tier: InterruptTier;
  phase: InterruptPhase;
  section_id: string | null;
  step_id: string | null;
  content: Record<string, unknown>;
  allowed_actions: ResumeAction[];
}

export interface SectionCatalogItem {
  id: string;
  title: string;
  /** Sparse DD-Agent chapter numbers — sort by this; do not assume continuity. */
  order: number | null;
  required_structure: string[];
}

export interface SectionCatalogResponse {
  sections: SectionCatalogItem[];
}

/**
 * Outer graph channels as returned in `GET /sessions/{id}/state` → `values`.
 * Extra BE keys are allowed; only UI-relevant fields are declared.
 */
export interface ReportValues {
  user_request?: string | null;
  databook_ref?: string;
  selected_sections?: string[];
  global_plan?: { content: string } | null;
  active_section_plan?: { content: string; section_id?: string } | null;
  sections?: unknown[];
  current_section_index?: number;
  completed_sections?: unknown[];
  prior_findings?: unknown[];
  audit_status?: AuditStatus;
  run_status?: RunStatus | string | null;
  error?: RunError | string | null;
  metadata?: {
    provider_override?: string | null;
    artifacts?: { markdown?: string; pptx?: string; pdf?: string };
  };
  final_document?: string;
  [key: string]: unknown;
}

/** Mid-section subgraph snapshot when the BE surfaces it on `/state`. */
export type SectionState = Record<string, unknown>;

export interface SessionStateResponse {
  values: ReportValues;
  next: string[];
  interrupt: InterruptEnvelope | null;
  /** Present on remediated BE; live tree may omit — treat as null. */
  section_state?: SectionState | null;
}

export interface SessionStatusResponse {
  run_status: RunStatus | string | null;
  audit_status: AuditStatus | null;
  current_section_index: number | null;
}

export interface CancelResponse {
  cancelled: boolean;
  was_running: boolean;
  run_status: "cancelled";
}

export interface AvailableProvider {
  provider: string;
  default_model: string;
  key_present: boolean;
}

export interface ProviderSettingsResponse {
  provider: string | null;
  model: string | null;
  /** Array of objects — not bare strings. */
  available_providers: AvailableProvider[];
}

export interface ProviderSettingsUpdate {
  provider: string;
  model?: string;
}

export interface ProviderSettingsUpdateResponse {
  provider: string;
  model?: string | null;
}

export interface HealthResponse {
  status: string;
}
