# JB AI Proxy

JetBrains AI 反向代理，将 JetBrains AI API 转换为 OpenAI 和 Anthropic 兼容格式。

## 功能

- OpenAI 兼容接口（`/v1/chat/completions`、`/v1/models`）
- Anthropic 兼容接口（`/v1/messages`）
- 流式和非流式响应
- 多轮对话、工具调用（Function Calling）、图片输入
- 多账号轮询
- API Key 鉴权
- Web 管理面板

## 支持的模型

通过 JetBrains AI 可使用 40+ 模型，包括：

- **OpenAI**: GPT-4o, GPT-4.1, GPT-5 系列, o1/o3/o4-mini
- **Anthropic**: Claude 4 Sonnet, Claude 4.5 系列, Claude 4.6 Opus/Sonnet
- **Google**: Gemini 2.0/2.5/3.x Flash/Pro
- **xAI**: Grok-4, Grok-4.1 Fast

## 快速开始

```bash
# 安装依赖
npm install

# 启动
node server.js
```

打开 `http://localhost:3000/panel` 进入管理面板。

## 添加账号

### 方式一：OAuth 登录

1. 在管理面板点击「添加账号」
2. 点击链接前往 JetBrains 登录授权
3. 本地部署：授权后自动回调；远程部署：复制回调 URL 粘贴到面板
4. 填写 License ID（在 [account.jetbrains.com/licenses](https://account.jetbrains.com/licenses) 页面查看）
5. 提交完成

### 方式二：手动导入

在管理面板点击「手动导入」，填入 Refresh Token 和 License ID。

## 配置

编辑 `config.json`：

```json
{
  "port": 3000,
  "api_key": "sk-your-key-here",
  "panel_password": "your-password",
  "grazie_agent": {
    "name": "aia:idea",
    "version": "261.22158.366:261.22158.277"
  }
}
```

- `port`: 监听端口
- `api_key`: API 密钥，留空表示不鉴权
- `panel_password`: 管理面板密码，留空表示不需要密码
- `grazie_agent`: 发送给 JetBrains API 的客户端标识

## API 使用

### OpenAI 格式

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic-claude-4-6-opus",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true
  }'
```

### Anthropic 格式

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "x-api-key: sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic-claude-4-6-opus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

### 模型列表

```bash
curl -H "Authorization: Bearer sk-your-key" http://localhost:3000/v1/models
```

## 客户端配置

在 Cherry Studio、ChatGPT-Next-Web、Cursor 等客户端中：

- **Base URL**: `http://localhost:3000/v1`
- **API Key**: `config.json` 中配置的 key
- **Model**: 使用 JetBrains profile ID，如 `anthropic-claude-4-6-opus`、`google-chat-gemini-flash-2.0`

## 账号管理

账号凭据保存在 `credentials.json`，包含 refresh_token 和 JWT，自动刷新：

- id_token：每 50 分钟刷新
- JWT：每 20 小时刷新
- 多账号简单轮询（Round-Robin）

## 项目结构

```
jb-ai-proxy/
  server.js                 # 入口
  config.json               # 配置
  credentials.json          # 账号凭据（自动生成）
  src/
    config.js               # 配置加载
    jb-client.js            # JetBrains API 客户端
    auth-flow.js            # OAuth PKCE
    account-manager.js      # 账号管理、Token 刷新、轮询
    converter/              # 格式转换
      openai-to-jb.js
      jb-to-openai.js
      anthropic-to-jb.js
      jb-to-anthropic.js
      tools.js
    routes/
      openai.js             # /v1/chat/completions, /v1/models
      anthropic.js          # /v1/messages
      auth.js               # OAuth 回调
      panel-api.js          # 管理面板 API
  panel/                    # 管理面板前端
```
