# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it via:

1. **GitHub Security Advisories**: https://github.com/developerfred/swarm-worktree-plugin/security/advisories/new
2. **Email**: (for sensitive issues, contact maintainer directly)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

## Security Requirements

All contributions MUST:

1. Pass security validation tests
2. Maintain 100% test coverage for security functions
3. Include input sanitization for all public functions
4. Document any new attack vectors in threat model

## Threat Model

### Attack Vectors

1. **Path Traversal** - Malicious task_id with `../` could escape worktree directory
2. **Shell Injection** - Branch names with metacharacters could execute arbitrary commands
3. **Race Conditions** - Concurrent worktree operations could corrupt repo state
4. **Resource Exhaustion** - Creating unlimited worktrees could fill disk
5. **Git Hijacking** - Malicious repo path could point to system directories

### Mitigations

| Vector | Mitigation |
|--------|------------|
| Path Traversal | Input whitelist validation, traversal detection |
| Shell Injection | Character blacklist + whitelist approach |
| Race Conditions | Lock mechanism per task_id |
| Resource Exhaustion | Configurable max worktree limit |
| Git Hijacking | System directory path protection |

## Security Testing

Run security tests:

```bash
bun test __tests__/security.test.ts
```

Tests validate:
- Input sanitization
- Shell metacharacter blocking
- Path traversal prevention
- Race condition safety
- Audit logging completeness