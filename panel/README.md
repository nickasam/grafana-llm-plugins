# Hermes Chat Panel

Grafana 8.5 **面板插件**（`easyalgo-hermeschat-panel`）：把面板 query 结果自动喂给 LLM（OpenAI 兼容 chat completions + SSE，实际对接 hermes-agent）生成结构化解读，用户可继续追问。

依赖同仓库 App 插件 `easyalgo-hermeschat-app` 提供后端 `/resources/chat`（后端要藏 token，Grafana 8.5 Panel 类型不支持自带后端）。**必须先装并启用 App 插件。**

功能特点见根 [README](../README.md#功能)（自动解读 / hash 去重 / 空数据占位 / 子路径兼容）。

## Panel Options

| 字段 | 默认 | 说明 |
|---|---|---|
| App plugin id | `easyalgo-hermeschat-app` | 后端 App 的 id |
| System prompt | 空 | 面板专属，**优先于** App 全局 |
| Auto summary prompt | "请基于以上 ES 数据…结论优先" | 首屏自动解读的问题模板 |
| Max rows in prompt | 20 | 序列化到 prompt 的最大行数（防 prompt 过大） |
| Input placeholder | Type a message… | 输入框占位 |

⚠️ 面板 prompt 明文存 dashboard JSON，**不要写机密**。token 只放 App 设置页的加密字段。

## 构建

```bash
npx prettier --write "src/**/*.{ts,tsx}"
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build
```

安装、启用、常见问题见 [INSTALL.md](../INSTALL.md)。
