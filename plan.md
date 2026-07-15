# Grafana 8.5.27 hermes 对话插件 — 实施计划

## 0. 目标

一个**通用的对话插件**：用户输入 prompt，拼上**平台设置里配置的 prompt（前缀/系统提示）**，发给 hermes-agent，**流式输出** hermes 的原始返回；支持**多轮续聊**。

- 不再要求 hermes 返回 JSON、不再解析成结构化卡片、不再写 ES / 采纳 / 历史落库。
- Grafana **8.5.27**（React 17 时代：不能用 React 18 / create-plugin / @grafana ^9，否则白屏）。
- hermes-agent：OpenAI 兼容 `/v1/chat/completions` + SSE（见 §2）。
- backend 只做**代理 + 流式转发**（隐藏 token、同源、逐块下发）。

### 工作流

```
用户在对话框输入 → [平台前缀 prompt] + [多轮 messages] + [本次用户输入]
  → backend POST hermes (stream) → 逐块 SSE 转发 → 前端追加渲染
  → 用户继续输入 → 带上下文续聊
```

---

## 1. 数据流与接口

### 1.1 前端 → backend
- `POST /api/plugins/<id>/resources/chat`，body：`{ messages: [{role, content}, ...] }`（完整多轮上下文，前端维护）。
- backend 在发往 hermes 前，把设置页的**系统 prompt** 作为首条 `system`（或 `user`）消息注入（若配置了）。
- 响应：**流式**。backend 读 hermes SSE，逐块把 `delta.content` 文本原样 `flush` 给前端（纯文本流，或转发 SSE 行）。

### 1.2 backend → hermes（见 §2）
- `messages` = `[可选平台system] + 前端传来的多轮 messages`。
- `stream:true`，读 SSE，聚合/转发 `choices[].delta.content`，遇 `data:[DONE]` 结束。

### 1.3 不做的事
- ❌ JSON 契约 / `extractJSONObject` / `DiagnosisResult` 解析
- ❌ ES 读写 / `EsTaskDoc` / adopt / history / 多用户隔离落库
- ❌ ClickHouse 任务元数据

---

## 2. hermes-agent 接口（OpenAI 兼容 + SSE）

- **接口**：`POST /v1/chat/completions`，`stream:true` 走 SSE。生产地址 `http://hermes.easyalgo.jd.com:8643/v1/chat/completions`。
- **请求体**：`{ model:"hermes-agent", stream:true, messages:[...] }`。
- **认证**：头 `Authorization: Bearer <token>`。
- **解析**：逐行取 `data:` 行，取 `choices[].delta.content` 增量文本；`data:[DONE]` 终止。
- **多轮**：靠 `messages` 数组（user/assistant 交替）带上下文，非 session。

---

## 3. 架构

- **App 插件**（整页对话 UI + 导航 + 设置页）+ **Go backend**（隐藏 token、连 hermes、流式转发）。
- 浏览器 → Grafana 同源 `/api/plugins/<id>/resources/chat`；backend → hermes。token 只在 backend。

### 流式关键点
- Grafana backend 插件 `CallResource` 支持**多次 `sender.Send()`** 分块下发；Grafana HTTP 层会 flush。据此实现"边收边发"。
- backend 每收到一段 hermes `delta.content` 就 `Send` 一个 body 块；前端用 `fetch` + `ReadableStream`（`getReader()`）逐块读、追加到当前 assistant 气泡。
- 若 `getBackendSrv()` 不支持流式读，则前端直接 `fetch('/api/plugins/<id>/resources/chat')` 拿 `response.body` reader（同源带 cookie）。

### 前端（React 17.0.2）
- 只用 8.5 确有的组件：`Button`/`TextArea`/`Input`/`Icon`/`Spinner`/`Alert`/`VerticalGroup`/`HorizontalGroup`；样式 `useStyles2`。
- 状态：`useReducer`，含 `messages[]`（user/assistant）、`input`、`streaming`。
- 渲染：聊天气泡列表；流式时把增量拼到最后一条 assistant 气泡；可用 `renderMarkdown` 渲染。
- 无 Redux/zustand。

### 后端
- `CallResource`：路由 `/chat`（流式）+ `/ping`（健康）。作 HTTP 客户端连 hermes。
- hermes 地址/model/token/系统 prompt 进 `jsonData`/`secureJsonData`。
- SSE 读超时设足（多 skill 分析可能几十秒~分钟）。

### 构建/部署
- **本地 `@grafana/toolkit` 构建即可**（node v25 实测可跑通 webpack；只需保证 prettier 格式通过，否则 lint 阶段报错）。node16 非必需。
- 后端交叉编译 `GOOS=linux GOARCH=amd64`（+arm64）；`plugin.json` `backend:true`、`executable` 名对齐、id 与 dist 目录名一致。
- 实机无 Grafana → Docker 起 `grafana/grafana-oss:8.5.27`，`dist/` 挂 volume。
- 未签名放行：env `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<id>`（漏配则插件不显示，最高频事故）。
- 安全：token 不入库/文档/前端/prompt；设置页限 Admin。

---

## 4. 实施顺序

- **S1**：改 backend——删诊断/ES 逻辑，`/chat` 读 hermes SSE 并逐块 `sender.Send()` 转发；`/ping` 健康。
- **S2**：改前端——聊天页（气泡 + 输入框 + 发送），`fetch` 流式读 `response.body`，增量渲染。
- **S3**：设置页——hermes URL/model/token(SecretInput) + 系统 prompt(TextArea)。
- **S4**：本地 toolkit 构建（先 `prettier --write`）+ 交叉编译 backend → dist 完整。
- **S5**：Docker 起 8.5.27 挂 dist → 导航出现页面 → 配置 hermes → 走通流式对话。
- **S6**：生产网联调真 hermes（明天）。

---

## 5. 关键风险

1. **流式能否穿透 Grafana resource 代理**：`CallResource` 多次 `Send` 是否被 Grafana 及时 flush 给浏览器——需实测；退路是「后端聚合完整再一次性返回」（体验退化但可用）。
2. 前端 `getBackendSrv` 可能不暴露流；改用原生 `fetch` + `response.body.getReader()`（同源 cookie 自动带）。
3. 未签名放行 env 漏配 → 插件不显示。
4. 诊断耗时长 → SSE/HTTP 读超时设足（10min）；前端明确"生成中"态 + 可中断。
5. token 不入文档/代码/前端/prompt。
6. Grafana :3000 需确认云安全组 + firewalld。

---

## 6. 已确认决策

1. **系统 prompt 配置入口**：插件设置页（`addConfigPage()`，限 Admin），存 `jsonData`。
2. **返回不再要求 JSON**：流式透传 hermes 文本；前端 Markdown 渲染。
3. **不落 ES**：本版无历史/采纳/多用户隔离落库。
4. **plugin id**：`<org>-<name>-app`（全小写连字符，`-app` 结尾，与 dist 目录名一致）。
5. **多轮上下文**：前端维护 `messages`，每次请求全量带上；backend 前置可选系统 prompt。
6. **实机 hermes**：地址/token 进 `secureJsonData`；实机无可用 hermes 时可远端另起。
