# DSH 会话内「提问速览」右侧导航条 — 设计文档

- 日期：2026-08-21
- 插件包名：`@linxin666/dsh-client-ui-question-nav`
- 形态：DSH web client 插件（外部 bundle，无 DSH 源码改动）

## 1. 目标

在**单个会话**的对话页，于**对话区右侧**渲染一条**竖排小按钮列**：本会话中用户每问的一个问题对应一个小按钮。点击任意按钮，对话区滚动跳转到那一条提问的位置。功能类似"这个对话的问题目录导航条"。

**明确不做（YAGNI）**：
- 不做跨会话/全局历史搜索（那是另一个需求）。
- 不做 host 侧投影索引（dsh-trail 的 M1 能力）。本插件纯 client 侧读会话快照即可。
- 不做会话谱系/分叉导航。
- 不做按钮内容的自动高亮（当前滚动位置对应按钮），留作后续可选增强。

## 2. 用户确认的决策

| 项 | 决策 |
|---|---|
| 条带默认形态 | 默认展开；可折叠成细窄图标轨道，再点回展开 |
| 按钮显示内容 | 问题开头截断文字（约 10–20 字，超长省略号；悬停 title 显示完整提问） |

## 3. 架构

单插件，双半区：

- **Host 半区** `src/index.ts`：空 `apply`（cordis 需要真实行），浏览器功能全在 client 半区。对齐 dsh-chat-recovery 的做法。
- **Client 半区** `src/client.ts`：插件入口，注册 UI 与逻辑。

### 3.1 数据来源（已确认 API）

- 当前会话 id：`ctx.sessions.list.getSnapshot().current`。
- 会话快照：`ctx.sessions.binding(id)?.session.getSnapshot()`。
- 会话快照里的 `chat.nodes`：`ChatNodeStore`（当前已加载窗口的 chat 节点），每个节点含 `key`、`anchorSeq`、`turn`、`seq`、`time`、`content`、`visibility`、`location`。
- 用户提问节点：`kind === 'user'`（轮首用户提问）；`kind === 'steering'`（并入进行中回合的用户消息）作为可选纳入。
- 按钮文本：取节点 `content` 首块文本，截断。

### 3.2 放置方式（复用 dsh-trail 已验证的 `shell.overlay` 通道）

- `ctx.slots.register({ name: 'shell.overlay', ... }, QuestionNavStrip)` 注册进帧级浮层 list 插槽（`ui-layout` 声明，additive）。
- 锚定对话列根：`document.querySelector('[data-slot="conversation"] > div[data-phase]')`。
- 条带 `position: absolute` 贴对话列右缘；通过 `ResizeObserver` 跟随对话列宽高。
- 给对话根设 `padding-right` 让出空间（镜像 dsh-trail 左侧 `padding-left` 的做法）；折叠时清空。

### 3.3 点击跳转（复用 dsh-trail 跳转逻辑）

- 滚动区：`[data-conversation-scroll]`（或回退 `.scroll`）。
- 目标行：在滚动区内 `querySelectorAll('[data-chat-anchor-key]')` 找 `dataset.chatAnchorKey === targetKey`。
- `row.scrollIntoView({ block: 'start' })`。
- 目标不在已加载窗口时：循环 `face.loadOlder()` 扩窗重试（`hasMore` 守卫 + 总超时 + 轮询等待渲染），找不到则落到最近可见行（fallback）。

### 3.4 条带形态

- 展开：竖排小按钮列表，每按钮一行，显示"问题开头截断文字"。
- 折叠：缩成细窄图标轨道（约 28px），点击展开。
- 宽度/折叠态存 `localStorage` 单 key（对齐 dsh-trail `readLeftColumnPrefs`/`writeLeftColumnPrefs`），读写失败静默回退默认。
- 默认宽度约 280px；拖拽宽度调节本版先不做（留接口）。

### 3.5 监听

- `ctx.sessions.list.subscribe`：当前会话变化时重挂。
- `binding.session.subscribe`：会话内容变化时刷新按钮列表。
- 会话不存在/空白（`summary.blank`）时不渲染条带。

## 4. 错误处理

- apply 阶段不抛错（外部插件不能拖垮 GUI），对齐 dsh-chat-recovery 的 `apply-guard`。
- 数据读取全部可选链 + 缺省回退；拿不到快照则不渲染。
- 跳转失败（目标未加载/超时/隐藏）给出简短提示，不影响会话。
- CSS 注入失败静默。

## 5. 测试

- 纯逻辑（节点过滤、文本截断、宽度钳制、localStorage 读写）拆成无 React/DOM 模块，配 vitest 单测。
- 跳转匹配逻辑（matchTarget/fallback）参照 dsh-trail 的 `jump.ts` 思路做单测。
- 冒烟：装进独立 profile（如 `question-nav-test`）`--dump-config` 断言组合行存在，再启动抓日志。

## 6. 交付路径

1. 在 `/Users/mac/Documents/workspace/dsh-question-nav` 建插件包（`package.json`、`src/index.ts`、`src/client.ts`、`cordis.patch.yml`、`tsconfig`、`tsdown` 配置、单测）。
2. 用 DSH checkout 的 `packages/client/tsdown.client.ts` 预设构建 `lib/client.js`（`__ModuleLoader__.load` 格式），host 侧 `tsc` 产出 `lib/index.js`。
3. 将包 install/link 进 web profile 的 `node_modules/@linxin666/dsh-client-ui-question-nav`。
4. 在 web profile `cordis.patch.yml` 的 insert 段加一行：
   ```yaml
   - insert:
       - id: question-nav
         name: '@linxin666/dsh-client-ui-question-nav'
   ```
5. 重启/刷新 GUI 验证：进入一个会话，右侧出现提问列表，点击跳转。
6. 验证通过后按用户项目规范提交 git。

## 7. 未决 / 后续

- 当前滚动位置对应按钮的高亮。
- 拖拽调宽度。
- 长会话的全量问题加载策略（loadOlder 循环的体验优化）。
