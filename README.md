# opencode-payperq

[PayPerQ](https://ppq.ai) provider for [OpenCode](https://opencode.ai). It adds PayPerQ as an OpenAI-compatible provider and keeps the model list in sync with the live catalog, so new models appear without editing config.

## Install

Add the plugin to your OpenCode config (`opencode.json` or `opencode.jsonc`):

```jsonc
{
  "plugins": ["opencode-payperq"]
}
```

Or with options:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-payperq",
      "options": { "exclude": ["autoclaw"], "refreshInterval": "6h" }
    }
  ]
}
```

Restart OpenCode after changing the config.

## Connect your key

Run `/connect`, choose **PayPerQ**, and paste your API key from [ppq.ai](https://ppq.ai).

Or set an environment variable instead: `PPQ_API_KEY` or `PAYPERQ_API_KEY`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `providerID` | `payperq` | Provider and integration ID. |
| `providerName` | `PayPerQ` | Name shown in `/connect` and `/models`. |
| `apiBaseURL` | `https://api.ppq.ai/v1` | OpenAI-compatible base URL. |
| `apiKey` | – | API key in config. Prefer `/connect` or an env variable. |
| `activation` | `enabled` | `enabled` shows the models before you connect; `auto` hides the provider until a key exists. |
| `refreshInterval` | `6h` | How often to refresh the catalog. Accepts `30s`, `15m`, `6h`, `1d`, or milliseconds. |
| `refreshOnStart` | `true` | Refresh the catalog when OpenCode starts. |
| `requestTimeout` | `20000` | Catalog request timeout in milliseconds. |
| `types` | `["chat"]` | PayPerQ model types to import. |
| `privacyLevels` | `["anon","zdr","e2e"]` | Import only these privacy tiers. |
| `include` | all | Import only models whose ID matches a glob (`*` allowed). |
| `exclude` | none | Skip models whose ID matches a glob. |
| `popularFirst` | `true` | List PayPerQ "popular" models first. |
| `maxModels` | `0` | Cap the number of models (`0` = no cap). |
| `reasoningVariants` | `true` | Add `low`/`medium`/`high` variants where the model supports `reasoning_effort`. |
| `headers` | – | Extra headers for catalog requests. |

## How the model list updates

The catalog is refreshed when OpenCode starts, every `refreshInterval`, and when a PayPerQ model reports as unavailable (at most once a minute). The provider reloads only when the catalog changed. The last good catalog is cached, so the list still works offline.

## Notes

- Models with variable pricing (such as `auto`) show no price, because PayPerQ reports no fixed rate for them.
- `private/*` models run in a trusted execution environment. They support tools and text only.

## License

MIT
