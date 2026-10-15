# Google AX 对 pi-ax 的源码核验

> **v1 scope update (2026-10-01):** The user authorized first-version integration and explicitly deferred upstream AX authentication, network-isolation and resource-enforcement deficiencies. Historical “blocker” language below records the original research assessment, not current v1 authorization. Do not modify AX/Substrate, build a security gateway or add a scheduler to address these deferred limitations. Preserve the factual findings. Current implementation/setup/runtime evidence is in [v1-validation.md](v1-validation.md), [local-ax.md](local-ax.md) and [lifecycle.md](lifecycle.md); real Pi-on-AX SQLite acceptance is still required.

## 结论与范围

结论：有真实 AX 沙箱与本地部署的源码基础，可继续做受限原型设计；不能认定现成 AX 已满足全部约定，更不能把 `implementation.md` 当成已验证方案。

最重要的区分：

- AX Task 原生提供资源创建、读取、暂停、激活、删除，不提供完整的异步编码任务结果协议。
- 固定依赖的 guest API 提供异步进程、15 分钟可配置超时、信号、文件和日志，可用于承载一次性完整 Pi 进程。这不是 Pi RPC 会话或续聊。
- 默认 runner 在命令退出后继续存活，不会立即销毁沙箱；但 AX 不采集其退出码，不自动归档结果，也不负责导出后自动删除。
- 严格出网、凭据不泄露、可靠归档、断线创建恢复、清理确认仍需适配或加固。特别是 UDP/53 豁免、无 AX 入站鉴权、凭据写入 Task 时原样可读，属于上线前阻断项。

本次仅静态源码审计，没有部署、运行上游代码、安装依赖、启动容器、创建云资源或执行 SQLite 验收。所有“可支持”均指源码存在控制路径，不是端到端验证通过。

## 来源、固定版本与审计方法

官方公共 GitHub API 成功返回 `google/ax`，描述为 “Google's open agentic orchestration runtime”，默认分支 `main`，`archived=false`。

- AX 固定提交：[`ac2332829f22360ff97b0ba34d94dd0dd782f17e`](https://github.com/google/ax/commit/ac2332829f22360ff97b0ba34d94dd0dd782f17e)，提交时间 `2026-09-27T23:54:08Z`。
- 源码解包目录：`/tmp/pi-ax-official-audit.0qKk1bbb/source`。这是固定提交的官方 tarball，不是 Git 工作树。
- 根据该提交的 [go.mod:3-8][dependencies]，补查固定依赖：Substrate `944abe3278b895ccbf5d45555a49dd0f2f6ceae7`，目录 `/tmp/pi-ax-official-audit.0qKk1bbb/substrate`；env `4468a200b1702503ef9b84cf078e58ac517ad877`，目录 `/tmp/pi-ax-official-audit.0qKk1bbb/env`。
- 通过 `gh api` 获取 AX Git tree，独立计算全部 64 个文件的 Git blob SHA-1，全部匹配。AX tarball SHA-256：`9b98d0c22d3962b2a1f0f6ab3135e4513d5dc63c4dfd3cc26d562f94ea7224a9`。
- 已读要求的 research、writing-for-agents 技能；Semble、context-mode、MCP 在本执行环境不可用，改用目录导航、`rg`、编号源码读取。Context7 的无关搜索结果未作为证据。
- 全程只使用正常 `gh` 公共 API，没有改动 DNS、TLS、网络防护、认证配置，也没有读取凭据。

## 能力分类

| 约定 | 分类 | 核验结果 |
|---|---|---|
| 主 Pi 留在宿主，独立扩展调度 AX | 原生基础加薄适配 | gRPC 控制面不要求主 Pi 进入沙箱，不需要 pi-subagents 后端。[A1] [A2] |
| 沙箱内完整一次性 Pi | 镜像及启动胶水 | AX 固定启动 `/usr/local/bin/ax-task-runner`，不是直接以 Pi 为容器入口；受控镜像需加入 Pi、Node 和测试工具。[A4] [A5] |
| async create/status/result/cancel/destroy | 部分原生 | AX 创建/删除同步协调；guest 进程异步。扩展需独立任务状态、结果协议和恢复账本。[A2] [E1] |
| 主 Pi 重启后管理 | 条件支持 | 持久化集群标识、atespace、Task name、process_id；guest 存活时可重连。guest 重启后的进程历史不持久。[A8] [E2] |
| 默认一个活动任务 | 小适配 | AX 无全局单任务配额；guest 默认允许 10 个并发进程。扩展需跨重启占用记录。[E2] |
| 默认 15 分钟执行超时 | guest 原生，Task 缺失 | `StartProcess.timeout=900s` 的 watchdog 在 guest 内执行；`spec.command` 无对应 timeout。[A1] [A5] [E2] |
| 工作树快照、未提交及新文件 | 小适配 | guest 可传二进制文件；AX Workspace Git clone 不是宿主工作树快照。[A1] [E1] |
| patch、日志、真实测试证据 | 小适配加可靠性要求 | 文件/进程流可用，没有 AX Result/Archive RPC。新增文件必须纳入快照基线差异，而非只调用普通 `git diff`。[A1] [E1] |
| 出网只到模型及依赖源 | Substrate 有能力，AX 缺接线，仍有安全缺口 | 需直接配置每个 Actor 的 EgressPolicy、启用网关，并补齐 DNS/非 TCP 等限制。[S1] [S2] [S3] |
| 无宿主配置、skills、MCP、auth 继承 | 镜像及输入边界责任 | AX 模板只显式挂载 `/workspace`，但 runner 子进程继承容器环境；镜像内容、Pi 自动发现、导入过滤必须单独验证。[A4] [A5] |
| 不重试、不续聊、不 suspend/resume | 扩展协议责任 | 可不暴露这些功能，但 AX 首次执行必须调用名为 ResumeTask 的激活 RPC；上游存在崩溃恢复/重建分支，不能宣称运行栈绝不重启。[A3] [A4] |
| 导出成功后自动销毁、显式清理 | 原生删除加适配 | 必须先落盘校验结果再删 Actor；删除记录不代表所有模板/存储残留已清零。[A2] [A7] |
| 本地优先、无付费基础设施 | 有官方开发路径，未实测 | Substrate 支持 kind、当地 registry、PostgreSQL、RustFS；AX 默认清单仍需本地化。[S4] [A9] |

## 精确 Schema 与控制路径

AX 服务是 `ax.v1alpha1.AX`，不是 Kubernetes Task CRD，也没有 REST `/tasks` 接口。HTTP 仅有控制面 `/healthz`。客户端将 YAML 解码为 typed gRPC 请求；未知字段会被严格拒绝。[A1] [A2] [A10]

Task 的 YAML/JSON 字段为：

```text
apiVersion: ax.io/v1alpha1
kind: Task
metadata: {name: string, atespace: string, creationTimestamp: timestamp}
spec:
  image: string
  command: string[]
  env: [{name: string, value: string}]
  resources:
    requests: {cpu: string, memory: string}
    limits: {cpu: string, memory: string}
  workspaces: [{name: string, path: string, goal: string}]
  debug: boolean
status:
  phase: string
  id: string
  actor: string
  workerIP: string
  pendingApproval: {id: string, action: string, requestedAt: timestamp}
  usage: {promptTokens: int32, completionTokens: int32}
  conditions: [{type, status, lastTransitionTime, reason, message}]
```

没有 `timeout`、`deadline`、`retry`、`networkPolicy`、`secretKeyRef`、`exitCode`、`artifacts`、`retention` Task 字段。status 中有字段不代表存在生产者。[A1]

Workspace：`spec.git[]` 含 `name/repo/branch/dir/depth`；`spec.files[]` 只有字符串 `path/content`，无二进制、权限、符号链接协议；还有 `mcp`、`skills`。Model：`provider/model/secretKey{name,key}/parameters`。Task 没有 Model 引用字段，不会自动选择或配置 Pi 模型。[A1]

`name` 与非空 `atespace` 需小写 RFC1123 label，最多 63 字符；默认 atespace 为 `default`。用于管理的真实键是 `(atespace,name)`，不是 `status.id`。后者由协调器生成 `task-<name>-<Unix秒>`，没有按其查询的 RPC。[A2] [A3] [A10]

| 操作 | 精确请求或路径 | 实际语义 |
|---|---|---|
| create | `CreateTask({task})`；`ax apply -f` | Task 不可变，同名返回 FailedPrecondition。保存 `Suspended` 后同步建模板/Actor，尚未运行。 |
| 首次激活 | `ResumeTask({atespace,name})` | 激活 Actor 并短暂轮询 ready；v1 仍需内部调用，不能把它误解为产品续聊功能。 |
| read/status | `GetTask({atespace,name})` | 读取 Redis 中的完整对象，不刷新 guest 进程状态。 |
| list | `ListTasks({atespace,limit:int64,offset:int64})` | 默认 limit 50；须分页，不能只查第一页恢复活动任务。 |
| watch | `WatchTask({atespace,name})` | 初始快照加 Redis PubSub 修改通知，不是持久事件历史；无 command exit 回写。 |
| exec | router + `ate-target-actor: <atespace>/<task>`，调用 guest `StartProcess` | `ax ssh` 实际是该 gRPC 进程服务，不是 OpenSSH。需 `debug:true`；它新建进程，不 attach 到 Task command。 |
| files | guest `ReadFile` / `WriteFile` | 二进制流，AX CLI 无完整 cp/import/export 命令。 |
| logs | guest `StreamProcessOutput` | 仅 guest 启动的进程有其 spool；runner 的 `spec.command` stdout/stderr 直接进容器日志。 |
| cancel | guest `SignalProcess` | AX 没有 CancelTask；必须发信号后查询 EXITED，不能以 RPC 取消或连接断开代替远端终止。 |
| suspend | `SuspendTask({atespace,name})` | 保留可恢复资源；不是 kill/delete。上游甚至吞掉 SuspendActor 错误仍报告 Suspended，不能用于确认取消成功。 |
| destroy | `DeleteTask({atespace,name})` | 标记 Terminating，删除 Actor 并轮询至 NotFound，再删 Redis 记录。模板清理错误只记 warning。 |

控制面依据：[A1] [A2] [A3] [A7]；CLI/guest 路由依据：[A11] [A12]。

Guest 的完整相关请求为：[E1]

```text
StartProcess {command:string[], cwd:string, env:map<string,string>,
              stdin:bool, timeout:google.protobuf.Duration} -> Process
GetProcess {process_id:string} -> Process
StreamProcessOutput {process_id, stdout_offset:int64, stderr_offset:int64,
                     follow:bool} -> stream {stdout:bytes | stderr:bytes | exit:Process}
WriteProcessInput -> stream request {process_id, data:bytes, close:bool}
SignalProcess {process_id, signal:Signal} -> Process
ReadFile {path:string, mode:uint32} -> stream {chunk:bytes}
WriteFile -> stream {path:string, mode:uint32, seek_offset:int64, chunk:bytes}
```

Process 含 `process_id/command/pid/state/exit_code/started_at/finished_at`；state 为 RUNNING 或 EXITED 等枚举。guest 信号退出码为 `128+signal`，runner 的 Go `CommandExit.ExitCode` 则为 `-1`，两者不能混用。`SignalProcess` 返回发信号后的即时状态，不保证已经退出。ReadFile 建议 `mode=0`，否则不存在时会创建空文件；WriteFile 的 `seek_offset=0` 会截断目标文件。[E1] [A5]

## 完成、取消、超时与结果保留

1. 正常完成不立即销毁。runner 在 `cmd.Wait()` 后报告退出并等待其自身 context 取消，metadata/debug 服务仍在；这给结果收集留下窗口。[A5]
2. AX Task phase 不代表 Pi 成败。runner 没有向控制面写退出状态；GetTask/WatchTask 不能替代 Process 或自定义结果清单。readiness 最多在一次协调中检查约 15 秒；没有后台持续协调器，之后仍可能停在 Initializing。CLI resume 的 15 秒 deadline 还包含了前面的远程激活过程。[A2] [A3] [A11]
3. guest timeout 确实独立于主 Pi：Tracker 用 `exec.Command` 启动进程，`time.AfterFunc` 在 guest 中向负 PID 进程组发 SIGKILL，不依赖发起 RPC 的 context。显式指定 900 秒可覆盖默认 1 小时。仅主 Pi 退出不会撤掉这个定时器；guest/worker 自身重启、进程另建 session 逃离进程组、时钟/故障场景仍需实测。Task command 路径没有该 watchdog。[E2]
4. timeout 杀死被监管进程组，不删除 Actor，也不生成“timed_out”业务原因。单看 137 不能区分 watchdog 与其他 SIGKILL。扩展/worker 需记录截止时间、取消意图和确认状态；未确认远端停止一律 `unknown`。
5. 默认 runner 的 SIGTERM 处理只监管自己的 Task command；若 guest 启动了 Pi，不能假设 runner 的这段代码也覆盖 guest 的所有进程。guest SignalProcess 能尝试终止，必要时 Actor 删除作为强制兜底，但删除前未导出的文件可能损失。[A5] [E2]
6. guest 进程历史是内存 map，默认 stdout/stderr 各 10 MiB，完成后保留 1 小时，最多保留 100 个完成进程，每 2 分钟清理。默认目录 `/var/log/ate-jobs`，不是 AX `/workspace` durable volume；guest 重启会失去映射。主 Pi 长期离线不能依靠此 spool 当永久归档。[E2] [E3]
7. Redis 默认 task TTL 为零，但官方 Redis Deployment 没有持久卷/显式持久化保障。仅主 Pi 重启与 Redis/集群重启是不同保障级别。[A8] [A9]
8. `/workspace` 是 DATA snapshot volume，不是结果库。AX 模板设置 `onPause=DATA`、`onCommit=DATA`、`onResume.fromData=GOLDEN`；不能仅从“durable”推断任意异常/恢复都返回最后一次文件状态。暂停与恢复属于快照/新进程生命周期；删除 Actor 后的底层对象存储保留、GC、日志轮转没有在本次审计中建立可依赖的完整契约。必须在销毁前把 patch、状态、日志、测试产物传到独立结果目录，校验长度/hash并确认落盘。主 Pi 离线时应保留资源，不得因宿主计时器直接删掉尚未确认导出的结果。[A4]

## 隔离、认证与秘密

真实沙箱路径已找到：AX 构造 `SandboxClass=GVISOR`、`ConfigName=gvisor-default` 的 ActorTemplate；Substrate 以 runsc 执行容器，提供 durable volume 与独立 actor 网络。这比 README 宣称更具体，但仍不是对当前机器隔离效果的验证。[A4] [S5]

宿主和 guest 边界：模板显式挂载的是 `/workspace`，未发现宿主 home/global Pi 配置挂载；runner 的 `os.Environ()` 是容器环境，不是自动把主 Pi 的全部环境复制过去。但镜像中的 HOME、包、默认配置仍会继承到 Pi。文件 RPC 的约束只是词法路径前缀检查，随后普通 `os.OpenFile`，没有符号链接解析边界保障；它不是 guest 内秘密与工作区之间的安全隔离。[A4] [A5] [E4]

认证分三段：

- 宿主到 AX：CLI 使用 plaintext gRPC，即使地址写 `https://` 也只剥去前缀；AX `grpc.NewServer()` 无认证拦截器，HTTP/h2c 无 TLS。默认依赖 Kubernetes port-forward 与部署边界，不存在原生每任务用户授权。[A2] [A11]
- 宿主到 guest：AX guest client 同样 plaintext，`ate-target-actor` 仅路由标识，不是访问令牌。debug 开启同时提供任意进程执行与文件接口，不能暴露给不可信网络。[A12] [A6]
- AX 到 Substrate：支持 CA 验证 TLS 与文件 bearer token，清单投影 audience 为 `api.ate-system.svc` 的 ServiceAccount token 和 ClusterTrustBundle。代码也提供不安全开关，本研究没有启用。[A4] [A9]

凭据泄露具体路径：

- 放进 `Task.spec.env.value` 会进入 Redis 完整 Task、Create/Get/List/Watch 响应、`ax get task` YAML、`AX_TASK_YAML`、ActorTemplate 环境，以及 guest `/metadata/v1alpha1/ax/task`。metadata 在 debug=false 时仍开放，且没有脱敏。[A2] [A3] [A6] [A8]
- 协调器还会自动从 atespace 的 `gemini-api-secret/GEMINI_API_KEY` 或 ax-server 环境取 key，注入 ActorTemplate；并非 Task 选择的 Model。严格显式配置需要防止这条隐式来源生效。[A3]
- 较窄候选路径是 guest `StartProcess.env`，其返回的 Process 不包含 env，避免写入 Task metadata；但进程自己仍能读取并输出秘密，stdout/stderr 无脱敏过滤。不能据此宣称“环境变量安全”。[E1] [E2]
- default runner 记录命令参数，并直接转发 stdout/stderr；key 不应放参数、任务提示、文件内容或 shell 命令字符串。结果/日志必须用哨兵凭据验证，排查进程环境、错误路径、模型 debug 日志和归档。

允许 worker 使用原始 env key 时，无法同时保证恶意 worker 永远无法读出/外传此 key。本报告只确认需要明确威胁边界、最小凭据、日志/结果过滤和限制出网，不擅自把约定改成网关代持凭据。

## 出网策略与实际执行

AX 本身没有 Gateway 类型，也没有 EgressPolicy 字段/CLI。固定 Substrate 依赖则有真实实现：[S1] [S2]

- `CreateActorEgressPolicy({actor:{atespace,name},egress_policy:{metadata:{atespace,name:"default"},rules:[...]}})`；另有 Get/Update/Delete。每个 Actor 最多一个 policy。
- rule 只能选 `hostnames:{patterns:[...]}`、`cidrs:{cidrs:[...]}` 或 `all:{}`；首个匹配规则允许，未匹配拒绝。没有独立 deny rule，也没有端口匹配字段。hostname 通配符仅匹配最左一层 label。
- gVisor 网络命名空间的 IPv4 nftables 将 TCP 重定向到 atunnel，经 actor mTLS 身份到 gateway；网关检查有效 Actor、policy，再按原目标地址或 HTTP Host 决定是否转发。无 policy/空 policy 默认拒绝，policy 读取失败拒绝服务，不是放行。[S2] [S3]

不能省略的限制：

1. 只有开启 egress gateway 才有 TCP 强制代理；redirect port 为零时仍走 masquerade 直连，不是默认断网。[S3]
2. UDP 非 53 端口被丢弃，但 UDP/53 仅看目的端口，没有限定 DNS 服务器地址。其余转发 catch-all accept；这不是“所有流量仅允许模型/依赖域名”。worker 的 Kubernetes NetworkPolicy 仅限制 ingress，egress 明确未管理。[S3] [S6]
3. 不解密的 TLS/opaque TCP 按地址 CIDR 放行，不能把 CDN 地址段等同于模型域名 allowlist。HTTPS hostname 精确策略需要受控 TLS 终止路径和 guest trust 配置，文档标注 sdsmint 为实验功能；须验证真实模型 SDK 的 TLS/HTTP2/流式兼容性，不能关闭证书验证。[S7]
4. actor 网络当前是 IPv4-only，双栈防绕过仍需测试。DNS 隧道、ICMP/其他协议、私网/宿主网关、云 metadata、Kubernetes API 均须负向验证，不能只测一个被拒绝的 URL。

因此，直接接 Substrate policy 是候选 bootstrap 适配；完整严格出网仍是安全阻断项，而非“设置几个 env 即完成”。

## 文档与实现不一致或易误读之处

- README quickstart 显示 apply 后 Running 并直接 ssh，但 CreateTask 明确设为 Suspended，CLI apply 不自动 ResumeTask。[A13] [A2] [A11]
- README 称 Task 有 CPU/memory limits；Schema 有这些字段，但本提交协调器/BuildActorTemplate 没把 Task resources 转到 Substrate。worker 的默认资源限制不等于请求的 Task 限制已生效。[A13] [A3] [A4]
- 文档的“恢复原处”不能理解为保持同一 Pi 进程树。runner 文档明确数据卷恢复到新容器；v1 不应以此承诺会话续聊。[A14]
- WorkspaceReady 不是成功执行证据：Git clone 失败会记录错误但返回 nil，runner 仍可能标 ready 并继续执行命令；goal bootstrap 超时也不是 Pi 总任务超时。约定中的干净输入不应走这些自动 Git/skills/goal 引导路径。[A15] [A5]
- 自定义 ActorTemplate 创建失败会退回默认模板；Substrate client 初始化失败时 ax-server 可以在没有 reconciler 的情况下运行。必须核验实际 Actor image digest、sandbox class 与进程，不以“Create 成功”证明运行了真实受控 worker。[A3] [A16]
- `SuspendTask` 吞掉底层 suspend 错误；`DeleteTask` 的 Actor 删除确认较强，但模板删除失败/列表截断可能残留，不等于彻底清理。[A3] [A7]
- Task 同名不可变；CLI 提示修改 debug 后 re-apply 与实际不可变语义冲突。v1 应使用唯一名称，不重试创建同名任务来“更新配置”。[A2] [A11]

## 最小候选集成顺序

以下是待批准及实测的序列，不是已经实施的架构：

1. 宿主生成唯一任务名，持久记录集群身份、atespace、输入快照 hash、截止时间、状态与并发占用。排除 `.env`、密钥、依赖目录、宿主 `.git` 敏感配置和向外符号链接；保留授权源码、未提交变化、新文件及项目 AGENTS.md。自动秘密识别不能替代显式过滤契约。
2. 以固定 digest 的受控 Pi 镜像创建 AX Task，`debug:true`，空 `command`，不绑定 Git/MCP/skills/goal；runner 只提供空 `/workspace` 和 guest 服务。先验证 Actor/template 确实是指定镜像和 gVisor。
3. 在 Actor 启动任务前配置 Substrate EgressPolicy 及额外网络约束，随后首次 ResumeTask。此调用仅内部激活，不给 v1 增加暂停/恢复产品功能。独立检查 guest ready，不能只信缓存条件。
4. 用 WriteFile 上传有大小/hash清单的工作树包；安全解包并建立输入基线。显式受控 HOME/Pi 配置目录及启动选项，验证不会发现宿主或额外项目扩展。
5. guest StartProcess 启动一次性完整 Pi worker 包装命令，`stdin:false`、显式模型、`timeout=900s`；凭据仅经受控 env 路径注入。保存 process_id。若 RPC 回包丢失，因接口无幂等键和进程列表，不可盲目重启；需启动标记/状态文件辅助确认，否则报 unknown。
6. 从 guest Process/worker 结果清单构造扩展 status。包装层产生包含新增/删除/二进制变更的 patch、测试命令与退出码、日志和 SQLite 实物，不自动应用 patch 或 push。结果提取本身也必须有资源/时间界限。
7. cancel 发 TERM，限时等待后 KILL，再确认 EXITED。必要时尝试 DeleteTask；确认不了报 unknown，并保留待清理 ID。超时原因不能仅由退出码猜测。
8. 先导出、检查 hash、原子落盘结果，再自动 DeleteTask，并核实 Actor/template 清理；删除失败保留 cleanup-pending。离线期间不启动未经确认的删除，重连继续导出/清理。不能只依靠会过期的 guest spool。

这条序列仍有需要设计确认的薄弱点：进程启动回包丢失、worker 被强杀前的结果落盘、长期离线日志保留、强制取消与未导出产物的取舍。不能在研究阶段偷偷选择更大的常驻调度服务来填补。

## 本地环境前置条件

官方 Substrate 提供 kind 开发路径，而不是必须买 GKE：[S4]

- Docker、kubectl、Go，脚本管理 kind 等依赖；本地 registry 默认端口 5001。
- Kubernetes + Substrate 控制面/worker、gVisor/runsc 资产、PostgreSQL、RustFS，以及网关/证书组件。gVisor 路径不要求 KVM；微虚机不是此次最低方案。
- Kubernetes 必须启用 ClusterTrustBundle、ClusterTrustBundleProjection、PodCertificateRequest 等 API/feature gates。[S8]
- AX 需要其 Go `1.27.1` 工具链、ko、registry、Redis、ax-server，以及包含 Pi 的 worker 镜像。上游默认 Python/Antigravity 镜像并不是 Pi worker；默认 `latest`/未固定 pip 包也不是可复现交付。[dependencies][A17]
- AX 默认 snapshot location 是开发者 `gs://dberkov-gke-dev3/ate-env/`，必须替换。本地 Substrate overlay 使用 S3 backend 和 RustFS；不能仅从 URI 前缀猜其存储后端，需按固定源码的本地配置验证兼容性。[A4] [A9] [S9]
- 官方 Redis 清单需本地持久化配置；本地 demo 存储凭据不能当生产安全基线。将来启动脚本还应隔离 cluster name/context：上游 create-kind 脚本会删除同名集群，不应未经确认原样运行。[S8]

本次没有检查宿主 Docker/集群可用性或容量，也没有运行这些脚本。无付费基础设施可作为候选目标；真实模型调用是否收费是另外的问题，不能承诺免费模型调用。未来交付仍应包含独立扩展、受控 worker 镜像、固定依赖的可复现本地真实测试环境，而不是仅一个 CLI 包装器。

## 阻断项与必须执行的真实验收

阻断项：严格网络策略闭环；控制面/debug 服务访问边界；env 凭据的暴露与日志脱敏；超时/取消的可确认终止；离线可恢复结果保存；固定本地配置和真实镜像验证。解决前不应接受“AX 已全部核验通过”。

后续经授权的真实测试至少包括：

1. 在本地真实 AX/gVisor Actor 内运行完整 Pi，而非 host shell、普通 Docker 替身或 mock。保留 AX/依赖 SHA、镜像 digest、Actor/template/runtime 证据。
2. Pi 编写并执行简单 SQLite 程序，实际建表并完成 INSERT、SELECT、UPDATE、DELETE，用断言校验值和行数；导出源码、数据库或可重建输入、测试命令、退出码、原始输出及 hash。主进程重启后仍能取回同一任务结果。
3. 注入未提交修改、新文件、删除文件、权限/二进制变化；返回 patch 与输入基线一致，宿主原文件完全不改、不提交、不 push。放入 `.env`/密钥哨兵和向外符号链接，确认未上传。
4. 宿主 HOME/global Pi auth/config/skills/MCP/extensions 放置哨兵，验证 worker 不继承；模型只能来自显式配置。
5. 普通成功、非零退出、信号退出分别验证 Task phase、Process exit 与业务结果互不混淆；进程完成后还可读文件。
6. 主 Pi 退出后等待真实 15 分钟 watchdog，验证远端进程组被杀。cancel 测试 TERM 不响应、派生进程/独立 session、网络断开、guest 崩溃，未确认必须 unknown，不能假报 canceled。
7. 模拟 Create/StartProcess 回包丢失和宿主重启，验证不重复执行；超过 guest 默认 1 小时保留期及 10 MiB 日志上限仍明确报告完整性或截断，不静默缺失。
8. 真实模型 API/依赖 registry 正向通过；未授权 HTTPS、直接 IP、Host/SNI 不一致、重定向、UDP/53 外部地址、DNS 外带、IPv6、宿主/私网/API/metadata 负向拒绝；网关故障 fail closed。
9. 哨兵 key 检查 Task Get/List/Watch、metadata、模板、日志、异常栈、快照和归档；确保不出现在对模型/用户返回的结果中。不得用真实 key 测泄露。
10. 导出失败/中断时不删除；完整落盘后删除；强制终止、Redis/worker 重启、模板清理失败时保留可追踪状态，复核对象存储残留。两个宿主进程竞争时仍只允许一个活动任务。

上游已有 runner 完成后存活测试、guest timeout/signal/log cap 测试、Substrate egress 测试源码，但本次没有执行，不能把这些测试文件当成本项目真实验收证据。[T1] [T2] [T3]

## 本地变更与实际验证

- 新建 `AGENTS.md`：研究目的、历史草案地位、研究报告入口、当前无构建测试命令及未来更新要求。
- 输出 `docs/ax-verification.md`：本报告。没有扩展实现、worker 镜像或安装脚本。
- `implementation.md` 未改；SHA-256 为 `c63a0ea434eeebfcb5c13e6a158c7b82c3ae6d7e1ee9b42bcbfe9de537461e30`。
- 仓库为 unborn main，无 tracked 文件；原有草案未暂存，所有本次文档也未暂存。
- README.md 缺失。建议实现与支持的安装路径确定后再创建，本次不编造安装指南。
- 实际执行：`gh api` metadata/commit/tarball/tree 读取；tar 解包到唯一临时目录；源码查阅；64 个 AX blob 完整性比对；`git status --short`、`git diff --cached --name-only` 与文件 hash 检查。
- 未添加/修改测试；未运行 build、unit test、E2E。下一步是独立 reviewer 复核本报告，然后决定是否批准最小真实本地验证，不直接开始部署。

## 固定源码索引

[A1]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/pkg/apis/v1alpha1/ax.proto#L24-L317
[A2]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/server/server.go#L54-L408
[A3]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/controller/reconciler.go#L94-L366
[A4]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/substrate/client.go#L36-L372
[A5]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/runner/runner.go#L96-L246
[A6]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/metadata/server.go#L69-L238
[A7]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/controller/reconciler.go#L391-L443
[A8]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/store/redis/store.go#L36-L266
[A9]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/deploy/ax-server.yaml#L26-L148
[A10]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/pkg/apis/v1alpha1/types.go#L45-L61
[A11]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/cmd/ax/main.go#L197-L1073
[A12]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/guest/client.go#L43-L151
[A13]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/README.md#L47-L107
[A14]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/docs/runner.md#L11-L47
[A15]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/workspace/setup.go#L76-L128
[A16]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/cmd/ax-server/main.go#L89-L119
[A17]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/Dockerfile.task-runner#L15-L31
[dependencies]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/go.mod#L3-L8
[E1]: https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/proto/ateenv/v1alpha/guest.proto#L34-L264
[E2]: https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/guest/process/tracker.go#L35-L492
[E3]: https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/guest/process/tracker.go#L545-L595
[E4]: https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/guest/filesystem/service.go#L87-L134
[S1]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/pkg/proto/ateapipb/ateapi.proto#L389-L494
[S2]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/cmd/atenet/internal/router/egress/egress.go#L145-L265
[S3]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/internal/ateomnet/net.go#L206-L381
[S4]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/README.md#L86-L126
[S5]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/cmd/ateom-gvisor/runsc.go#L61-L142
[S6]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/cmd/atecontroller/internal/controllers/networkpolicy_controller.go#L102-L123
[S7]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/demos/egress/README.md#L35-L101
[S8]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/hack/create-kind-cluster.sh#L72-L147
[S9]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/manifests/ate-install/kind/kustomization.yaml#L24-L72
[T1]: https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/runner/runner_test.go#L61-L108
[T2]: https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/guest/process/service_test.go#L483-L521
[T3]: https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/internal/e2e/suites/networking/egresspolicy_test.go#L33-L103

补充精确定位：[名称验证](https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/pkg/apis/v1alpha1/types.go#L246-L280)、[Actor 删除确认](https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/internal/substrate/client.go#L425-L491)、[Redis 清单](https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/deploy/redis.yaml#L20-L66)、[EgressPolicy 请求 Schema](https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/pkg/proto/ateapipb/ateapi.proto#L1431-L1483)、[HTTP 请求实际策略执行](https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/cmd/atenet/internal/router/egress/request.go#L32-L96)。
