# dsh-question-nav

<p align="center">
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.md">English</a> |
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.zh.md">简体中文</a>
</p>

[DeepSeek Harness (DSH) Web GUI][dsh] 的**会话内提问导航**插件：在对话栏**左侧**
内嵌一列竖排的圆点小按钮 —— 每个圆点对应一个用户提问。鼠标悬停圆点会把该圆点
连同其**上下各两个**圆点一起放大，并弹出**竖排的清晰问题卡片**显示对应提问的
**全文**与**发出时间**（点击任意卡片即可跳转）；点击圆点则把对话滚动跳到那一
提问的位置。

它是外部插件 bundle，**零运行时依赖** —— 浏览器半区（`lib/client.js`）把一切
外部化给 DSH 外壳，加载时只往 GUI 里加一个很小的 bundle。

包名：**`@luziyang2026/dsh-question-nav`**（[npm][npm] · [GitHub][github]）。

## 效果展示

![DSH Web GUI 完整截图：对话栏左侧内嵌提问导航圆点列，每个圆点对应一个用户提问](https://raw.githubusercontent.com/AbelKeithsun/dsh-question-nav/main/assets/screenshots/01-main.png)

插件设置页（导航条对齐 + 每次翻出数量）：

![插件设置页截图：导航条对齐与每次翻出数量两组分段选项](https://raw.githubusercontent.com/AbelKeithsun/dsh-question-nav/main/assets/screenshots/02-settings.png)

## 功能

- **左缘圆点迷你地图**：内嵌，**不占任何宽度**。导航条锚定边**可配置**——
  **设置 → 插件 → 提问导航 → 导航条对齐**可在对话栏左/右缘之间切换。
- **限高 + 可滚动**：圆点列垂直居中，最多占用对话栏高度的 **60%**；会话提问
  更多时在带内上下滚动（滚轮在圆点上或圆点间隙上都能滚）。
- **一个圆点 = 一个含提问的 turn**（与轨迹视图的 Turn 编号严格对齐），
  圆点列上方有圆点数量。
- **完整历史、持久化、不展开渲染窗口**：插件的 host 半面注册
  `questionIndex` 会话投影——投影注册表折叠完整事件日志（只读，对话的
  分页窗口完全不被动），官方 projection-cache 跨重启持久化，新提问通过
  推送帧实时到达。
- **悬停（聚焦）**：圆点与其**上下各两个**圆点一起渐进放大（选中最大），
  选中点仅在被带边缘遮挡时才最小滚动到可视区（不强制居中，逐点浏览时
  点列保持不动）；导航条旁出现一列**竖排的 5 张清晰问题卡片**
  （portal 渲染，无原生 `title` 延迟）——窗口内每个圆点一张卡片，上下排布、
  **互不遮挡**，以选中点为中心垂直居中。每张卡片显示该轮提问**全文**（一轮
  多条提问时全部列出）与提问的**发出时间**（当天 `HH:MM`，跨天
  `MM-DD HH:MM`，跨年 `YYYY-MM-DD HH:MM`）。层级采用**两档聚焦**：
  **中心卡片是焦点**——全对比度文字、品牌色左 accent bar、浮起投影；上下
  四张是干净的**上下文卡**（同背景、更窄、行数更少），hover 时会亮起、
  明示它们同样可以点击。**点击任意卡片即跳转到对应提问**，与点击圆点
  效果一致。
- **点击**：跳转到该提问；只有这时跳转循环才 `loadOlder()` 扩窗，把**那一页**
  带进视图——绝不会一次性展开整个历史。
- **分页式溢出**：圆点太多超出 60% 限高时，原生滚动条被隐藏，点列上下会出现
  两个与圆点同风格的三角按钮——**队列上方 ▲、队列下方 ▼**——每次点击翻出
  下一页隐藏圆点，新翻出的圆点会带一个简短的逐个点弹入动画作为点击反馈。
  每页数量可在 **设置 → 插件 → 提问导航 → 每次翻出数量** 中配置
  （3 / 5 / 8 / 10，默认 5）。三角按钮本身就是溢出提示——只有对应方向还有
  更多圆点时它才会出现（滚轮/触控板同样可滚）；**悬停绝不滚动点列**，
  浏览时点列保持不动。
- 圆点列空白区域**点穿**到对话内容，不会挡住聊天。

## 环境要求

- DeepSeek Harness Web GUI（可运行的 DSH profile；需要 `dsh` CLI）。
- Node.js `>= 20`（与 DSH SDK peer 范围一致）。

## 选择哪个版本

同一个包名下发布**两条版本线**，请按你 GUI 所运行的 DSH 构建选择：

| npm dist-tag | 版本 | 适配的 DSH | 状态 |
|---|---|---|---|
| `latest` | `0.7.x` | `0.1.1-rc.1` SDK 线 | **稳定版** —— 日常使用推荐 |
| `alpha` | `0.8.0-alpha.x` | `0.1.2-alpha.2` SDK 线 | **Alpha 版** —— 适配 Alpha GUI |

- **绝大多数用户装 `latest`（稳定版）**：跟随 DSH 稳定版发布线，日常使用安全。
- **你的 GUI 是 DSH Alpha 版（`0.1.2-alpha.2`）？** 请改用 `alpha` dist-tag。
  稳定版读取的是 `session.getSnapshot().chat` 这个 chat 快照 API，它在 Alpha SDK
  中**已被移除**；`alpha` 版改为通过新的 conversation 服务读取实时对话。若在 Alpha
  GUI 上装稳定版，导航条会降级（只剩投影圆点）。
- **不确定自己是什么 DSH 构建？** 在 GUI 里或 `dsh --version` 看版本号：`0.1.1-rc.x`
  用 `latest`；`0.1.2-alpha.x` 用 `alpha`。

## 安装

从 npm 装预构建包并加进 profile。**请使用与你的 DSH 构建匹配的 dist-tag**（见上）：

**稳定版（DSH `0.1.1-rc.1`，大多数用户）：**

```sh
dsh plugin --profile web add @luziyang2026/dsh-question-nav        # latest → 0.7.x
```

**Alpha 版（DSH `0.1.2-alpha.2` GUI）：**

```sh
dsh plugin --profile web add @luziyang2026/dsh-question-nav@alpha  # alpha → 0.8.0-alpha.x
```

如需锁定具体版本，可显式指定：

```sh
dsh plugin --profile web add @luziyang2026/dsh-question-nav@0.7.7        # 稳定版锁版
dsh plugin --profile web add @luziyang2026/dsh-question-nav@0.8.0-alpha.0 # Alpha 锁版
```

然后重启 DSH Web GUI 以加载新 bundle。

### 从源码构建 / 本地开发

本仓库是独立插件工程 —— 先构建，再作为可安装的 [bundle][bundle] 加进 profile：

```sh
pnpm install       # 安装 devDependencies（DSH SDK peers、tsdown、vitest）
pnpm build         # tsc 声明 + tsdown client bundle -> lib/
```

```sh
dsh plugin --profile web add ./dsh-question-nav
```

## 开发

```sh
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # 构建 host lib/index.js + client lib/client.js
```

## 构建方式

client 半区使用共享的 DSH client-bundle 预设（[`tsdown.client.ts`](tsdown.client.ts)，
vendored 到本项目内），产出
`window.__ModuleLoader__.load({ id, factory })` 闭包工厂产物，CSS Modules 内联，
externals 经加载器模块表解析。

## License

MIT。

[dsh]: https://github.com/deepseek-harness/deepseek-harness
[npm]: https://www.npmjs.com/package/@luziyang2026/dsh-question-nav
[github]: https://github.com/AbelKeithsun/dsh-question-nav
[bundle]: https://github.com/deepseek-harness/deepseek-harness
