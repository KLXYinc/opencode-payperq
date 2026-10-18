import { Integration, Plugin, Provider } from "@opencode/plugin"

import { BalanceRPC, fetchBalance, type BalanceResult } from "./balance"
import { fingerprint, selectModels, toModelInfo } from "./models"
import { parseOptions } from "./options"
import { fetchModels, isCachedCatalog, type PayPerQModel } from "./ppq"

const STORAGE_KEY = "catalog/v1"
const ENV_NAMES = ["PPQ_API_KEY", "PAYPERQ_API_KEY"]
const MISSING_MODEL_COOLDOWN = 60_000
const SUBSCRIBE_RETRY_DELAY = 10_000

export default Plugin.define({
  id: "payperq",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const providerID = Provider.ID.make(options.providerID)
    const integrationID = Integration.ID.make(options.providerID)
    const log = (message: string, detail?: unknown) =>
      detail === undefined ? console.error(`[payperq] ${message}`) : console.error(`[payperq] ${message}`, detail)

    let inventory: PayPerQModel[] = []
    let inventoryHash = ""

    const adopt = (models: PayPerQModel[]) => {
      inventory = models
      inventoryHash = fingerprint(models)
    }

    try {
      const cached = await ctx.storage.get(STORAGE_KEY)
      if (isCachedCatalog(cached) && cached.baseURL === options.apiBaseURL) {
        adopt(selectModels(cached.models, options))
      }
    } catch (error) {
      log("could not read the cached catalog", error)
    }

    await ctx.integration.transform((editor) => {
      editor.update(options.providerID, (integration) => {
        integration.name = options.providerName
      })
      editor.method.update({
        integrationID: options.providerID,
        method: { type: "key", label: `${options.providerName} API key` },
      })
      editor.method.update({
        integrationID: options.providerID,
        method: { type: "env", names: [...ENV_NAMES] },
      })
    })

    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: options.providerName,
          activation: options.activation,
          package: "@opencode/ai/providers/openai-compatible",
          integrationID,
          settings: {
            baseURL: options.apiBaseURL,
            ...(options.apiKey ? { apiKey: options.apiKey } : {}),
          },
          ...(Object.keys(options.headers).length > 0 ? { headers: { ...options.headers } } : {}),
        },
        models: inventory.map((model) => toModelInfo(model, providerID, options)),
      })
    })

    const controller = new AbortController()
    let inflight: Promise<void> | undefined

    const refresh = (reason: string): Promise<void> => {
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const models = await fetchModels({
            baseURL: options.apiBaseURL,
            types: options.types,
            timeout: options.requestTimeout,
            headers: options.headers,
            signal: controller.signal,
          })
          const next = selectModels(models, options)
          if (fingerprint(next) === inventoryHash) return

          adopt(next)
          const snapshot = { baseURL: options.apiBaseURL, fetchedAt: Date.now(), models: next }
          await ctx.storage.set(STORAGE_KEY, snapshot as unknown as Parameters<Plugin.Context["storage"]["set"]>[1])
          await ctx.provider.reload()
          log(`catalog updated (${reason}): ${next.length} model(s)`)
        } catch (error) {
          if (!controller.signal.aborted) log(`catalog refresh (${reason}) failed`, error)
        } finally {
          inflight = undefined
        }
      })()
      return inflight
    }

    if (options.refreshOnStart) void refresh("service start")

    const timer: ReturnType<typeof setInterval> = setInterval(() => void refresh("interval"), options.refreshInterval)
    const unref = (timer as { unref?: () => void }).unref
    if (typeof unref === "function") unref.call(timer)

    const missingPrefix = `Model unavailable: ${options.providerID}/`
    let lastMissingRefresh = 0
    const onFailure = (error: { type: string; message: string } | undefined) => {
      if (!error || error.type !== "provider.no-route" || !error.message.startsWith(missingPrefix)) return
      const now = Date.now()
      if (now - lastMissingRefresh < MISSING_MODEL_COOLDOWN) return
      lastMissingRefresh = now
      void refresh("model unavailable")
    }

    void (async () => {
      while (!controller.signal.aborted) {
        try {
          for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
            if (event.type === "session.step.failed" || event.type === "session.execution.failed") {
              onFailure(event.data.error)
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          log("event stream failed, retrying", error)
        }
        await new Promise((resolve) => setTimeout(resolve, SUBSCRIBE_RETRY_DELAY))
      }
    })()

    const rpc = await ctx.rpc.register(BalanceRPC, {
      balance: async (_input, { signal }): Promise<BalanceResult> => {
        const connection = await ctx.integration.connection.active(options.providerID)
        if (!connection) return { connected: false }
        const credential = await ctx.integration.connection.resolve(connection)
        if (!credential || credential.type !== "key") return { connected: true, error: "no API key" }
        try {
          return { connected: true, balance: await fetchBalance(options.apiBaseURL, credential.key, signal) }
        } catch (error) {
          return { connected: true, error: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    return async () => {
      clearInterval(timer)
      controller.abort()
      await rpc.dispose()
    }
  },
})
