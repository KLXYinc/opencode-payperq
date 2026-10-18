export interface PayPerQPricing {
  type?: string
  currency?: string
  input_per_1M_tokens?: number | null
  output_per_1M_tokens?: number | null
  cache_read_per_1M_tokens?: number | null
  cache_write_per_1M_tokens?: number | null
  reasoning_per_1M_tokens?: number | null
  image_input_per_1M_tokens?: number | null
}

export interface PayPerQArchitecture {
  modality?: string
  input_modalities?: string[]
  output_modalities?: string[]
  tokenizer?: string
  instruct_type?: string | null
}

export interface PayPerQModel {
  id: string
  object?: string
  type?: string
  owned_by?: string
  name?: string
  description?: string
  created_at?: number
  context_length?: number
  architecture?: PayPerQArchitecture
  supported_parameters?: string[]
  popular?: boolean
  privacyLevel?: string
  pricing?: PayPerQPricing
}

export class PayPerQError extends Error {
  override readonly name = "PayPerQError"
}

export interface CachedCatalog {
  baseURL: string
  fetchedAt: number
  models: PayPerQModel[]
}

export function isCachedCatalog(value: unknown): value is CachedCatalog {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<CachedCatalog>
  return (
    typeof candidate.baseURL === "string" &&
    typeof candidate.fetchedAt === "number" &&
    Array.isArray(candidate.models) &&
    candidate.models.every((model) => typeof (model as PayPerQModel | undefined)?.id === "string")
  )
}

function timeoutSignal(signal: AbortSignal | undefined, timeout: number): AbortSignal {
  const timeout$ = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([signal, timeout$]) : timeout$
}

export async function fetchModels(input: {
  baseURL: string
  types: readonly string[]
  timeout: number
  headers?: Record<string, string>
  signal?: AbortSignal
}): Promise<PayPerQModel[]> {
  const url = new URL(`${input.baseURL.replace(/\/+$/, "")}/models`)
  if (input.types.length > 0) url.searchParams.set("type", input.types.join(","))

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", ...input.headers },
      signal: timeoutSignal(input.signal, input.timeout),
    })
  } catch (cause) {
    if (input.signal?.aborted) throw cause
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new PayPerQError(`Could not reach ${url.origin}: ${detail}`, { cause })
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 200)
    throw new PayPerQError(`Models request failed: HTTP ${response.status}${snippet ? ` - ${snippet}` : ""}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new PayPerQError("Models response was not valid JSON", { cause })
  }

  const rows = Array.isArray(payload) ? payload : (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(rows)) throw new PayPerQError("Models response did not contain a model list")

  const models: PayPerQModel[] = []
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    const model = row as PayPerQModel
    if (typeof model.id !== "string" || model.id === "") continue
    if (model.type !== undefined && !input.types.includes(model.type)) continue
    models.push(model)
  }
  return models
}
