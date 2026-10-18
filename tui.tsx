import { Plugin } from "@opencode/plugin/tui"
import { createSignal, onCleanup } from "solid-js"

const REFRESH_MS = 60_000

interface BalanceReply {
  connected: boolean
  balance?: number
  error?: string
}

export default Plugin.define({
  id: "payperq",
  async setup(ctx) {
    const providerID = String(ctx.options.providerID ?? "payperq")
    const [text, setText] = createSignal<string | undefined>(undefined)

    const load = async () => {
      try {
        const reply = (await ctx.client.rpc.call({
          rpcID: "payperq",
          method: "balance",
          input: {},
        })).output as BalanceReply | undefined
        if (!reply || !reply.connected || reply.error !== undefined || reply.balance === undefined) {
          return setText(undefined)
        }
        setText(`$${reply.balance.toFixed(2)}`)
      } catch {
        setText(undefined)
      }
    }

    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)

    const dispose = ctx.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const selected = ctx.ui.model.current()
        if (selected?.providerID !== providerID || text() === undefined) return null
        return <text>{` ${text()}`}</text>
      },
    })

    return () => {
      clearInterval(timer)
      dispose()
    }
  },
})
