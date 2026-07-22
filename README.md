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

## 编译构建

前置：Node.js（实测 v24/v25 可用）、Go 1.21+。

```bash
# --- App（前端 + Go 后端）---
npm install
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build      # 前端 → dist/module.js
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/gpx_hermeschat_linux_amd64 ./pkg
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o dist/gpx_hermeschat_linux_arm64 ./pkg

# --- Panel（纯前端）---
cd panel
npm install
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build      # → panel/dist/module.js
```

- `--openssl-legacy-provider`：新版 Node 跑旧版 webpack 所需（否则 `ERR_OSSL_EVP_UNSUPPORTED`）。
- `CGO_ENABLED=0`：静态二进制，兼容 alpine grafana 镜像。

完整从源码构建流程、常见问题见 [INSTALL.md](./INSTALL.md#附录从源码构建)。
