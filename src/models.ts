import { Model, type Provider } from "@opencode/plugin"

import type { PayPerQModel } from "./ppq"
import type { PayPerQOptions, PrivacyLevel } from "./options"

type Cost = Model.Info["cost"][number]
type Integer = Model.Info["limit"]["context"]

const usd = (value: number) => value as Cost["input"]
const integer = (value: number) => value as Integer

const INPUT_MODALITIES: Record<string, string> = {
  text: "text",
  image: "image",
  audio: "audio",
  video: "video",
  file: "pdf",
}

const OUTPUT_MODALITIES: Record<string, string> = {
  text: "text",
  image: "image",
}

const EFFORT_LEVELS = ["low", "medium", "high"] as const

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function rate(value: unknown): number | undefined {
  const number = finite(value)
  return number !== undefined && number >= 0 ? number : undefined
}

function positive(value: unknown): number | undefined {
  const number = finite(value)
  return number !== undefined && number > 0 ? number : undefined
}

function formatName(name: string | undefined, id: string): string {
  if (!name) return id
  const cleaned = name.replace(/^[^\p{L}\p{N}]+/u, "").trim()
  return cleaned === "" ? id : cleaned
}

function familyOf(model: PayPerQModel, fallback: string): string {
  const owner = (model.owned_by ?? "").trim()
  if (owner !== "") return owner.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const prefix = model.id.includes("/") ? model.id.slice(0, model.id.indexOf("/")) : ""
  return prefix === "" ? fallback : prefix.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
}

function capabilities(model: PayPerQModel, provider: string): Model.Info["capabilities"] {
  const parameters = model.supported_parameters
  const architecture = model.architecture

  const input = (architecture?.input_modalities ?? []).flatMap((modality) => INPUT_MODALITIES[modality] ?? [])
  const output = (architecture?.output_modalities ?? []).flatMap((modality) => OUTPUT_MODALITIES[modality] ?? [])

  return {
    tools: parameters ? parameters.includes("tools") : true,
    input: [...new Set(input.length > 0 ? input : ["text"])],
    output: [...new Set(output.length > 0 ? output : ["text"])],
    ...(parameters ? { temperature: parameters.includes("temperature") } : {}),
  }
}

function costOf(model: PayPerQModel): Model.Info["cost"] {
  const pricing = model.pricing
  if (!pricing || (pricing.type !== undefined && pricing.type !== "per_token")) return []

  const input = rate(pricing.input_per_1M_tokens)
  const output = rate(pricing.output_per_1M_tokens)
  if (input === undefined || output === undefined) return []

  const cacheRead = rate(pricing.cache_read_per_1M_tokens) ?? input
  const cacheWrite = rate(pricing.cache_write_per_1M_tokens) ?? input
  return [
    {
      input: usd(input),
      output: usd(output),
      cache: { read: usd(cacheRead), write: usd(cacheWrite) },
    },
  ]
}

function variantsOf(model: PayPerQModel, enabled: boolean): Model.Info["variants"] {
  if (!enabled) return []
  if (!model.supported_parameters?.includes("reasoning_effort")) return []
  return EFFORT_LEVELS.map((effort) => ({
    id: Model.VariantID.make(effort),
    settings: { reasoningEffort: effort },
  }))
}

export function toModelInfo(model: PayPerQModel, providerID: Provider.ID, options: PayPerQOptions): Model.Info {
  const base = Model.Info.default(providerID, Model.ID.make(model.id))
  const context = positive(model.context_length) ?? 128_000
  return {
    ...base,
    name: formatName(model.name, model.id),
    family: Model.Family.make(familyOf(model, options.providerID)),
    capabilities: capabilities(model, options.providerID),
    variants: variantsOf(model, options.reasoningVariants),
    time: { released: finite(model.created_at) ?? 0 },
    cost: costOf(model),
    status: "active",
    enabled: true,
    limit: { context: integer(context), output: integer(Math.min(context, 32_000)) },
  }
}

function matches(patterns: readonly string[], value: string): boolean {
  return patterns.some((pattern) => {
    if (pattern === value) return true
    if (!pattern.includes("*")) return false
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
    return new RegExp(`^${escaped}$`, "i").test(value)
  })
}

export function selectModels(models: readonly PayPerQModel[], options: PayPerQOptions): PayPerQModel[] {
  const privacy = new Set<PrivacyLevel>(options.privacyLevels)
  const selected = models.filter((model) => {
    const level = (model.privacyLevel ?? "anon") as PrivacyLevel
    if (!privacy.has(level)) return false
    if (options.include.length > 0 && !matches(options.include, model.id)) return false
    if (options.exclude.length > 0 && matches(options.exclude, model.id)) return false
    return true
  })

  if (options.popularFirst) {
    selected.sort((a, b) => {
      if (Boolean(a.popular) !== Boolean(b.popular)) return a.popular ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  } else {
    selected.sort((a, b) => a.id.localeCompare(b.id))
  }

  return options.maxModels > 0 ? selected.slice(0, options.maxModels) : selected
}

export function fingerprint(models: readonly PayPerQModel[]): string {
  const payload = models
    .map((model) => `${model.id}\u0000${model.name ?? ""}\u0000${model.context_length ?? ""}\u0000${JSON.stringify(model.pricing ?? {})}`)
    .join("\u0001")
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${models.length.toString(36)}-${hash.toString(36)}`
}
