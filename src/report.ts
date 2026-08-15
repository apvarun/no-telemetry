import { failsCheck, type LibraryResult, type InitPlanItem } from "./core.ts";

/** Wire format version - bump only on breaking JSON shape changes. */
export type ReportVersion = 1;

export type ReportSummary = {
  installed: number;
  applicable: number;
  disabled: number;
  enabled: number;
  unsupported: number;
  optIn: number;
  notFound: number;
  ignored?: number;
};

export type LibraryReport = {
  id: string;
  name: string;
  packages: string[];
  installed: boolean;
  status: LibraryResult["status"];
  failsCheck: boolean;
  env: LibraryResult["env"];
  notes: string[];
};

export type ReportAction =
  | { type: "add"; key: string; value: string }
  | { type: "ok"; key: string; value: string }
  | { type: "conflict"; key: string; value: string; existing: string }
  | { type: "message"; message: string };

export type ReportV1 = {
  version: ReportVersion;
  cwd: string;
  summary: ReportSummary;
  libraries: LibraryReport[];
  actions: ReportAction[];
  /** Present on tool/usage failures (still version 1 shape). */
  error?: string;
};

const EMPTY_SUMMARY: ReportSummary = {
  installed: 0,
  applicable: 0,
  disabled: 0,
  enabled: 0,
  unsupported: 0,
  optIn: 0,
  notFound: 0,
};

export function summarize(results: LibraryResult[]): ReportSummary {
  let installed = 0;
  let applicable = 0;
  let disabled = 0;
  let enabled = 0;
  let unsupported = 0;
  let optIn = 0;
  let notFound = 0;

  for (const r of results) {
    if (r.installed) installed++;
    if (r.status === "not_found") notFound++;
    if (r.status === "disabled") {
      disabled++;
      applicable++;
    } else if (r.status === "enabled") {
      enabled++;
      applicable++;
    } else if (r.status === "unsupported") {
      unsupported++;
    } else if (r.status === "not_applicable") {
      optIn++;
    }
  }

  return { installed, applicable, disabled, enabled, unsupported, optIn, notFound };
}

export function toLibraryReport(r: LibraryResult): LibraryReport {
  const notes: string[] = [];
  if (r.entry.notes) notes.push(r.entry.notes);
  return {
    id: r.entry.id,
    name: r.entry.name,
    packages: [...r.entry.packages],
    installed: r.installed,
    status: r.status,
    failsCheck: failsCheck(r),
    env: r.env,
    notes,
  };
}

export function planToActions(plan: InitPlanItem[]): ReportAction[] {
  return plan.map((p) => {
    if (p.kind === "add") return { type: "add" as const, key: p.env.key, value: p.env.value };
    if (p.kind === "ok") return { type: "ok" as const, key: p.env.key, value: p.env.value };
    return {
      type: "conflict" as const,
      key: p.env.key,
      value: p.env.value,
      existing: p.existing,
    };
  });
}

export function buildReport(
  cwd: string,
  results: LibraryResult[],
  options: { actions?: ReportAction[]; ignored?: number; error?: string } = {},
): ReportV1 {
  const summary = summarize(results);
  if (options.ignored !== undefined) summary.ignored = options.ignored;
  const report: ReportV1 = {
    version: 1,
    cwd,
    summary,
    libraries: results.map(toLibraryReport),
    actions: options.actions ?? [],
  };
  if (options.error !== undefined) report.error = options.error;
  return report;
}

/** Version-1 error envelope (empty summary/libraries; optional plan actions). */
export function buildErrorReport(
  cwd: string,
  error: string,
  options: { actions?: ReportAction[] } = {},
): ReportV1 {
  return {
    version: 1,
    cwd,
    summary: { ...EMPTY_SUMMARY },
    libraries: [],
    actions: options.actions ?? [],
    error,
  };
}
