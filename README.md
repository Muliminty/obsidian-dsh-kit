# Obsidian DSH Kit

连接笔记与日常的轻量工具箱。

面向 DeepSeek Harness（DSH）的模块化个人工具插件，以统一的功能卡片连接日常操作与 Obsidian 本地笔记，从喝水打卡开始。

> 第三方社区项目，非 Obsidian 或 DeepSeek Harness 官方项目。它安装在 **DSH** 中，不是安装到 Obsidian 社区插件目录的插件。

## 当前功能

- 功能卡片首页与独立喝水页面，统一的响应式、明暗色界面。
- 支持 +1、+½、+¼ 杯，以及 −1、−½、−¼ 杯修正，直接写入 Obsidian 当日日记；日记是唯一数据源。
- 展示当天杯数、每杯容量和累计毫升数。
- 日记不存在、记录区不存在时，先确认再创建并计入本次饮水。
- 读取当天日记中的容量，默认新建记录区为 820 ml；可以手动调整。
- 基于原文版本比对、串行写入和请求标识防止常见重复操作与覆盖。

扣减不得低于零；没有日记或记录区时，扣减不会创建内容。尚不包含定时提醒、按事件撤销、历史图表或云同步。网络超时后请先刷新核对日记，不要立即重复打卡。请求去重仅保存在当前 Host 进程内，重启会清空。

## 环境要求

- 支持本地 bundle 插件、`webServer` 和 `connection.requestRejection` 的 DeepSeek Harness。
- Node.js 22 或更新版本。
- Obsidian 正在运行，且已启用并能调用 Obsidian CLI 的 `eval` 功能。
- `obsidian` 命令在 **DSH Host 的 PATH** 中可用；否则启动 Host 前设置 `OBSIDIAN_BIN` 为可执行文件绝对路径。
- 现有的日记目录和 Markdown 模板。插件不会自动建立缺失的父目录。

本项目目前在 macOS 本地环境使用，尚未完成 Windows、Linux 及多个 DSH 版本的兼容性验证。

## 本地安装

```sh
git clone git@github.com:Muliminty/obsidian-dsh-kit.git
cd obsidian-dsh-kit
npm test
```

通过 DSH 的 bundle 管理方式安装这个本地目录。若手动维护 profile，相关配置示意如下（请合并到现有配置，不要覆盖其他插件）：

```json
{
  "dependencies": {
    "obsidian-dsh-kit": "link:/绝对路径/obsidian-dsh-kit"
  },
  "dsh": {
    "profile": {
      "bundles": ["obsidian-dsh-kit"]
    }
  }
}
```

确保 profile 的包解析能找到该本地包（包括对应的 `node_modules` 链接），随后完整重启 DSH App。仅刷新网页不保证重新编译 client bundle。

本包无运行时第三方依赖，不需要构建步骤；暂未发布到 npm。

## 配置

编辑本项目 `cordis.patch.yml` 中的 `config`，然后重启 DSH：

```yaml
- insert:
    - id: obsidian-dsh-kit
      name: obsidian-dsh-kit
      config:
        vaultRoot: /绝对路径/你的仓库
        diaryDir: 10_日记
        templatePath: 99_系统/模板/Daily_Note.md
```

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `vaultRoot` | 自动获取 | 省略时通过 CLI 获取正在运行的 Obsidian 当前仓库路径；Host 运行期间缓存。切换仓库后请重启 Host。 |
| `diaryDir` | `10_日记` | 仓库内的日记目录，文件名固定为 `YYYY-MM-DD.md`。 |
| `templatePath` | `99_系统/模板/Daily_Note.md` | 仓库内的日记模板路径。 |
| `operationSuffix` | `water` | 自动审计操作标识的后缀。 |

目录与模板路径必须是仓库内相对路径，不支持符号链接目录。写入前还会检查 Obsidian 当前仓库与配置路径一致，避免写错仓库。

日期目前固定使用 **Asia/Shanghai**。模板支持 `{{date}}`、`{{date:YYYY-MM-DD}}`、`{{date:dddd}}`（英文星期）和 `{{date:ww}}`（ISO 周数）；遇到其他未解析变量会拒绝创建日记。

## 日记格式

日记需有 YAML Frontmatter。示意：

```markdown
---
date: 2026-11-05
---
# 2026-11-05

## 喝水记录

- **每杯容量**：约 820 ml
- **喝水打卡**：1111
```

每个 `1` 代表已喝完一杯，`1111` 是四杯，即当前容量下的 3280 ml。`½` 代表半杯，`¼` 代表四分之一杯；例如 `11½¼` = 2.75 杯，820 ml/杯时约 2255 ml。旧的纯 `1` 记录继续兼容；每次调整会归并为整杯与余量（如 `½¼` = 0.75 杯）。此处只是格式示例，不是推荐饮水量。

插件更新 Frontmatter 中的 `schema_version`、`last_operation_id` 和 `updated_by`；`updated_by` 暂保留兼容标识 `orbitos-water`。同一天修改容量会重新计算当天所有杯数，不支持逐杯不同容量。

如果模板包含原 OrbitOS 的示例待办和虚拟执行日志，创建时会移除这些特定示例行，不将创建日记冒充为执行任务。

## 操作与结果核对

- 「记录饮水」提供一杯、半杯、四分之一杯三个大按钮；误记时展开「记多了？修正记录」扣减，避免加减混点。
- 写入后核对目标日记完整原文，不依赖 CLI 回执文字；即使 CLI 抛出异常，实际内容一致也视为成功。
- 连接中断或结果不能确认时暂停增减，先点击「核对日记」并检查当前总量；不要直接重复提交。读回不一致可能来自并发编辑，不会自动重试覆盖。

## 隐私与安全

- 不调用大模型、不上传日记，不另建饮水数据库。
- API 使用 DSH 自身的请求鉴权；客户端不能提交任意文件路径或执行代码。
- 写入通过本机 Obsidian CLI 的 `app.vault.process` 再次比较原文，不绕过当前仓库校验。
- Obsidian CLI `eval` 是高权限能力，请仅安装您信任的插件，并自行维护笔记备份。
- 饮水量仅用于记录，不提供健康诊断或医学建议。

## 开发

```sh
npm test
node --check index.js
node --check client.js
```

- `index.js`：Host 路由、鉴权、CLI 读写协调。
- `water.js`：记录解析与纯文本变换。
- `client.js`：功能注册表、首页、子页面与共用视觉组件。
- `water.test.js`：纯函数、路由保护和界面导航测试；不需要真实 Obsidian 仓库，也不会记录实际饮水。

## 许可证

MIT © 2026 Muliminty
