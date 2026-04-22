# Swarm Worktree Plugin Architecture

## 1. System Overview

```
OpenCode CLI
├── Sisyphus (Orchestrator)
│   ├── Prometheus (Planner)
│   └── Metis (Plan Consultant)
├── Swarm Coordination
│   ├── parallel-fanout
│   ├── pipeline-orchestrator
│   └── serial-fallback
└── Worktree Isolation
    ├── swarm-worktree-plugin
    └── runtime-isolation
```

### Components

| Component | Role | Responsibility |
|-----------|------|----------------|
| **Sisyphus** | Orchestrator | Main execution engine, goal decomposition |
| **Prometheus** | Planner | Task breakdown, strategy selection |
| **Metis** | Plan Consultant | Validation, feasibility analysis |
| **Swarm Coordination** | Agent Manager | Agent lifecycle, message routing |
| **Worktree Isolation** | Sandbox Manager | Git worktree lifecycle per agent |

---

## 2. Fan-out/Fan-in Pattern

```
Coordinator
├── Dispatch Agent-1 → Worktree-1
├── Dispatch Agent-2 → Worktree-2
└── Dispatch Agent-3 → Worktree-3
    │
    └── Aggregate Results
        │
        ▼
   ┌─────────────────────────────────┐
   │      Results Pool               │
   │  ├── Agent-1: success + diff     │
   │  ├── Agent-2: success + diff    │
   │  └── Agent-3: success + diff    │
   └─────────────────────────────────┘
        │
        ▼
   ┌─────────────────────────────────┐
   │      Merge Decision             │
   │  • All success → auto-merge     │
   │  • Partial → conflict resolution│
   │  • Any failure → rollback      │
   └─────────────────────────────────┘
```

### Execution Flow

```
Phase 1: Dispatch          Phase 2: Execute          Phase 3: Aggregate
┌──────────────┐         ┌──────────────┐          ┌──────────────┐
│ Coordinator  │         │  Worktree-1  │          │              │
│ fan-out      │────────▶│  Worktree-2  │───async──▶│  Merge       │
│              │         │  Worktree-3  │          │  Results     │
└──────────────┘         └──────────────┘          └──────────────┘
      │                        │                        │
      │ spawn                  │ work                   │ combine
      │                        │                        │
      ▼                        ▼                        ▼
  N agents               parallel exec            final artifact
```

---

## 3. Pipeline Pattern

```
Plan ────▶ Implement ────▶ Review ────▶ Merge
  │             │           │           │
  │             │           │           │
  └─────────────┴───────────┴───────────┘
              (sequential handoff)
```

### Stage Details

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    PLAN     │────▶│  IMPLEMENT  │────▶│   REVIEW    │────▶│    MERGE   │
├─────────────┤     ├─────────────┤     ├─────────────┤     ├─────────────┤
│ Prometheus  │     │ Worker      │     │ Reviewer    │     │ Coordinator │
│ validates   │────▶│ writes code │────▶│ verifies    │────▶│ cherry-pick │
│ task        │     │ in isolated│     │ quality,    │     │ commits to  │
│ structure   │     │ worktree    │     │ security    │     │ main repo   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                  │                  │                  │
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
  Task breakdown    Code artifacts     Approval/        Main branch
  subtask tree      diff bundles       Rejection       updated
```

### Pipeline Gates

```
         ┌────────────────────────────────────────┐
         │              GATE CHECKPOINT           │
         ├────────────────────────────────────────┤
         │  PLAN-gate:    subtasks valid?         │
         │  IMPLEMENT-gate: code compiles?       │
         │  REVIEW-gate:  tests pass?            │
         │  MERGE-gate:   conflicts resolved?    │
         └────────────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
     ✓ PASS                               ✗ FAIL
     proceed to next stage               retry or abort
```

---

## 4. Worktree Isolation

```
main-repo/
├── .git/
│   └── config
├── .worktrees/
│   ├── agent-1-feat-A/
│   │   ├── .git (worktree ref)
│   │   └── src/ (isolated code)
│   ├── agent-2-feat-B/
│   │   └── ...
│   └── agent-3-hotfix/
│       └── ...
└── main-branch/
    └── src/
```

### Worktree Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                    WORKTREE LIFECYCLE                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   create              work              merge        cleanup │
│    │                  │                  │             │    │
│    ▼                  ▼                  ▼             ▼    │
│ ┌────────┐      ┌────────────┐      ┌──────────┐  ┌──────┐ │
│ │branch  │─────▶│ isolated   │─────▶│ cherry-  │─▶│drop  │ │
│ │from    │      │ development│      │ pick to  │  │branch│ │
│ │main    │      │           │      │ main     │  │      │ │
│ └────────┘      └────────────┘      └──────────┘  └──────┘ │
│                                                              │
│  Key features:                                                │
│  • Zero interference between agents                          │
│  • Independent git state per agent                          │
│  • Automatic cleanup on completion                          │
│  • Branch naming: swarm/{agent-id}-{task-name}              │
└──────────────────────────────────────────────────────────────┘
```

### Naming Convention

```
worktree name: swarm/{session_id}-{bead_id}-{feature}

example:
  swarm/ses_abc123/bd_001/auth-service
  swarm/ses_abc123/bd_002/payment-flow
  swarm/ses_xyz789/bd_003/bugfix-login
```

---

## 5. Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │  INPUT VALIDATION│    │ SECRET SCANNING │                   │
│  ├─────────────────┤    ├─────────────────┤                   │
│  │ • task scope     │    │ • git secrets   │                   │
│  │ • file paths     │────▶│ • env vars      │                   │
│  │ • command args   │    │ • API keys      │                   │
│  │ • agent prompts  │    │ • credentials   │                   │
│  └─────────────────┘    └─────────────────┘                   │
│          │                      │                             │
│          ▼                      ▼                             │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │  RATE LIMIT     │    │ AUDIT LOGGING   │                   │
│  ├─────────────────┤    ├─────────────────┤                   │
│  │ • concurrent    │    │ • agent actions │                   │
│  │   agents        │────▶│ • file access   │                   │
│  │ • API calls     │    │ • code changes  │                   │
│  │ • worktree ops  │    │ • merge events  │                   │
│  └─────────────────┘    └─────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Details

#### Input Validation Layer
```
User Task
    │
    ▼
┌────────────────────┐
│ Scope Validation    │ ──── Reject if: task too vague, files outside scope
├────────────────────┤
│ Path Validation     │ ──── Reject if: paths resolve outside project
├────────────────────┤
│ Prompt Sanitization│ ──── Strip dangerous commands, injection attempts
├────────────────────┤
│ Type Validation     │ ──── Verify task structure matches CellTreeSchema
└────────────────────┘
    │
    ▼
Validated Task
```

#### Secret Scanning Layer
```
Code Changes (diff)
    │
    ▼
┌────────────────────┐
│ Pattern Match      │ ──── regex: API keys, tokens, passwords
├────────────────────┤
│ Entropy Detection  │ ──── high entropy strings = suspicious
├────────────────────┤
│ Allowlist Check    │ ──── known safe patterns (test fixtures, etc.)
├────────────────────┤
│ Blocker Action     │ ──── block commit, alert coordinator
└────────────────────┘
    │
    ▼
Scan Result: CLEAN | FLAGGED | BLOCKED
```

#### Rate Limit Handling
```
┌─────────────────────────────────────────┐
│           RATE LIMITER                  │
├─────────────────────────────────────────┤
│  Concurrent Agents: max 5              │
│  API Calls/min:     max 100            │
│  Worktree Ops/min: max 20             │
├─────────────────────────────────────────┤
│  ┌─────────┐   ┌─────────┐             │
│  │ Token   │   │ Queue   │             │
│  │ Bucket  │──▶│ Handler │──▶ Worker  │
│  │ (leaky) │   │ FIFO    │             │
│  └─────────┘   └─────────┘             │
└─────────────────────────────────────────┘
```

#### Audit Logging
```
┌──────────────────────────────────────────────────────────────┐
│                      AUDIT LOG                              │
├──────────────────────────────────────────────────────────────┤
│  TIMESTAMP        AGENT        ACTION        RESOURCE       │
│  ─────────────────────────────────────────────────────────  │
│  2024-01-15 09:31  agent-1    CREATE       worktree/bd_001  │
│  2024-01-15 09:32  agent-1    RESERVE      src/auth/       │
│  2024-01-15 09:45  agent-1    COMMIT       src/auth/ts     │
│  2024-01-15 09:46  agent-2    CREATE       worktree/bd_002  │
│  2024-01-15 09:50  agent-1    MERGE        main            │
│  2024-01-15 10:01  agent-2    RESERVE      src/payment/    │
│  ...                                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Runtime Isolation

```
┌──────────────────────────────────────────────────────────────────┐
│                    RUNTIME ISOLATION                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PORT ALLOCATION TABLE                        │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Worktree          Service             Port              │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  agent-1-feat-A   Next.js Dev       3001                 │   │
│  │  agent-1-feat-A   GraphQL           4001                 │   │
│  │  agent-2-feat-B   Next.js Dev       3002                 │   │
│  │  agent-2-feat-B   WebSocket         4002                 │   │
│  │  agent-3-hotfix   Next.js Dev       3003                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              DATABASE PER WORKTREE                       │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │   worktree-db/                                           │   │
│  │   ├── agent-1-feat-A.db    (SQLite - dev)               │   │
│  │   ├── agent-2-feat-B.db                                 │   │
│  │   ├── agent-3-hotfix.db                                 │   │
│  │   └── main.db              (production reference)       │   │
│  │                                                          │   │
│  │   Each worktree has isolated:                           │   │
│  │   • Database instance                                   │   │
│  │   • Cache (Redis slot)                                 │   │
│  │   • Logs directory                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ENVIRONMENT INJECTION                       │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │   MAIN ENV              WORKTREE OVERLAY                │   │
│  │   ─────────             ─────────────────               │   │
│  │   DATABASE_URL    +     DATABASE_URL=/tmp/wt_{id}.db   │   │
│  │   REDIS_URL           +  REDIS_SLOT={base_slot + n}     │   │
│  │   API_KEY               +  AGENT_ID={agent_name}         │   │
│  │   PORT_BASE=3000       +  PORT={base + worktree_idx}   │   │
│  │                                                          │   │
│  │   Pattern: READONLY base env + WORKTREE-SPECIFIC overrides│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Isolation Summary

```
┌─────────────────────────────────────────────────────────────┐
│              ISOLATION LEVELS                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Level 1: Git Isolation                                      │
│  ────────────────────                                        │
│  • Each agent gets own git worktree                         │
│  • Main repo .git is read-only reference                    │
│  • Branch naming prevents conflicts                        │
│                                                              │
│  Level 2: Process Isolation                                 │
│  ────────────────────────                                   │
│  • Agent processes run in separate worktree dirs           │
│  • No shared file handles                                   │
│  • Port isolation prevents conflicts                        │
│                                                              │
│  Level 3: Data Isolation                                    │
│  ─────────────────────                                      │
│  • Dedicated DB file per worktree                          │
│  • Redis slot separation                                    │
│  • Log streams kept separate                                │
│                                                              │
│  Level 4: Environment Isolation                             │
│  ────────────────────────────                              │
│  • Env vars injected per-worktree                           │
│  • No cross-worktree env pollution                         │
│  • Secrets scoped to worktree lifecycle                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Principles

| Principle | Implementation |
|-----------|----------------|
| **Fault Isolation** | Failures in one worktree don't affect others |
| **Zero Coordination Overhead** | Agents never wait for each other |
| **Deterministic Cleanup** | Worktrees always cleaned, even on failure |
| **Security First** | Every layer validated, scanned, rate-limited |
| **Transparent Debugging** | Logs show which agent did what, when |

---

## Data Flow Summary

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Sisyphus (Orchestrator)                            │
│  ├── Prometheus → decompose task                   │
│  └── Metis → validate plan                         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  Swarm Coordination                                │
│  ├── Strategy selection (fan-out vs pipeline)      │
│  ├── Agent spawning                                │
│  └── Result aggregation                           │
└──────────────────────────┬──────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │Worktree-1 │   │Worktree-2 │   │Worktree-3 │
    │ (Agent-1) │   │ (Agent-2) │   │ (Agent-3) │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Merge Decision
                         │
                         ▼
                 Main Repository
```
