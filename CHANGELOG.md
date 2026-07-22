# Changelog

## 1.1.1

- Panel：新增可配置的对话轮次上限与提示词。

## 1.1.0

- Panel：首屏自动 AI 解读 ES query 结果（行内容 hash 去重，避免定时刷新重复调用）。
- 兼容 Grafana 反向代理子路径部署（fetch 用 `config.appSubUrl` 拼前缀）。
- 后端二进制改为 `CGO_ENABLED=0` 静态编译，兼容 alpine 版 grafana 镜像。

## 1.0.0

- 首版：流式对话 UI + Go SSE 代理后端（OpenAI 兼容 `/v1/chat/completions`）+ Admin 设置页。
