/**
 * Review settings, kept on disk rather than in the browser: the server is what
 * uses them, and instructions you've spent time on shouldn't vanish because a
 * browser's site data was cleared.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEFAULT_AI_CONFIG,
  EFFORTS,
  type AiReviewConfig,
  type AiReviewEffort,
  type InstructionSet,
} from "../shared/aiReview.ts";
import { expandHome, localPaths } from "./paths.ts";

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

const SET_ID = /^[\w-]{1,64}$/;

/** Missing, the sets there are to begin with; an empty list is no sets. */
function normalizeSets(value: unknown): InstructionSet[] {
  if (!Array.isArray(value)) return DEFAULT_AI_CONFIG.globalInstructions;
  const ids = new Set<string>();
  return value.flatMap((item): InstructionSet[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<InstructionSet>;
    const id = typeof raw.id === "string" && SET_ID.test(raw.id) && !ids.has(raw.id) ? raw.id : crypto.randomUUID();
    ids.add(id);
    return [
      {
        id,
        name: typeof raw.name === "string" ? raw.name : "",
        instructions: typeof raw.instructions === "string" ? raw.instructions : "",
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
      },
    ];
  });
}

/** Accepts anything, returns a complete and sane config. */
export function normalizeConfig(input: unknown): AiReviewConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<AiReviewConfig>;
  const d = DEFAULT_AI_CONFIG;
  return {
    instructions:
      typeof raw.instructions === "string" && raw.instructions.trim()
        ? raw.instructions
        : d.instructions,
    model: typeof raw.model === "string" ? raw.model.trim() : d.model,
    effort: EFFORTS.includes(raw.effort as AiReviewEffort) ? (raw.effort as AiReviewEffort) : d.effort,
    timeoutMinutes: clampInt(raw.timeoutMinutes, 1, 120, d.timeoutMinutes),
    maxConcurrent: clampInt(raw.maxConcurrent, 1, 6, d.maxConcurrent),
    clones: typeof raw.clones === "string" ? raw.clones : d.clones,
    readOnly: typeof raw.readOnly === "boolean" ? raw.readOnly : d.readOnly,
    globalInstructions: normalizeSets(raw.globalInstructions),
  };
}

export async function loadConfig(): Promise<AiReviewConfig> {
  const file = Bun.file(localPaths().config);
  if (!(await file.exists())) return DEFAULT_AI_CONFIG;
  try {
    return normalizeConfig(await file.json());
  } catch {
    // A hand-edited file with a typo shouldn't take reviews down.
    return DEFAULT_AI_CONFIG;
  }
}

export async function saveConfig(input: unknown): Promise<AiReviewConfig> {
  const config = normalizeConfig(input);
  const path = localPaths().config;
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

/**
 * `owner/name = /path` lines → a map keyed by lowercase owner/name. Blank
 * lines and `#` comments are ignored, and `~` expands to your home directory.
 */
export function parseCloneMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const repo = line.slice(0, eq).trim().toLowerCase();
    const path = line.slice(eq + 1).trim();
    if (/^[\w.-]+\/[\w.-]+$/.test(repo) && path) map.set(repo, expandHome(path));
  }
  return map;
}
