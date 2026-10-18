import { Rpc } from "@opencode/plugin"

export const BalanceRPC = Rpc.define({
  id: "payperq",
  methods: {
    balance: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          balance: { type: "number" },
          error: { type: "string" },
        },
        required: ["connected"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})

export interface BalanceResult {
  connected: boolean
  balance?: number
  error?: string
}

export async function fetchBalance(baseURL: string, key: string, signal?: AbortSignal): Promise<number> {
  const origin = new URL(baseURL).origin
  const response = await fetch(`${origin}/credits/balance`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: "{}",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = (await response.json()) as { balance?: unknown }
  if (typeof payload.balance !== "number" || !Number.isFinite(payload.balance)) throw new Error("no balance in response")
  return payload.balance
}
