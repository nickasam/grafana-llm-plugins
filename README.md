# Hermes Chat for Grafana 8.5

Grafana **8.5.27** 双插件：
- **App**（`easyalgo-hermeschat-app`）— Go 后端代理 LLM 服务，隐藏 token、逐块流式转发；自带整页对话界面。
- **Panel**（`easyalgo-hermeschat-panel`）— dashboard 面板：拿到 query 结果后**自动带上下文找 LLM 做一次结构化解读**，用户可继续追问。

**接口协议**：**OpenAI 兼容 chat completions（SSE）** —— `POST /v1/chat/completions`，请求体 `{model, stream:true, messages:[...]}`，响应逐行 `data:` SSE。任何遵循此协议的模型服务都能接入（本项目实际对接 hermes-agent）。

## 功能

- App / Panel 都流式打字，`response.body.getReader()` 逐块渲染 Markdown。
- Panel 首屏自动解读：`data.state=Done` 且非空 → 序列化前 N 行 + `autoSummaryPrompt` → 一次请求；行内容 djb2 hash 去重，定时刷新不重复烧 token。
- 追问：全量 `messages[]` 续聊，首轮上下文自然带上。
- 空数据显示占位文案，不发请求。
- 兼容 Grafana 反向代理子路径部署（`config.appSubUrl`）。

## 使用

安装 → 启用 App 插件 → 在 Settings 里填 Hermes URL / model / token。详见 [INSTALL.md](./INSTALL.md)。
