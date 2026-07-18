# Hermes Chat 插件安装文档

本插件由**两个 Grafana 插件**组成：

| 插件 | id | 类型 | 作用 |
|---|---|---|---|
| Hermes Chat（App） | `easyalgo-hermeschat-app` | app（含 Go 后端） | 隐藏 token、代理 hermes-agent、SSE 流式转发。提供 `/resources/chat`。自带整页对话界面。 |
| Hermes Chat（Panel） | `easyalgo-hermeschat-panel` | panel（纯前端） | dashboard 聊天面板：拿到 ES query 结果自动找 hermes 结构化解读，支持追问。 |

> Panel 类型不允许自带后端，token 隐藏必须放 App 后端。所以：
> - 只要导航栏整页对话 → 只装 App
> - 想嵌进 dashboard → App + Panel 都装

---

## 环境要求

- **Grafana 8.5.x**（本插件基于 8.5.27 构建，React 17 时代；勿用于 Grafana 9+）。
- 后端二进制为 Linux `amd64` / `arm64`，按服务器架构选，且**必须 `CGO_ENABLED=0` 静态编译**（alpine 版 grafana 镜像 glibc 较旧，动态链接报 `GLIBC_2.34 not found`）。
- 能访问 hermes-agent 的 OpenAI 兼容接口（`/v1/chat/completions` + SSE）。
- Panel 需要一个已配置好的 Elasticsearch datasource（面板里直接选，插件本身不管 ES 连接）。
- 反向代理子路径部署（如 `/grafana`）需同时配 `GF_SERVER_ROOT_URL=<url>/grafana` **和** `GF_SERVER_SERVE_FROM_SUB_PATH=true`；前端已用 `config.appSubUrl` 自动拼 fetch URL，无需改代码。

---

## 一、产物结构

```
dist/                              panel/dist/
├── plugin.json                    ├── plugin.json
├── module.js(.map)                ├── module.js(.map)
├── img/logo.svg                   └── img/logo.svg
├── gpx_hermeschat_linux_amd64
└── gpx_hermeschat_linux_arm64     # backend:true, executable:gpx_hermeschat
```

从源码构建见文末 [附录](#附录从源码构建)。

---

## 二、安装

插件目录默认 `/var/lib/grafana/plugins/<plugin-id>/`（**目录名必须等于 id**）。插件未签名需显式放行。

### 方式 A：Docker

```bash
# 3000 被占则改 3300。挂载目录需保证容器里 grafana uid 472 能读：chmod -R o+rX <host-path>。
docker run -d --name hermeschat-grafana -p 3300:3000 \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=easyalgo-hermeschat-app,easyalgo-hermeschat-panel \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
  -v /opt/hermeschat/dist:/var/lib/grafana/plugins/easyalgo-hermeschat-app \
  -v /opt/hermeschat/panel-dist:/var/lib/grafana/plugins/easyalgo-hermeschat-panel \
  grafana/grafana-oss:8.5.27
```

仓库根 `docker-compose.yml` 只挂了 App，装 Panel 时加一行 volume 和一个 id。用 `docker compose up -d`；若命令不存在退回 `docker-compose up -d` 或上面的 `docker run`。

> 匿名 Admin 仅演示，生产删掉 `GF_AUTH_ANONYMOUS_*`。

### 方式 B：已有 Grafana（原生）

```bash
cp -r dist        /var/lib/grafana/plugins/easyalgo-hermeschat-app
cp -r panel/dist  /var/lib/grafana/plugins/easyalgo-hermeschat-panel
chmod +x   /var/lib/grafana/plugins/easyalgo-hermeschat-app/gpx_hermeschat_linux_*
chmod -R o+rX /var/lib/grafana/plugins/easyalgo-hermeschat-*
```

`/etc/grafana/grafana.ini`：
```ini
[plugins]
allow_loading_unsigned_plugins = easyalgo-hermeschat-app,easyalgo-hermeschat-panel
```
（或 env `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`。）然后 `systemctl restart grafana-server`。

---

## 三、启用与配置

### 1. 启用 App 插件（Panel 不需要）

Configuration → Plugins → Hermes Chat → **Enable**，或 API：
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"enabled":true,"pinned":true,"jsonData":{}}' \
  http://admin:admin@<host>:3000/api/plugins/easyalgo-hermeschat-app/settings
```

### 2. 配置 hermes 连接

App 插件 **Settings**（Admin）：

| 字段 | 说明 |
|---|---|
| Hermes URL | `http://<host>:8642/v1/chat/completions` |
| Model | `hermes-agent` |
| API token | Bearer token，加密存 `secureJsonData`，绝不下发前端 |
| System prompt | 可选全局前缀 |

### 3. 使用

- **整页对话**：`http://<host>:3000/a/easyalgo-hermeschat-app`
- **Dashboard 面板**：Add panel → Visualization 选 **Hermes Chat** → 选 Elasticsearch datasource + 写 query。查到数据后面板会**自动**带上前 N 行找 hermes 出一次结构化解读，用户可在下方追问。

### 4. Panel 配置项

见 [`panel/README.md`](./panel/README.md#panel-options)。要点：`systemPrompt` 覆盖 App 全局；面板 prompt 明文存 dashboard JSON，**不要写机密**（token 只放 App 设置页的加密字段）。

---

## 四、验证

```bash
# host 用 3000 或映射的 3300；子路径部署带 /grafana 前缀
curl -s -o /dev/null -w "health=%{http_code}\n"   http://<host>/api/health
curl -s -o /dev/null -w "ping=%{http_code}\n"     http://admin:admin@<host>/api/plugins/easyalgo-hermeschat-app/resources/ping
curl -s -o /dev/null -w "panel=%{http_code}\n"    http://<host>/public/plugins/easyalgo-hermeschat-panel/module.js
```

Grafana 日志应有：
```
Plugin registered  pluginId=easyalgo-hermeschat-app
Plugin registered  pluginId=easyalgo-hermeschat-panel
```

---

## 五、常见问题

| 现象 | 排查 |
|---|---|
| 看不到插件 | ①未放行未签名（`allow_loading_unsigned_plugins`）；②App 未 Enable；③目录名 ≠ id |
| 后端 pluginId 只注册不启动，日志 `GLIBC_2.34 not found` | 后端未用 `CGO_ENABLED=0`；重新静态编译覆盖二进制 |
| `permission denied` on plugin dir | 宿主机目录 grafana uid 472 读不到，`chmod -R o+rX` 整个 dist |
| 子路径下前端 fetch 404 `/api/plugins/...` | Grafana 缺 `GF_SERVER_SERVE_FROM_SUB_PATH=true`；配上后 Grafana 内部 mux 才挂到子路径 |
| `hermes URL is not configured` | App 设置页 Hermes URL 没填 |
| `failed to reach hermes` | 后端网络到 hermes 不通（安全组/防火墙） |
| `resources/ping` 非 200 | 二进制没执行权限、架构不匹配、`plugin.json` `executable` 名对不上 |
| 流式不逐字出现 | 反向代理开了 buffering，本插件后端逐块下发，需关掉代理层 buffering |

---

## 附录：从源码构建

前置：Node.js（实测 v24/v25 可用）、Go 1.21+。

```bash
# --- App ---
npm install
npx prettier --write "src/**/*.{ts,tsx}"
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/gpx_hermeschat_linux_amd64 ./pkg
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o dist/gpx_hermeschat_linux_arm64 ./pkg

# --- Panel ---
cd panel
npm install --save-dev @grafana/toolkit@8.5.27 @grafana/data@8.5.27 @grafana/ui@8.5.27 \
                        @grafana/runtime@8.5.27 @emotion/css@11.9.0 \
                        react@17.0.2 react-dom@17.0.2 typescript@4.5.5 \
                        @types/react@17.0.44 @types/react-dom@17.0.15   # 若 package.json 尚未列
npx prettier --write "src/**/*.{ts,tsx}"
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build
```

- `--openssl-legacy-provider`：新版 Node 跑旧版 webpack（否则 `ERR_OSSL_EVP_UNSUPPORTED`）。
- `CGO_ENABLED=0`：静态二进制，兼容 alpine grafana 镜像。
- npm install 会输出大量 deprecated 警告，可忽略；只需最后 `added N packages` 即成功。
