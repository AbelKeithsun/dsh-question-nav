# dsh-question-nav

<p align="center">
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.md">English</a> |
  <a href="https://github.com/AbelKeithsun/dsh-question-nav/blob/main/README.zh.md">简体中文</a>
</p>

[DeepSeek Harness (DSH) Web GUI][dsh] 的**会话内提问导航**插件：在对话栏**左侧**
内嵌一列竖排的圆点小按钮 —— 每个圆点对应一个用户提问。鼠标悬停圆点会把该圆点
连同其**上下各两个**圆点一起放大，并弹出磨砂问题卡片显示该提问的**全文**与
**发出时间**；点击圆点则把对话滚动跳到那一提问的位置。

它是外部插件 bundle，**零运行时依赖** —— 浏览器半区（`lib/client.js`）把一切
外部化给 DSH 外壳，加载时只往 GUI 里加一个很小的 bundle。

包名：**`@luziyang2026/dsh-question-nav`**（[npm][npm] · [GitHub][github]）。

## 效果展示

![DSH Web GUI 完整截图：对话栏左侧内嵌提问导航圆点列，每个圆点对应一个用户提问](https://raw.githubusercontent.com/AbelKeithsun/dsh-question-nav/main/docs/images/question-nav-preview.jpg)

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
  导航条自动把选中点居中；磨砂问题卡片（portal 渲染，无原生 `title` 延迟）
  显示 **Turn 编号**（`Turn N`）、该轮提问**全文**（一轮多条提问时全部列出）、
  提问的**发出时间**（当天 `HH:MM`，跨天 `MM-DD HH:MM`，跨年
  `YYYY-MM-DD HH:MM`），以及卡片下方扇形堆叠的一叠模糊卡层。
- **点击**：跳转到该提问；只有这时跳转循环才 `loadOlder()` 扩窗，把**那一页**
  带进视图——绝不会一次性展开整个历史。
- 圆点列空白区域**点穿**到对话内容，不会挡住聊天。

## 环境要求

- DeepSeek Harness Web GUI（可运行的 DSH profile；需要 `dsh` CLI）。
- Node.js `>= 20`（与 DSH SDK peer 范围一致）。

## 安装

从 npm 装预构建包并加进 profile：

```sh
dsh plugin --profile web add @luziyang2026/dsh-question-nav
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
