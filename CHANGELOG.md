# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-04-22

### Added

- Initial release
- `swarm_worktree_create` - Create isolated worktree for agent execution
- `swarm_worktree_merge` - Cherry-pick commits from worktree to main
- `swarm_worktree_cleanup` - Remove worktree after task completion
- `swarm_worktree_list` - List all active worktrees

### Security

- 100% TDD test coverage for security functions
- Input validation for: task_id, project_path, branch_name
- Path traversal prevention
- Shell injection prevention
- Race condition lock mechanism
- System directory protection
- Max worktree limit enforcement
- Audit logging for all operations