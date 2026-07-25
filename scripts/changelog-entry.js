#!/usr/bin/env node
//
// Writes the changelog entry for an automated dependency-update branch, as a
// pending fragment under changelog.d/ (see changelog.d/README.md).
//
// Runs as a Renovate postUpgradeTask (see renovate.json). Renovate writes the
// manifest updates into the working tree and runs this *before* committing, so
// the pending diff is exactly the list of what changed — which is what this reads.
//
// Deriving the entry from the diff rather than from Renovate's own template data
// is deliberate: it keeps the script runnable and testable outside Renovate, and
// it survives changing (or dropping) the bot that calls it. The cost is the
// per-manifest patterns below, which have to be extended when a new kind of
// pinned version enters the repo.
//
// The text it produces is factual — what moved, and between which versions.
// Nothing here can know *why* a bump matters, which is the part this changelog is
// actually written for, so expand the wording by hand when an update deserves it
// (the v0.10.3 entry is the house voice to aim at).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const fragmentDir = path.join(__dirname, '../changelog.d');

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

// Each entry turns a changed line into [name, version]. Anything that doesn't
// match is skipped, so unrelated edits inside these files are ignored rather than
// mistaken for a dependency.
const SOURCES = [
  {
    label: 'Go modules',
    covers: (file) => file === 'backend/go.mod',
    read: (line) => line.match(/^\s*([\w.\-]+\.[\w.\-/]+)\s+v(\S+)/),
  },
  {
    label: 'Frontend packages',
    covers: (file) => file === 'frontend/package.json',
    // The version guard keeps `"name": "fintraffic-frontend"` and the scripts
    // block out of the entry — only values that start like a version count.
    read: (line) => line.match(/^\s*"([^"]+)":\s*"[~^]?(\d\S*)"/),
  },
  {
    label: 'GitHub Actions',
    covers: (file) => file.startsWith('.github/workflows/'),
    read: (line) => line.match(/uses:\s*([\w.\-]+\/[\w.\-/]+)@(\S+)/),
  },
  {
    label: 'Container images',
    covers: (file) => file === 'Dockerfile',
    read: (line) => line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s:]+):(\S+?)(?:\s+AS\s+\S+)?$/i),
  },
  {
    label: 'Deploy stack images',
    covers: (file) => file.startsWith('deploy/'),
    read: (line) => line.match(/^\s*-?\s*image:\s*([^\s:]+):(\S+)/),
  },
];

// Renovate runs this before it commits, so the updates are unstaged. Falling back
// to the last commit covers running it by hand on an already-committed branch.
let diff = git('diff --unified=0');
if (!diff.trim()) diff = git('diff --unified=0 HEAD~1 HEAD');
if (!diff.trim()) {
  console.log('No pending changes found — writing no changelog entry.');
  process.exit(0);
}

const groups = new Map();
let source = null;

for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) {
    const file = line.slice(4).replace(/^b\//, '');
    source = SOURCES.find((s) => s.covers(file)) || null;
    continue;
  }
  if (!source || line.startsWith('+++') || line.startsWith('---')) continue;

  const added = line.startsWith('+');
  const removed = line.startsWith('-');
  if (!added && !removed) continue;

  const found = source.read(line.slice(1));
  if (!found) continue;

  const [, name, version] = found;
  if (!groups.has(source.label)) groups.set(source.label, new Map());
  const deps = groups.get(source.label);
  if (!deps.has(name)) deps.set(name, {});
  deps.get(name)[added ? 'to' : 'from'] = version;
}

// A name has to appear on both sides at a different version to be an upgrade:
// that drops added-and-removed noise and dependencies merely reordered in a file.
const bullets = [];
for (const [label, deps] of groups) {
  const moved = [...deps.entries()].filter(([, v]) => v.from && v.to && v.from !== v.to);
  if (moved.length === 0) continue;
  // A long tail buries the bumps worth reading, so cap the list.
  const shown = moved.slice(0, 8).map(([name, v]) => `\`${name}\` ${v.from} → ${v.to}`).join(', ');
  const rest = moved.length - 8;
  bullets.push(`- **${label} updated**: ${shown}${rest > 0 ? `, and ${rest} more` : ''}.`);
}

if (bullets.length === 0) {
  console.log('No dependency version changes recognised — writing no changelog entry.');
  process.exit(0);
}

// No version is written here, and none is predicted. The entry goes into a file
// of its own under changelog.d/, and CI attaches the real tag when it folds the
// pending entries after the merge (scripts/changelog-fold.js). That removes the
// two things this script used to get wrong whenever another PR merged first: the
// guessed version, and the collision with every other branch editing the top of
// CHANGELOG.md.
//
// The filename is the branch, so a split-out major update and the grouped
// non-major one write separate files instead of fighting over one. Writing the
// same file on a rerun is the point — it replaces the previous run's text.
const branch = git('rev-parse --abbrev-ref HEAD').trim();
const slug = branch.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'renovate';
const outPath = path.join(fragmentDir, `${slug}.md`);

fs.mkdirSync(fragmentDir, { recursive: true });
fs.writeFileSync(outPath, `### Changed\n${bullets.join('\n')}\n`, 'utf8');
console.log(
  `Wrote ${path.relative(path.join(__dirname, '..'), outPath)} covering ${bullets.length} dependency group(s).`
);
