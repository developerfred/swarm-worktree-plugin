---
name: swarm-worktree-plugin
description: |
  Git worktree-based isolation for OpenCode swarm multi-agent workflows.
  Provides tools for creating isolated worktree environments per agent,
  enabling parallel development without git branch conflicts.
tools:
  - name: swarm_worktree_create
    description: Create a git worktree for isolated agent execution
    parameters:
      - name: project_path
        type: string
        required: true
        description: Path to the git repository
      - name: task_id
        type: string
        required: true
        description: Unique task ID (used for branch naming)
      - name: start_commit
        type: string
        required: false
        description: Commit to start from (defaults to HEAD)
    returns:
      type: object
      properties:
        worktree_path: string
        branch_name: string

  - name: swarm_worktree_merge
    description: Cherry-pick commits from worktree back to main branch
    parameters:
      - name: project_path
        type: string
        required: true
      - name: task_id
        type: string
        required: true
    returns:
      type: object
      properties:
        success: boolean
        commit_count: number

  - name: swarm_worktree_cleanup
    description: Remove worktree after task completion
    parameters:
      - name: project_path
        type: string
        required: true
      - name: task_id
        type: string
        required: false
      - name: cleanup_all
        type: boolean
        required: false
        description: Clean up all worktrees (except main)
    returns:
      type: object
      properties:
        removed: string[]

  - name: swarm_worktree_list
    description: List all active worktrees for project
    parameters:
      - name: project_path
        type: string
        required: true
    returns:
      type: object
      properties:
        worktrees: array
---

# Swarm Worktree Plugin

Plugin for git worktree-based agent isolation in OpenCode swarm workflows.

## How It Works

1. **Create**: Each subtask agent gets its own worktree with a unique branch (task_id)
2. **Execute**: Agent works in isolated environment, no conflicts with other agents
3. **Merge**: Completed worktree changes cherry-picked back to main
4. **Cleanup**: Worktree removed after successful merge

## Branch Naming

- Branch: `swarm/{task_id}` (e.g., `swarm/abc123-feature-auth`)
- Worktree: `.worktrees/{task_id}-{slug}/`

## Integration

This plugin integrates with the swarm-coordination skill and provides
the underlying tools for the swarm_worktree_* operations.

## Example Usage

```typescript
// Coordinator spawns worker in isolated worktree
const { worktree_path } = await swarm_worktree_create({
  project_path: "/path/to/repo",
  task_id: "abc123"
});

// Worker operates in worktree_path
// ...

// On completion, merge back
await swarm_worktree_merge({
  project_path: "/path/to/repo",
  task_id: "abc123"
});
```