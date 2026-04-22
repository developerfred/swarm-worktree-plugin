# swarm-worktree-plugin

Git worktree-based isolation for OpenCode swarm multi-agent workflows. Enable parallel AI agents to work on separate branches without git conflicts.

## Problem

When running multiple AI agents on the same repository, they overwrite each other's files and cause git conflicts. Each agent needs its own branch and working directory to work in isolation.

## Solution

This plugin provides git worktree-based isolation for OpenCode swarm workflows:

```
main-repo/
├── .git/
└── worktrees/
    ├── agent-1-feature-A/  (branch: swarm/agent-1-feature-A)
    ├── agent-2-feature-B/  (branch: swarm/agent-2-feature-B)
    └── agent-3-hotfix/     (branch: swarm/agent-3-hotfix)
```

Each agent operates in its own worktree with its own branch. No file conflicts. No git state corruption.

## Features

- **Isolated Execution**: Each swarm agent gets its own git worktree and branch
- **Security Validated**: All inputs sanitized to prevent path traversal and shell injection
- **Race Condition Prevention**: Lock mechanism prevents concurrent worktree operations on same task
- **Resource Limits**: Configurable max worktrees per repository (default: 10)
- **Audit Logging**: All operations logged with timestamps for debugging
- **TDD Tested**: 100% test coverage with security-first approach

## Security

### Input Validation

All public functions validate inputs:

- `task_id`: Alphanumeric + hyphen/underscore only, max 64 chars, no path separators
- `project_path`: Must be absolute path, no traversal, cannot be system directories
- `branch_name`: No shell metacharacters (`;&|$<>`'"`\\`), no git internal sequences

### Threat Model

| Attack Vector | Protection |
|---------------|------------|
| Path Traversal | Input sanitization + traversal detection |
| Shell Injection | Character whitelist + metacharacter blocking |
| Race Conditions | Lock mechanism per task_id |
| Resource Exhaustion | Max worktree limit enforcement |
| Git Hijacking | System directory protection |

## Installation

```bash
# Clone the plugin
git clone https://github.com/developerfred/swarm-worktree-plugin.git ~/.config/opencode/plugins/swarm-worktree-plugin

# Verify installation
ls -la ~/.config/opencode/plugins/swarm-worktree-plugin/
```

## Usage

### OpenCode Swarm Integration

```typescript
// Before spawning agent, create worktree
const { worktree_path } = await swarm_worktree_create({
  project_path: "/path/to/repo",
  task_id: "abc123"
});

// Agent works in isolated environment
// ...

// On completion, merge back
await swarm_worktree_merge({
  project_path: "/path/to/repo",
  task_id: "abc123"
});

// Cleanup worktree
await swarm_worktree_cleanup({
  project_path: "/path/to/repo",
  task_id: "abc123"
});
```

### Manual Usage

```bash
# Create worktree with new branch
git worktree add -b swarm/feature-auth .worktrees/feature-auth main

# List worktrees
git worktree list

# Remove worktree after merge
git worktree remove .worktrees/feature-auth
git branch -d swarm/feature-auth
```

## API

### swarm_worktree_create

Create isolated worktree for agent execution.

```typescript
swarm_worktree_create({
  project_path: string,    // Required: absolute path to git repo
  task_id: string,         // Required: unique task identifier
  start_commit?: string    // Optional: commit to start from
}): {
  worktree_path: string,   // Path to created worktree
  branch_name: string      // Name of created branch
}
```

### swarm_worktree_merge

Cherry-pick commits from worktree back to main.

```typescript
swarm_worktree_merge({
  project_path: string,
  task_id: string
}): {
  success: boolean,
  commit_count: number
}
```

### swarm_worktree_cleanup

Remove worktree after task completion.

```typescript
swarm_worktree_cleanup({
  project_path: string,
  task_id?: string,        // Specific task to clean
  cleanup_all?: boolean    // Clean all worktrees
}): {
  removed: string[]
}
```

### swarm_worktree_list

List all active worktrees.

```typescript
swarm_worktree_list({
  project_path: string
}): {
  worktrees: Array<{
    path: string,
    branch: string,
    commit: string
  }>
}
```

## Architecture

```
swarm-worktree-plugin/
├── SKILL.md              # OpenCode skill definition
├── package.json          # Plugin manifest
├── __tests__/
│   └── security.test.ts  # Security tests (TDD)
├── scripts/              # Helper scripts
└── references/          # Documentation
```

## Branch Naming

- Branch: `swarm/{task_id}` (e.g., `swarm/abc123-feature-auth`)
- Worktree: `.worktrees/{task_id}-{slug}/`

## Limitations

Worktrees solve git isolation but NOT runtime isolation:

- Same `localhost:PORT` conflict - use worktree-specific `.env.local`
- Same database - use separate database per worktree

For runtime isolation, use environment-based port allocation:

| Worktree | Branch | Port |
|----------|--------|------|
| main | main | 3000 |
| feature-auth | swarm/feature-auth | 3001 |
| feature-payments | swarm/feature-payments | 3002 |

## Why This Exists

When running multiple AI coding agents on the same repo:

1. File conflicts - agents overwrite each other's changes
2. Git state corruption - concurrent git operations break repo
3. Context pollution - agent sees files from other branches

Git worktrees solve this by giving each agent its own:
- Working directory
- Git index
- HEAD reference

All while sharing the same `.git` object database.

## Alternative Approaches

| Approach | Pros | Cons |
|----------|------|------|
| Git Worktrees | Native git, no duplication | Runtime isolation still needed |
| Full Clone | Complete isolation | Duplicated history, sync issues |
| Docker Containers | Strong isolation | Heavy, complex networking |
| SpecKitty | Automated | Only works with specific agents |

This plugin implements git worktrees with OpenCode swarm integration.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`bun test`)
4. Commit changes (ensure 100% test coverage)
5. Open PR

## License

MIT

## Related

- [OpenCode Swarm](https://opencode.ai/docs/agents/) - Multi-agent coordination
- [Git Worktrees](https://git-scm.com/docs/git-worktree) - Official documentation
- [Claude Code Worktrees](https://docs.anthropic.com/en/docs/claude-code) - Parallel agent execution