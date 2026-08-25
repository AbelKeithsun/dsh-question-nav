# dsh-question-nav

<p align="center">
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.md">English</a> |
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.zh.md">简体中文</a>
</p>

In-session question navigator for the [DeepSeek Harness (DSH) Web GUI][dsh]: a
vertical column of small round dots overlaid on the **left edge** of the
conversation column — one dot per user question. Hover a dot to enlarge it and
see the question's **full text** immediately; click a dot to scroll the chat to
that question.

It is an external plugin bundle with zero runtime dependencies — the browser
half (`lib/client.js`) externalizes everything to the DSH shell, so it adds
only a small bundle to the GUI at load time.

Package: **`@luziyang2026/dsh-question-nav`** ([npm][npm] · [GitHub][github]).

## Preview

![Left-edge dot minimap with a hover tooltip showing the turn label and full question text](https://raw.githubusercontent.com/AbelKeithsun/dsh-question-nav/main/docs/images/question-nav-preview.jpg)

## What it does

- **Left-edge dot minimap** (embedded, not reserving any width).
- **Vertically centered** in the conversation column.
- **One dot = one turn that asked a question** (strictly aligned with the
  Trajectory view's turn numbering), with a small count above the dot column.
- **Full history, persisted, no render-window expansion**: the plugin's host
  half registers a `questionIndex` session projection — the projection
  registry folds the whole event log (read-only, the chat's paged window is
  never touched), the official projection cache persists it across restarts,
  and push frames deliver new questions live.
- **Hover**: the dot enlarges and an instant tooltip (portal-rendered, no
  native-title delay) shows the **turn label** (`Turn N`) plus the turn's
  **full question text** (all of them, when one turn batched several).
- **Click**: jumps to that question. Only then does the jump loop page the
  window (`loadOlder()`) to bring that specific page into view — never the
  whole history up front.
- Empty/left areas of the rail pass pointer events through to the conversation
  (it never blocks the chat).

## Requirements

- DeepSeek Harness Web GUI (a runnable DSH profile; the `dsh` CLI).
- Node.js `>= 20` (matches the DSH SDK peer range).

## Install

Install the prebuilt package from npm and add it to a profile:

```sh
dsh plugin --profile web add @luziyang2026/dsh-question-nav
```

Then restart the DSH Web GUI to load the new bundle.

### Build from source / develop locally

This repository is a standalone plugin project — build it, then add the
checkout to a profile as an installable [bundle][bundle]:

```sh
pnpm install       # install devDependencies (DSH SDK peers, tsdown, vitest)
pnpm build         # tsc declarations + tsdown client bundle -> lib/
```

```sh
dsh plugin --profile web add ./dsh-question-nav
```

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

MIT.

[dsh]: https://github.com/deepseek-harness/deepseek-harness
[npm]: https://www.npmjs.com/package/@luziyang2026/dsh-question-nav
[github]: https://github.com/AbelKeithsun/dsh-question-nav
[bundle]: https://github.com/deepseek-harness/deepseek-harness
