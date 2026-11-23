// Points git at the versioned hooks in .githooks/ (runs on `npm install` via the "prepare" script).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.git')) process.exit(0);
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  console.log('git hooks: core.hooksPath -> .githooks');
} catch {
  console.warn('git hooks: could not set core.hooksPath (is git installed?)');
}
