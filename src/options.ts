import type { PluginOptions } from "@opencode/plugin"

export type PrivacyLevel = "anon" | "zdr" | "e2e"

export type Activation = "enabled" | "auto"

export interface PayPerQOptions {
  providerID: string
  providerName: string
  apiBaseURL: string
  apiKey?: string
  activation: Activation
  refreshInterval: number
  refreshOnStart: boolean
  requestTimeout: number
  types: readonly string[]
  privacyLevels: readonly PrivacyLevel[]
  include: readonly string[]
  exclude: readonly string[]
  popularFirst: boolean
  maxModels: number
  reasoningVariants: boolean
  headers: Record<string, string>
}

export const DEFAULTS: PayPerQOptions = {
  providerID: "payperq",
  providerName: "PayPerQ",
  apiBaseURL: "https://api.ppq.ai/v1",
  activation: "enabled",
  refreshInterval: 6 * 60 * 60 * 1000,
  refreshOnStart: true,
  requestTimeout: 20_000,
  types: ["chat"],
  privacyLevels: ["anon", "zdr", "e2e"],
  include: [],
  exclude: [],
  popularFirst: true,
  maxModels: 0,
  reasoningVariants: true,
  headers: {},
}

const MIN_REFRESH_INTERVAL = 30_000
const MIN_TIMEOUT = 1_000

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function asNumber(value: unknown, fallback: number, min: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(value, min)
  return fallback
}

function asList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
}

function asHeaders(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const headers: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") headers[key] = entry
    else if (typeof entry === "number" || typeof entry === "boolean") headers[key] = String(entry)
  }
  return headers
}

function asDuration(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return fallback
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(value.trim())
  if (!match) return fallback
  const amount = Number(match[1])
  const unit = (match[2] ?? "ms").toLowerCase()
  const scale = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1
  return amount * scale
}

export function parseOptions(raw: PluginOptions): PayPerQOptions {
  const privacyLevels = asList(raw.privacyLevels)?.filter(
    (level): level is PrivacyLevel => level === "anon" || level === "zdr" || level === "e2e",
  )
  const activation = raw.activation === "auto" || raw.activation === "enabled" ? raw.activation : DEFAULTS.activation
  return {
    providerID: asString(raw.providerID, DEFAULTS.providerID),
    providerName: asString(raw.providerName, DEFAULTS.providerName),
    apiBaseURL: asString(raw.apiBaseURL, DEFAULTS.apiBaseURL).replace(/\/+$/, ""),
    apiKey: asString(raw.apiKey, ""),
    activation,
    refreshInterval: asNumber(asDuration(raw.refreshInterval, DEFAULTS.refreshInterval), DEFAULTS.refreshInterval, MIN_REFRESH_INTERVAL),
    refreshOnStart: asBoolean(raw.refreshOnStart, DEFAULTS.refreshOnStart),
    requestTimeout: asNumber(raw.requestTimeout, DEFAULTS.requestTimeout, MIN_TIMEOUT),
    types: asList(raw.types) ?? [...DEFAULTS.types],
    privacyLevels: privacyLevels && privacyLevels.length > 0 ? privacyLevels : [...DEFAULTS.privacyLevels],
    include: asList(raw.include) ?? [...DEFAULTS.include],
    exclude: asList(raw.exclude) ?? [...DEFAULTS.exclude],
    popularFirst: asBoolean(raw.popularFirst, DEFAULTS.popularFirst),
    maxModels: asNumber(raw.maxModels, DEFAULTS.maxModels, 0),
    reasoningVariants: asBoolean(raw.reasoningVariants, DEFAULTS.reasoningVariants),
    headers: asHeaders(raw.headers) ?? { ...DEFAULTS.headers },
  }
}
