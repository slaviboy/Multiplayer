// Points git at the versioned hooks in .githooks/ (runs on `npm install` via the
// "prepare" script) and records who is expected to author commits, in local git
// config only (hooks.author), so no e-mail address is stored in the repository.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.git')) process.exit(0);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return '';
  }
};

try {
  git('config', 'core.hooksPath', '.githooks');
  console.log('git hooks: core.hooksPath -> .githooks');
  if (!tryGit('config', '--get', 'hooks.author')) {
    const name = tryGit('config', 'user.name');
    const email = tryGit('config', 'user.email');
    if (name && email) {
      git('config', 'hooks.author', `${name} <${email}>`);
      console.log(`git hooks: commits are expected from ${name}`);
    }
  }
} catch {
  console.warn('git hooks: could not configure git (is git installed?)');
}
