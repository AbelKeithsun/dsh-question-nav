# dsh-question-nav

[DeepSeek Harness (DSH) Web GUI][dsh] 的**会话内提问导航**插件：在对话栏**左侧**
内嵌一列竖排的圆点小按钮 —— 每个圆点对应一个用户提问。鼠标悬停圆点会放大
并**立即**显示该提问的**全文**；点击圆点则把对话滚动跳到那一提问的位置。

它是外部插件 bundle，**零运行时依赖** —— 浏览器半区（`lib/client.js`）把一切
外部化给 DSH 外壳，加载时只往 GUI 里加一个很小的 bundle。

## 功能

- **左缘圆点迷你地图**：内嵌，**不占任何宽度**。
- **垂直居中**在对话栏中。
- **一个圆点 = 一个用户提问**，圆点列上方有提问数量。
- **悬停**：圆点放大 + 即时提示框（portal 渲染，无原生 `title` 延迟）显示**全文**。
- **点击**：跳转到该提问，目标尚未加载时自动 `loadOlder` 扩窗（并落到最近可见行兜底）。
- 圆点列空白区域**点穿**到对话内容，不会挡住聊天。

## 行为说明

- 只索引当前会话；问题列表反映已加载的对话窗口，随历史扩窗补全。
- `user` 与 `steering` 用户消息计为提问。

## 安装（开发 / 本地 checkout）

本仓库是独立插件工程 —— 先构建，再作为可安装的 [bundle][bundle] 加进 profile。

```sh
pnpm install       # 安装 devDependencies（DSH SDK peers、tsdown、vitest）
pnpm build         # tsc 声明 + tsdown client bundle -> lib/
```

加进 profile（需要 `dsh` CLI）：

```sh
dsh plugin --profile web add ./dsh-question-nav
```

发布后也可直接从 npm 装预构建产物：

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-question-nav
```

重启 DSH Web GUI 以加载新 bundle。

## 开发

```sh
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # 构建 host lib/index.js + client lib/client.js
```

## 构建方式

client 半区使用共享的 DSH client-bundle 预设（[`tsdown.client.ts`](tsdown.client.ts)，
从 DSH web-UI 全家桶 vendored），产出
`window.__ModuleLoader__.load({ id, factory })` 闭包工厂产物，CSS Modules 内联，
externals 经加载器模块表解析。

## License

BSD-3-Clause。

[dsh]: https://github.com/deepseek-harness/deepseek-harness
[bundle]: https://github.com/deepseek-harness/deepseek-harness
