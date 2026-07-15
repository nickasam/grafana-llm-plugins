# Hermes Chat 插件安装文档

本插件由**两个 Grafana 插件**组成，配合使用：

| 插件 | id | 类型 | 作用 |
|---|---|---|---|
| Hermes Chat（App） | `easyalgo-hermeschat-app` | app（含 Go 后端） | 隐藏 token、连接 hermes-agent、流式转发 SSE。提供 `/resources/chat` 接口。也自带一个整页对话界面。 |
| Hermes Chat（Panel） | `easyalgo-hermeschat-panel` | panel（纯前端） | 可拖到 dashboard 上的聊天面板。通过 App 插件的后端收发消息。 |

> **为什么是两个插件？** Grafana 8.5 的 **Panel 插件不允许自带后端**，只有 app / datasource 类型能带。而"隐藏 token + 流式转发"必须在后端完成，所以后端放在 App 插件里，Panel 只做界面并复用 App 的后端。
>
> - 只想要**导航栏里的整页对话** → 只装 App 插件即可。
> - 想把对话**嵌进 dashboard 面板** → App + Panel 都要装（App 提供后端，Panel 提供面板）。

---

## 环境要求

- **Grafana 8.5.x**（本插件基于 8.5.27 构建，React 17 时代；请勿用于 Grafana 9+）。
- 后端二进制为 **Linux**，提供 `amd64` 和 `arm64` 两种，按服务器 CPU 架构选择。
- 能访问 hermes-agent 的 OpenAI 兼容接口（`/v1/chat/completions` + SSE）。

---

## 一、拿到插件产物

每个插件的 `dist/` 目录就是可直接部署的成品：

**App 插件 `dist/`：**
```
dist/
├── plugin.json                    # 插件描述（backend:true, executable:gpx_hermeschat）
├── module.js                      # 前端
├── img/logo.svg
├── gpx_hermeschat_linux_amd64     # 后端二进制（x86_64）
└── gpx_hermeschat_linux_arm64     # 后端二进制（arm64）
```

**Panel 插件 `panel/dist/`：**
```
panel/dist/
├── plugin.json
├── module.js
└── img/logo.svg
```

如需从源码重新构建，见文末 [附录：从源码构建](#附录从源码构建)。

---

## 二、安装方式

Grafana 的插件目录默认是 `/var/lib/grafana/plugins`（每个插件一个子目录，**目录名必须等于插件 id**）。因为插件未签名，还必须显式放行，否则**插件不会加载**（最常见的事故）。

### 方式 A：Docker（推荐用于快速预览）

假设两个 `dist/` 已放到宿主机的 `/opt/hermeschat/dist`（App）和 `/opt/hermeschat/panel-dist`（Panel）。

```bash
docker run -d --name hermeschat-grafana -p 3000:3000 \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=easyalgo-hermeschat-app,easyalgo-hermeschat-panel \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
  -v /opt/hermeschat/dist:/var/lib/grafana/plugins/easyalgo-hermeschat-app \
  -v /opt/hermeschat/panel-dist:/var/lib/grafana/plugins/easyalgo-hermeschat-panel \
  grafana/grafana-oss:8.5.27
```

或使用仓库里的 `docker-compose.yml`（默认只挂了 App 插件，需要 Panel 时按上面示例加一行 volume 和 id）：

```bash
docker compose up -d
```

> 匿名 Admin 登录仅用于演示。生产环境请去掉 `GF_AUTH_ANONYMOUS_*`，用正常账号登录。

### 方式 B：已有的 Grafana 实例（原生安装）

1. **拷贝插件目录**（目录名必须与 id 一致）：
   ```bash
   cp -r dist        /var/lib/grafana/plugins/easyalgo-hermeschat-app
   cp -r panel/dist  /var/lib/grafana/plugins/easyalgo-hermeschat-panel
   ```

2. **放行未签名插件**：编辑 `/etc/grafana/grafana.ini`，在 `[plugins]` 段加：
   ```ini
   [plugins]
   allow_loading_unsigned_plugins = easyalgo-hermeschat-app,easyalgo-hermeschat-panel
   ```
   （或用环境变量 `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`，效果相同。）

3. **确保后端二进制可执行**：
   ```bash
   chmod +x /var/lib/grafana/plugins/easyalgo-hermeschat-app/gpx_hermeschat_linux_*
   ```

4. **重启 Grafana**：
   ```bash
   systemctl restart grafana-server
   ```

---

## 三、启用与配置

### 1. 启用 App 插件（必做）

App 插件注册后默认是 **未启用（enabled=false）** 状态，不会出现在导航栏，**必须先启用**：

- **界面操作**：Configuration（齿轮）→ Plugins → 搜索 "Hermes Chat" → 打开 App 插件 → 点 **Enable**。
- **或用 API**（需 Admin）：
  ```bash
  curl -s -X POST -H "Content-Type: application/json" \
    -d '{"enabled":true,"pinned":true,"jsonData":{}}' \
    http://admin:admin@<grafana-host>:3000/api/plugins/easyalgo-hermeschat-app/settings
  ```

> Panel 插件**不需要启用**，装好后直接出现在面板的可视化选择列表里。

### 2. 配置 hermes 连接（必做）

进入 App 插件的 **Settings** 页面（需要 Admin 权限），填写：

| 字段 | 说明 | 示例 |
|---|---|---|
| **Hermes URL** | OpenAI 兼容的 chat completions 接口（SSE） | `http://hermes.easyalgo.jd.com:8643/v1/chat/completions` |
| **Model** | 模型名 | `hermes-agent` |
| **API token** | Bearer token，**加密存储、只在后端使用、绝不下发前端** | （你的 token） |
| **System prompt** | 全局系统提示（可选） | 见下方 prompt 优先级 |

保存后页面会自动刷新，Grafana 会用新配置重启后端。

### 3. 使用对话界面

有两种入口：

- **整页对话**（App 插件自带）：左侧导航栏点 **Hermes Chat**，或直接访问
  `http://<grafana-host>:3000/a/easyalgo-hermeschat-app`
- **Dashboard 面板**（Panel 插件）：
  1. 新建/编辑 dashboard → **Add panel** → 在 Visualization 里选 **Hermes Chat**。
  2. 拖拽调整大小即可。

### 4. 每个面板独立 prompt

Panel 面板的编辑页右侧 **Options** 里有：

- **App plugin id**：默认 `easyalgo-hermeschat-app`（一般不用改）。
- **System prompt**：**这个面板专属**的系统提示（多行）。
- **Input placeholder**：输入框占位文字。

**prompt 优先级**（后端逻辑）：
```
面板填了 System prompt  →  用面板的（per-panel）
面板没填              →  回退到 App 设置里的全局 System prompt
都没填                →  不注入 system 消息
```

因此一个 dashboard 上可放多个面板，各自扮演不同角色（如"任务诊断"、"日志分析"）。

> ⚠️ 面板的 prompt 是**明文存在 dashboard JSON** 里的，**切勿把 token 等机密写进面板 prompt**。机密只放 App 设置页的加密 token 字段。

---

## 四、验证是否成功

```bash
# 1. Grafana 健康
curl -s -o /dev/null -w "%{http_code}\n" http://<host>:3000/api/health           # 期望 200

# 2. App 后端存活（后端二进制已正常拉起）
curl -s -o /dev/null -w "%{http_code}\n" \
  http://admin:admin@<host>:3000/api/plugins/easyalgo-hermeschat-app/resources/ping  # 期望 200

# 3. Panel 前端资源
curl -s -o /dev/null -w "%{http_code}\n" \
  http://<host>:3000/public/plugins/easyalgo-hermeschat-panel/module.js           # 期望 200
```

日志里应能看到（`docker logs hermeschat-grafana` 或 `/var/log/grafana/grafana.log`）：
```
Plugin registered  pluginId=easyalgo-hermeschat-app
Plugin registered  pluginId=easyalgo-hermeschat-panel
```

---

## 五、常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 导航栏 / 面板列表里**看不到插件** | ①未放行未签名插件（检查 `allow_loading_unsigned_plugins`）；②App 插件没 Enable；③目录名与 id 不一致。 |
| 日志报 `plugin unsigned` 且不加载 | 同上，放行 env / ini 没配对，或拼错 id。 |
| 发消息返回 **"hermes URL is not configured"** | App 设置页没填 Hermes URL。这是预期报错。 |
| 发消息返回 **"failed to reach hermes"** | 后端连不上 hermes 地址（网络/安全组/防火墙）。 |
| 后端不启动 / `resources/ping` 非 200 | ①二进制没执行权限（`chmod +x`）；②架构不匹配（x86 用 amd64、arm 用 arm64）；③`plugin.json` 的 `executable` 名对不上二进制前缀。 |
| 页面能开但**外网访问不到 3000** | 云安全组 / firewalld 没放行 3000 端口。 |
| 流式不逐字出现、要等全部生成完 | 中间有代理做了缓冲；本插件后端是逐块下发的，检查反向代理是否关闭了 buffering。 |

---

## 附录：从源码构建

**前置**：Node.js（实测 v25 可用）、Go 1.21+。

```bash
# --- App 插件 ---
npm install
npx prettier --write "src/**/*.{ts,tsx}"                     # 保证格式通过 lint
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build   # 前端 → dist/
GOOS=linux GOARCH=amd64 go build -o dist/gpx_hermeschat_linux_amd64 ./pkg # 后端 amd64
GOOS=linux GOARCH=arm64 go build -o dist/gpx_hermeschat_linux_arm64 ./pkg # 后端 arm64

# --- Panel 插件 ---
cd panel
npx prettier --write "src/**/*.{ts,tsx}"
NODE_OPTIONS=--openssl-legacy-provider npx grafana-toolkit plugin:build   # → panel/dist/
```

> `--openssl-legacy-provider` 是为了让新版 Node 跑通旧版 webpack（否则报 `ERR_OSSL_EVP_UNSUPPORTED`）。
