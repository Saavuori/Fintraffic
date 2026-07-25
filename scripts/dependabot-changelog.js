#!/usr/bin/env node
//
// Writes the CHANGELOG.md entry for a Dependabot pull request.
//
// Dependabot doesn't write changelog entries and this repo wants one on every PR
// (see CLAUDE.md), so .github/workflows/dependabot-changelog.yml runs this with
// dependabot/fetch-metadata's JSON in UPDATED_DEPENDENCIES and commits the result
// back onto the PR branch.
//
// Usage: node scripts/dependabot-changelog.js <base-changelog.md>
//
// The entry is deliberately factual: what moved, and from which version to which.
// Nothing here can know *why* a bump matters, which is the part this changelog is
// actually written for — expand the wording by hand when an update deserves it
// (the v0.10.3 entry is the house voice to aim at).

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../CHANGELOG.md');
const basePath = process.argv[2];

if (!basePath) {
  console.error('usage: dependabot-changelog.js <base-changelog.md>');
  process.exit(1);
}

const raw = process.env.UPDATED_DEPENDENCIES || '[]';
let deps;
try {
  deps = JSON.parse(raw);
} catch {
  console.error('UPDATED_DEPENDENCIES is not valid JSON; refusing to guess.');
  process.exit(1);
}
if (!Array.isArray(deps) || deps.length === 0) {
  console.log('No updated dependencies reported — leaving CHANGELOG.md alone.');
  process.exit(0);
}

// The version has to be predicted, same as for a hand-written PR: the real tag is
// only minted by CI after the merge. `chore(deps)` is neither `feat:` nor a
// breaking change, and paulhatch/semantic-version treats everything else as a
// patch — so the prediction is always the base branch's top version, patch + 1.
const HEADING = /^## \[v(\d+)\.(\d+)\.(\d+)\]/m;

const baseMatch = fs.readFileSync(basePath, 'utf8').match(HEADING);
if (!baseMatch) {
  console.error('No `## [vX.Y.Z]` heading found in the base CHANGELOG.md.');
  process.exit(1);
}
const [, major, minor, patch] = baseMatch;
const version = `v${major}.${minor}.${Number(patch) + 1}`;

// Dependabot and fetch-metadata don't agree on spelling for every ecosystem, so
// accept both and fall back to the raw value rather than dropping the group.
const ECOSYSTEMS = {
  gomod: 'Go modules',
  go_modules: 'Go modules',
  npm: 'Frontend packages',
  npm_and_yarn: 'Frontend packages',
  github_actions: 'GitHub Actions',
  docker: 'Container images',
};

const groups = new Map();
for (const dep of deps) {
  const label = ECOSYSTEMS[dep.packageEcosystem] || dep.packageEcosystem || 'Dependencies';
  if (!groups.has(label)) groups.set(label, []);
  groups.get(label).push(dep);
}

function describe(dep) {
  const name = `\`${dep.dependencyName}\``;
  // prevVersion/newVersion are absent for some ecosystems; name alone still reads.
  return dep.prevVersion && dep.newVersion
    ? `${name} ${dep.prevVersion} → ${dep.newVersion}`
    : name;
}

const bullets = [];
for (const [label, items] of groups) {
  // A long tail of indirect bumps buries the ones worth reading, so cap the list.
  const shown = items.slice(0, 8).map(describe).join(', ');
  const rest = items.length - 8;
  const tail = rest > 0 ? `, and ${rest} more` : '';
  bullets.push(`- **${label} updated**: ${shown}${tail}.`);
}

const date = new Date().toISOString().slice(0, 10);
const section = `## [${version}] - ${date}\n\n### Changed\n${bullets.join('\n')}\n`;

// Idempotent: a rerun (Dependabot pushing a follow-up commit to the same branch)
// must replace the section it wrote last time, not stack a second copy on top.
const lines = fs.readFileSync(mdPath, 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start !== -1) {
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ')) end++;
  lines.splice(start, end - start);
}

// Insert above the newest existing release, below the file's intro paragraph.
const firstRelease = lines.findIndex((l) => l.startsWith('## ['));
const at = firstRelease === -1 ? lines.length : firstRelease;
lines.splice(at, 0, ...section.split('\n'));

fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${version} entry covering ${deps.length} dependency update(s).`);
