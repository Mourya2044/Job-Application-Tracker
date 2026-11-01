export const LIFECYCLE_STAGES = [
  "applied",
  "screening",
  "interview",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const VALID_STAGE_TRANSITIONS: Record<LifecycleStage, readonly LifecycleStage[]> = {
  applied: ["screening", "interview", "interviewing", "offer", "rejected", "withdrawn"],
  screening: ["interview", "interviewing", "offer", "rejected", "withdrawn"],
  interview: ["screening", "interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["screening", "interview", "offer", "rejected", "withdrawn"],
  offer: ["accepted", "rejected", "withdrawn"],
  accepted: ["rejected", "withdrawn"],
  rejected: ["applied", "screening", "interview", "interviewing"],
  withdrawn: ["applied", "screening", "interview", "interviewing"],
};

export const VALID_AUTOMATED_TRANSITIONS: Record<LifecycleStage, readonly LifecycleStage[]> = {
  applied: ["screening", "interview", "interviewing", "offer", "rejected", "withdrawn"],
  screening: ["interview", "interviewing", "offer", "rejected", "withdrawn"],
  interview: ["interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["offer", "rejected", "withdrawn"],
  offer: ["accepted", "rejected", "withdrawn"],
  accepted: [],
  rejected: [],
  withdrawn: [],
};

export function isStageTransitionAllowed(
  fromStage: LifecycleStage,
  toStage: LifecycleStage,
  isAutomated = false
): boolean {
  if (fromStage === toStage) return true;
  const matrix = isAutomated ? VALID_AUTOMATED_TRANSITIONS : VALID_STAGE_TRANSITIONS;
  const allowed = matrix[fromStage];
  return Boolean(allowed && allowed.includes(toStage));
}

export const TRIGGER_SOURCES = [
  "mailbox_auto",
  "manual_user_override",
  "undo_action",
  "initial_ingest",
] as const;

export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export const ATS_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "json_ld",
  "custom_html",
] as const;

export type AtsProvider = (typeof ATS_PROVIDERS)[number];

export const MATCH_STATUSES = [
  "unmatched",
  "matched_auto",
  "suggested",
  "untracked_candidate",
  "ignored",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const EMAIL_PROCESSING_STATUSES = [
  "queued",
  "processing",
  "processed",
  "duplicate_skipped",
  "failed_dead_letter",
] as const;

export type EmailProcessingStatus = (typeof EMAIL_PROCESSING_STATUSES)[number];

export const AI_CAPABILITIES = [
  "text_generation",
  "structured_extraction",
  "embedding",
  "classification",
] as const;

export type AICapability = (typeof AI_CAPABILITIES)[number];

