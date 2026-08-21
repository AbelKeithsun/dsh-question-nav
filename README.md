# dsh-question-nav

In-session question navigator for the [DeepSeek Harness (DSH) Web GUI][dsh]: a
vertical column of small round dots overlaid on the **left edge** of the
conversation column — one dot per user question. Hover a dot to enlarge it and
see the question's **full text** immediately; click a dot to scroll the chat to
that question.

It is an external plugin bundle with zero runtime dependencies — the browser
half (`lib/client.js`) externalizes everything to the DSH shell, so it adds
only a small bundle to the GUI at load time.

## What it does

- **Left-edge dot minimap** (embedded, not reserving any width).
- **Vertically centered** in the conversation column.
- **One dot = one user question**, with a small count above the dot column.
- **Hover**: the dot enlarges and an instant tooltip (portal-rendered, no
  native-title delay) shows the question's **full text**.
- **Click**: jumps to that question, paging older history when the target is
  not yet in the loaded window (with a nearest-row fallback).
- Empty/left areas of the rail pass pointer events through to the conversation
  (it never blocks the chat).

## Behavior notes

- Only the current session is indexed; the question list reflects the loaded
  chat window and expands as history is paged in.
- `user` and `steering` user messages count as questions.

## Install (development / local checkout)

This repository is a standalone plugin project — build it, then add it to a
profile as an installable [bundle][bundle].

```sh
pnpm install       # install devDependencies (DSH SDK peers, tsdown, vitest)
pnpm build         # tsc declarations + tsdown client bundle -> lib/
```

Add it to a profile (the `dsh` CLI is required):

```sh
dsh plugin --profile web add ./dsh-question-nav
```

Or, once published, install the prebuilt package from npm:

```sh
dsh plugin --profile web add dsh-question-nav
```

Restart the DSH Web GUI to load the new bundle.

## Development

```sh
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # build host lib/index.js + client lib/client.js
```

## How it is built

The client half uses the shared DSH client-bundle preset
([`tsdown.client.ts`](tsdown.client.ts), vendored into this repo), which emits
a `window.__ModuleLoader__.load({ id, factory })` closure-factory
artifact with CSS Modules inlined and externals resolved through the loader
module table.

## License

BSD-3-Clause.

[dsh]: https://github.com/deepseek-harness/deepseek-harness
[bundle]: https://github.com/deepseek-harness/deepseek-harness
