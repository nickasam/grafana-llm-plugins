# Changelog

## 1.1.0

- 首屏自动 AI 解读：面板拿到 query 数据后自动带上下文找 hermes 出一次结构化摘要，用户可追问。
- 用行内容 djb2 hash 去重，dashboard 定时刷新不重复触发。
- 空数据显示占位文案，不打 hermes。
- 兼容 Grafana 反向代理子路径部署（`config.appSubUrl`）。

## 1.0.0

- 首版：dashboard 聊天面板，通过 App 插件后端调用 hermes（OpenAI 兼容 `/v1/chat/completions` + SSE），流式渲染。
