# GLM-5.3 当前部署

最后确认：2026-08-14

## 部署结构

```text
浏览器
  -> https://micheljohnson.top/api/assistant/chat
  -> Nginx
  -> 127.0.0.1:8787
  -> michel-writer.service
  -> 智谱 GLM-5.3
```

## 服务器配置

- 服务器：`root@8.218.56.89`
- 前端目录：`/home/www/frontend`
- 后端文件：`/home/www/frontend/admin-server.mjs`
- 服务名称：`michel-writer.service`
- 本地端口：`127.0.0.1:8787`
- 默认模型：`glm-5.3`
- 可选覆盖：环境变量 `ZHIPU_MODEL`
- 阅读助手最大输出：默认 `8192` tokens，可用环境变量 `ASSISTANT_MAX_TOKENS` 临时覆盖
- 智谱接口：`https://open.bigmodel.cn/api/anthropic/v1/messages`

## AK

AK 保存在服务器文件：

```text
/etc/michel-writer.env
```

变量名：

```dotenv
ZHIPU_API_KEY=<完整 AK>
```

当前 AK 已配置，脱敏标识为 `***b1H6`。

完整 AK 不写入前端、Git、Markdown 或日志，避免泄漏。需要查看或更换时，在服务器上操作。

## 更换 AK

登录服务器后执行：

```bash
read -rsp "请输入新的智谱 AK: " ZHIPU_API_KEY
printf '\n'

sed -i.bak '/^ZHIPU_API_KEY=/d' /etc/michel-writer.env
printf 'ZHIPU_API_KEY=%s\n' "$ZHIPU_API_KEY" >> /etc/michel-writer.env
unset ZHIPU_API_KEY

systemctl restart michel-writer.service
systemctl is-active michel-writer.service
```

## 部署

本地执行：

```bash
cd /Users/bytedance/ui
SSHPASS='<SSH 密码>' ./scripts/deploy-sketch-admin.sh
```

## 检查

```bash
ssh root@8.218.56.89
systemctl status michel-writer.service
journalctl -u michel-writer.service -n 50 --no-pager
```

线上接口：

```text
POST https://micheljohnson.top/api/assistant/chat
```

当前已验证服务正常运行，接口可以流式返回 GLM-5.3 的回答。
