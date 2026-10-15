我会这样分层：
                    Pi Main Agent
                planner / reviewer
                        │
               Pi TypeScript Extension
                        │
                  AX Control Plane
              ┌─────────┼─────────┐
              ▼         ▼         ▼
           AX Task    AX Task    AX Task
              │         │         │
             Pi        Pi        Pi
          subagent   subagent   subagent
              │         │         │
           repo A     repo B     repo C
Pi 本身现在已经明确支持 SDK、JSON event stream 和长期运行的 RPC mode，因此它很适合作为 AX Task 中真正运行的 agent。RPC mode 本身就是 stdin/stdout JSONL 控制的独立进程。GitHub
而 AX 的 Task 正好就是为这种 fan-out agent workload 设计的：Task 是最小隔离执行单元，一个 agent 可以创建很多 Task，每个 Task 都有自己的 image、workspace、resource limits 等。GitHub
我更推荐这种组合，而不是把整个主 Pi 塞进 AX
主 Pi 留在你的本机：
Pi
├── conversation
├── planning
├── memory
├── task DAG
├── result evaluation
└── AX extension
执行任务的时候：
用户：
"给这个项目实现 OAuth"

        ↓

Main Pi
        ↓
拆任务

1. inspect auth architecture
2. implement backend
3. implement frontend
4. run tests
5. review diff

        ↓

AX

Task-001
Task-002
Task-003
AX 官方自己也把 agent 描述为可能会 plan、delegate、retry、fan-out，因此并不试图把整个 agent 映射成单个 Task。GitHub
这跟你之前希望 Pi 做的：
Main Agent
    ↓
dispatch
    ↓
subagents
    ↓
collect result
    ↓
judge
    ↓
retry / fix
几乎一模一样。
具体怎么接
我会给 Pi 写一个很薄的 AX extension。
不要把 AX 的几十个概念都暴露给模型，只给 Pi 四五个工具：
ax_spawn({
  task,
  repo,
  branch,
  prompt,
  resources
})

ax_status(taskId)

ax_result(taskId)

ax_exec(taskId, command)

ax_destroy(taskId)
Pi extension 内部再转换成 AX manifest：
apiVersion: ax.io/v1alpha1
kind: Task
metadata:
  name: pi-worker-123
spec:
  image: ghcr.io/yourname/pi-agent:latest

  command:
    - pi
    - --print
    - "Implement the OAuth backend according to TASK.md"

  resources:
    requests:
      cpu: "1"
      memory: "2Gi"
    limits:
      cpu: "4"
      memory: "8Gi"

  workspaces:
    - name: repo
      path: /workspace/repo
AX 原生就是这么定义 Task 的：image + command + env + resources + workspaces。GitHub
Workspace 则可以直接负责：
clone repo
   +
skills
   +
MCP
   +
environment bootstrap
AX 的 Workspace 可以声明 Git repositories、MCP servers 和 skill registries。GitHub
所以你甚至可以做到：
Pi main
│
├─ coding-worker
│   └─ Go repo
│      Go skill
│      Git MCP
│
├─ research-worker
│   └─ docs repo
│      browser MCP
│
└─ reviewer
    └─ repo
       git diff
       tests
每个环境都完全不同。
Pi worker 有两种运行方式

1. 一次性 Task：pi --print / JSON mode
最适合编码 subagent：
spawn
 ↓
clone repo
 ↓
pi --print "Implement X"
 ↓
modify files
 ↓
tests
 ↓
exit
 ↓
Main Pi review
这种最简单。
Pi 官方 CLI 集成明确把 print mode 定位成一次性 invocation，把 JSON mode 定位成输出结构化事件的一次性运行。GitHub
我建议你第一版就这么做。
2. Persistent worker：pi --mode rpc
以后如果你要：
Main Pi
 ↓
worker A

"实现这个"
 ↓
worker 修改

Main Pi：
"测试失败，继续修"
 ↓
同一个 worker 继续
就可以让 AX Task 中跑：
pi --mode rpc --no-session
RPC 模式本身就是 long-lived subprocess，可以连续接收 command，并持续产生 event。GitHub
同时 AX 又支持：
suspend
resume
而 /workspace 会跨 suspend/resume 保存；恢复时是新的进程树，但 workspace 内容会恢复。GitHub
于是可以做到：
Pi worker
   │
coding
   │
idle
   ▼
AX suspend
   │
几小时后
   ▼
AX resume
   │
Pi restart
   │
读取之前 workspace/session
   ▼
继续干活
这个模型就已经很接近真正的 persistent agent workspace 了。
还有一个很有意思的地方：AX 可以替代 Pi 自己的 sandbox 层
Pi 官方现在已经支持几种隔离方案：
Docker
Docker Sandboxes
OpenShell
Gondolin
它甚至明确把“整个 Pi 放进 sandbox”和“Pi 留在 host，只 sandbox tools”分成两个模式。GitHub
所以从架构上看：
现在：

Pi
 ↓
OpenShell / Docker / Gondolin

换成：

Pi
 ↓
AX
 ↓
Agent Substrate
 ↓
sandbox
完全成立。
而且 AX 比单纯 Docker 多了：
Task lifecycle
Workspace provisioning
resource limits
network Gateway
MCP provisioning
Skills provisioning
suspend/resume
cluster scheduling
AX 官方就是把这几个能力作为核心 abstraction。GitHub
但有一个实际问题
AX 目前还是非常早期的 v1alpha1 项目。
Google README 现在直接警告：
core concepts / protocols / specifications 仍在快速变化，stable 前可能有 breaking changes。GitHub

并且部署成本不低，现在需要：
Kubernetes
+
AX control plane
+
Redis
+
Agent Substrate
+
container registry

``` citeturn147504search2


所以如果只是：

```text
你的笔记本
+
Pi
+
2~3 个 subagent
AX 有点杀鸡用牛刀。
但如果你的目标最终是：
                  Pi
                   │
          orchestration / review
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
    worker      worker       worker
       │           │            │
 isolated      isolated       isolated
workspace     workspace      workspace
       │           │            │
      Go          Rust         Docs
并且以后希望：
5 agents
20 agents
100 agents

parallel execution
resource quota
network isolation
persistent workspace
remote execution
那 Pi + AX 是非常顺的架构。
我甚至会把职责边界定死成一句话：
Pi 决定“谁做什么”，AX 决定“在哪里、以什么权限和资源做”。

这样两边都不用魔改。Pi 保持它极简 agent harness 的哲学，AX 则纯粹作为它的 remote agent runtime / sandbox scheduler。这比往 Pi 本体里面不断塞 Docker、K8s、workspace、network policy、resource scheduling 要干净得多。
