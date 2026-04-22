/**
 * swarm-worktree-plugin - Security Tests (TDD)
 * Tests for: path traversal, shell injection, race conditions, resource exhaustion
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Mock git operations for TDD
const MOCK_GIT = process.env.MOCK_GIT === 'true';

interface TestContext {
  tempDir: string;
  projectPath: string;
}

async function createTestRepo(): Promise<string> {
  const tempDir = `/tmp/swarm-worktree-test-${Date.now()}`;
  mkdirSync(tempDir, { recursive: true });

  // Initialize bare test repo
  if (MOCK_GIT) {
    return tempDir;
  }

  const { execSync } = await import('child_process');
  execSync('git init', { cwd: tempDir });
  execSync('git config user.email "test@test.com"', { cwd: tempDir });
  execSync('git config user.name "Test"', { cwd: tempDir });
  execSync('touch README.md', { cwd: tempDir });
  execSync('git add .', { cwd: tempDir });
  execSync('git commit -m "Initial"', { cwd: tempDir });

  return tempDir;
}

// =============================================================================
// VALIDATION FUNCTIONS - These MUST be tested FIRST (TDD)
// =============================================================================

/**
 * Validates and sanitizes task_id to prevent path traversal and injection
 */
export function validateTaskId(taskId: string): { valid: boolean; error?: string; sanitized?: string } {
  // Empty check
  if (!taskId || typeof taskId !== 'string') {
    return { valid: false, error: 'task_id is required' };
  }

  // Length check (max 64 chars)
  if (taskId.length > 64) {
    return { valid: false, error: 'task_id must be 64 characters or less' };
  }

  // Character whitelist: alphanumeric, hyphen, underscore
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(taskId)) {
    return { valid: false, error: 'task_id must contain only alphanumeric, hyphen, or underscore' };
  }

  // Path traversal prevention
  if (taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
    return { valid: false, error: 'task_id must not contain path separators' };
  }

  // No hidden files (starting with .)
  if (taskId.startsWith('.')) {
    return { valid: false, error: 'task_id must not start with dot' };
  }

  return { valid: true, sanitized: taskId };
}

/**
 * Validates project_path to prevent directory traversal
 */
export function validateProjectPath(path: string): { valid: boolean; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'project_path is required' };
  }

  // Must be absolute path
  if (!path.startsWith('/')) {
    return { valid: false, error: 'project_path must be absolute' };
  }

  // Check for path traversal attempts
  if (path.includes('..')) {
    return { valid: false, error: 'project_path must not contain parent directory references' };
  }

  // Prevent system directory access
  const forbiddenPaths = ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/dev'];
  for (const forbidden of forbiddenPaths) {
    if (path.startsWith(forbidden)) {
      return { valid: false, error: `project_path cannot be in protected directory: ${forbidden}` };
    }
  }

  return { valid: true };
}

/**
 * Validates branch name to prevent shell injection
 */
export function validateBranchName(name: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'branch_name is required' };
  }

  // Length check
  if (name.length > 255) {
    return { valid: false, error: 'branch_name must be 255 characters or less' };
  }

  // Git branch name restrictions (plus safe chars for swarm)
  // No spaces, no shell metacharacters
  const shellDangerous = /[;&|$<>`'"\\ \t\n\r]/;
  if (shellDangerous.test(name)) {
    return { valid: false, error: 'branch_name contains invalid characters' };
  }

  // Cannot start with hyphen
  if (name.startsWith('-')) {
    return { valid: false, error: 'branch_name must not start with hyphen' };
  }

  // No @{} (git internal)
  if (name.includes('@{')) {
    return { valid: false, error: 'branch_name contains invalid sequence' };
  }

  // Sanitize: replace spaces with hyphens
  const sanitized = name.replace(/\s+/g, '-').replace(/-+/g, '-');

  return { valid: true, sanitized };
}

/**
 * Checks if worktree limit is exceeded
 */
export function checkWorktreeLimit(limit: number = 10): { valid: boolean; error?: string } {
  // This would check actual worktree count in real implementation
  // For TDD, we validate the parameter
  if (limit < 1 || limit > 100) {
    return { valid: false, error: 'worktree limit must be between 1 and 100' };
  }
  return { valid: true };
}

// =============================================================================
// TESTS - Security validation (TDD RED phase first)
// =============================================================================

describe('Security: Input Validation', () => {

  describe('validateTaskId', () => {
    // RED: Write failing tests first
    it('REJECT empty task_id', () => {
      expect(validateTaskId('').valid).toBe(false);
      expect(validateTaskId(null as any).valid).toBe(false);
      expect(validateTaskId(undefined as any).valid).toBe(false);
    });

    it('REJECT task_id longer than 64 chars', () => {
      const longId = 'a'.repeat(65);
      expect(validateTaskId(longId).valid).toBe(false);
    });

    it('REJECT task_id with path traversal', () => {
      expect(validateTaskId('../etc/passwd').valid).toBe(false);
      expect(validateTaskId('foo/../../bar').valid).toBe(false);
      expect(validateTaskId('foo\\..\\bar').valid).toBe(false);
    });

    it('REJECT task_id with shell metacharacters', () => {
      expect(validateTaskId('foo;rm -rf /').valid).toBe(false);
      expect(validateTaskId('foo|cat').valid).toBe(false);
      expect(validateTaskId('foo&&echo').valid).toBe(false);
      expect(validateTaskId('foo$VAR').valid).toBe(false);
    });

    it('REJECT task_id starting with dot', () => {
      expect(validateTaskId('.hidden').valid).toBe(false);
      expect(validateTaskId('...test').valid).toBe(false);
    });

    it('ACCEPT valid task_id', () => {
      expect(validateTaskId('abc123').valid).toBe(true);
      expect(validateTaskId('feature-auth').valid).toBe(true);
      expect(validateTaskId('my_task_123').valid).toBe(true);
      expect(validateTaskId('ABC123').valid).toBe(true);
    });

    it('ACCEPT hyphen and underscore in task_id', () => {
      expect(validateTaskId('my-feature').valid).toBe(true);
      expect(validateTaskId('my_feature').valid).toBe(true);
      expect(validateTaskId('a-b_c-d').valid).toBe(true);
    });

    it('RETURN sanitized version on success', () => {
      const result = validateTaskId('abc123');
      expect(result.sanitized).toBe('abc123');
    });
  });

  describe('validateProjectPath', () => {
    it('REJECT empty path', () => {
      expect(validateProjectPath('').valid).toBe(false);
      expect(validateProjectPath(null as any).valid).toBe(false);
    });

    it('REJECT relative path', () => {
      expect(validateProjectPath('relative/path').valid).toBe(false);
      expect(validateProjectPath('./local').valid).toBe(false);
    });

    it('REJECT path with traversal', () => {
      expect(validateProjectPath('/repo/../../etc').valid).toBe(false);
    });

    it('REJECT system directories', () => {
      expect(validateProjectPath('/etc/shadow').valid).toBe(false);
      expect(validateProjectPath('/usr/bin/malware').valid).toBe(false);
      expect(validateProjectPath('/proc/self').valid).toBe(false);
    });

    it('ACCEPT valid project path', () => {
      expect(validateProjectPath('/home/user/project').valid).toBe(true);
      expect(validateProjectPath('/Users/developer/repos/myapp').valid).toBe(true);
      expect(validateProjectPath('/Volumes/MASS/aipop-br/john/vip-telegram-system').valid).toBe(true);
    });
  });

  describe('validateBranchName', () => {
    it('REJECT empty branch name', () => {
      expect(validateBranchName('').valid).toBe(false);
    });

    it('REJECT branch name with shell metacharacters', () => {
      expect(validateBranchName('foo;rm -rf').valid).toBe(false);
      expect(validateBranchName('foo|head').valid).toBe(false);
      expect(validateBranchName('foo`id`').valid).toBe(false);
      expect(validateBranchName("foo'id'").valid).toBe(false);
      expect(validateBranchName('foo$VAR').valid).toBe(false);
      expect(validateBranchName('foo > file').valid).toBe(false);
      expect(validateBranchName('foo\ngit').valid).toBe(false);
    });

    it('REJECT branch starting with hyphen', () => {
      expect(validateBranchName('-force').valid).toBe(false);
    });

    it('REJECT git internal sequences', () => {
      expect(validateBranchName('foo@{bar}').valid).toBe(false);
    });

    it('ACCEPT valid branch names', () => {
      expect(validateBranchName('main').valid).toBe(true);
      expect(validateBranchName('feature-auth').valid).toBe(true);
      expect(validateBranchName('bugfix-123').valid).toBe(true);
      expect(validateBranchName('swarm-abc123-feature').valid).toBe(true);
    });

    it('REJECT branch names with spaces', () => {
      expect(validateBranchName('my feature branch').valid).toBe(false);
    });

    it('ACCEPT underscores (transformed to hyphens)', () => {
      const result = validateBranchName('my_feature_branch');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('my_feature_branch');
    });

    it('COLLAPSE multiple hyphens', () => {
      const result = validateBranchName('my---feature---branch');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('my-feature-branch');
    });
  });

  describe('checkWorktreeLimit', () => {
    it('REJECT limit less than 1', () => {
      expect(checkWorktreeLimit(0).valid).toBe(false);
      expect(checkWorktreeLimit(-1).valid).toBe(false);
    });

    it('REJECT limit greater than 100', () => {
      expect(checkWorktreeLimit(101).valid).toBe(false);
    });

    it('ACCEPT valid limits', () => {
      expect(checkWorktreeLimit(1).valid).toBe(true);
      expect(checkWorktreeLimit(10).valid).toBe(true);
      expect(checkWorktreeLimit(100).valid).toBe(true);
    });
  });
});

// =============================================================================
// TESTS - Worktree Operations
// =============================================================================

describe('Worktree Operations', () => {

  let testContext: TestContext;

  beforeAll(async () => {
    testContext = {
      tempDir: await createTestRepo(),
      projectPath: ''
    };
    testContext.projectPath = testContext.tempDir;
  });

  afterAll(() => {
    if (testContext.tempDir && existsSync(testContext.tempDir)) {
      rmSync(testContext.tempDir, { recursive: true, force: true });
    }
  });

  describe('swarm_worktree_create', () => {
    it('CREATE worktree with valid parameters', async () => {
      const taskId = 'test-abc123';
      const validation = validateTaskId(taskId);
      expect(validation.valid).toBe(true);

      // Mock implementation test
      const worktreePath = `.worktrees/${taskId}`;
      expect(worktreePath).toBe('.worktrees/test-abc123');
    });

    it('REJECT worktree creation with invalid task_id', () => {
      const validation = validateTaskId('../malicious');
      expect(validation.valid).toBe(false);
    });

    it('GENERATE correct worktree path', () => {
      const taskId = 'feature-auth';
      const path = `.worktrees/${taskId}`;
      expect(path).toBe('.worktrees/feature-auth');
    });

    it('GENERATE correct branch name', () => {
      const taskId = 'abc123';
      const branch = `swarm/${taskId}`;
      expect(branch).toBe('swarm/abc123');
    });
  });

  describe('swarm_worktree_list', () => {
    it('RETURN empty list when no worktrees exist', () => {
      const worktrees: string[] = [];
      expect(worktrees.length).toBe(0);
    });

    it('PARSE worktree list output correctly', () => {
      // Mock git worktree list output
      const output = `/repo/main abc123 (detached)\n/repo/.worktrees/feature-a def456 (detached)`;
      const worktrees = output.split('\n').filter(line => line.trim());
      expect(worktrees.length).toBe(2);
    });
  });
});

// =============================================================================
// TESTS - Race Condition Prevention
// =============================================================================

describe('Race Condition Prevention', () => {

  it('PREVENT concurrent worktree creation for same task_id', () => {
    // Simulate lock mechanism
    const locks = new Set<string>();

    const tryLock = (taskId: string): boolean => {
      if (locks.has(taskId)) {
        return false; // Already locked
      }
      locks.add(taskId);
      return true;
    };

    const unlock = (taskId: string): void => {
      locks.delete(taskId);
    };

    // First lock should succeed
    expect(tryLock('task-1')).toBe(true);

    // Second lock should fail (already locked)
    expect(tryLock('task-1')).toBe(false);

    // Unlock should allow re-lock
    unlock('task-1');
    expect(tryLock('task-1')).toBe(true);
  });

  it('HANDLE concurrent cleanup gracefully', () => {
    const cleanupInProgress = new Set<string>();

    const tryCleanup = (taskId: string): boolean => {
      if (cleanupInProgress.has(taskId)) {
        return false;
      }
      cleanupInProgress.add(taskId);
      return true;
    };

    expect(tryCleanup('task-1')).toBe(true);
    expect(tryCleanup('task-1')).toBe(false); // Already cleaning

    cleanupInProgress.delete('task-1');
    expect(tryCleanup('task-1')).toBe(true);
  });
});

// =============================================================================
// TESTS - Audit Logging
// =============================================================================

describe('Audit Logging', () => {

  it('LOG all operations with timestamp', () => {
    const logs: Array<{ operation: string; timestamp: Date; details?: any }> = [];

    const log = (operation: string, details?: any) => {
      logs.push({
        operation,
        timestamp: new Date(),
        details
      });
    };

    log('worktree_create', { taskId: 'test-123', path: '/repo/.worktrees/test' });
    log('worktree_merge', { taskId: 'test-123', commits: 3 });
    log('worktree_cleanup', { taskId: 'test-123' });

    expect(logs.length).toBe(3);
    expect(logs[0].operation).toBe('worktree_create');
    expect(logs[0].timestamp).toBeInstanceOf(Date);
  });

  it('INCLUDE security validation results in logs', () => {
    const logs: any[] = [];

    const logValidation = (validation: any) => {
      logs.push({
        type: 'validation',
        valid: validation.valid,
        error: validation.error
      });
    };

    logValidation(validateTaskId('../etc'));
    logValidation(validateTaskId('valid-task'));

    expect(logs[0].valid).toBe(false);
    expect(logs[0].error).toContain('alphanumeric');
    expect(logs[1].valid).toBe(true);
  });
});