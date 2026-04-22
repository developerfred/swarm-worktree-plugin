---
name: security-audit-swarm-worktree
description: |
  Security audit for swarm-worktree-plugin. Triggers: 'security audit', 'pentest', 'vulnerability scan', 'fix security issue', 'secure plugin'.
  Runs comprehensive security analysis on the plugin.
---

# Security Audit - swarm-worktree-plugin

## Threat Model

### Attack Vectors

1. **Path Traversal** - Malicious task_id with `../` could escape worktree directory
2. **Branch Name Injection** - Shell characters in branch names could execute arbitrary commands
3. **Race Conditions** - Concurrent worktree operations could corrupt repo state
4. **Resource Exhaustion** - Creating unlimited worktrees could fill disk
5. **Git Hijacking** - Malicious repo path could point to system directories

### Security Requirements (TDD)

All functions MUST:
- [ ] Sanitize task_id (alphanumeric + hyphen only, max 64 chars)
- [ ] Validate project_path is within allowed directories
- [ ] Reject branch names with shell metacharacters (`;|&$<>``')
- [ ] Use `--no-recurse-submodules` for safe operations
- [ ] Implement timeout for all git operations
- [ ] Limit concurrent worktrees (max 10 per repo)
- [ ] Store no secrets in worktree metadata

## Validation Checklist

- [ ] Input validation on all public functions
- [ ] Shell injection prevention in branch names
- [ ] Path traversal prevention in paths
- [ ] Concurrent access safety
- [ ] Resource cleanup on errors
- [ ] Audit logging for all operations