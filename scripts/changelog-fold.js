#!/usr/bin/env node
//
// Folds pending changelog fragments from changelog.d/ into CHANGELOG.md under
// the version they actually shipped in.
//
// Runs on main after the tag job has minted a tag (see docker-build.yml). It is
// the half of the changelog convention that knows about versions: a pull request
// writes an entry with no version at all, into a file of its own, and this
// attaches the number afterwards. That split is the whole point — two PRs open at
// once can't conflict over a file neither of them shares, and neither has to
// predict a tag that CI won't mint until after the merge.
//
// The version a fragment belongs to is derived, not guessed: the fragment lands
// in the merge commit, CI tags that commit, so the earliest tag containing it is
// its release by construction. A fragment no tag contains yet is left alone for a
// later run rather than folded into the wrong version.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mdPath = path.join(root, 'CHANGELOG.md');
const fragmentDir = path.join(root, 'changelog.d');

// Keep a Changelog's order, plus the "Notes" section this project uses for the
// context that isn't a change. Anything else keeps the order it arrived in,
// after these.
const SECTION_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security', 'Notes'];

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** [major, minor, patch] for comparison; null for anything not vX.Y.Z. */
function parseVersion(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Descending: newest version first, matching the file's own order. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/**
 * Splits a fragment (or an existing release body) into section → bullets.
 * A bullet runs until the next bullet, heading or blank line, so a wrapped entry
 * survives the round trip as the single bullet it was written as.
 */
function parseSections(text) {
  const sections = new Map();
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();

    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      current = heading[1].trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }

    if (!current) continue;

    if (/^[-*]\s+/.test(line)) {
      sections.get(current).push(line.replace(/^[*]\s+/, '- '));
      continue;
    }

    // A continuation of the bullet above it (an indented or wrapped line).
    const bullets = sections.get(current);
    if (line.trim() !== '' && bullets.length > 0) {
      bullets[bullets.length - 1] += `\n${line}`;
    }
  }

  // Headings with nothing under them carry no information and would render as
  // an empty category.
  for (const [name, bullets] of sections) {
    if (bullets.length === 0) sections.delete(name);
  }
  return sections;
}

/** Merges b into a in place, dropping bullets a already has verbatim. */
function mergeSections(a, b) {
  for (const [name, bullets] of b) {
    if (!a.has(name)) a.set(name, []);
    const into = a.get(name);
    for (const bullet of bullets) {
      if (!into.includes(bullet)) into.push(bullet);
    }
  }
}

function orderedSectionNames(sections) {
  const known = SECTION_ORDER.filter((name) => sections.has(name));
  const rest = [...sections.keys()].filter((name) => !SECTION_ORDER.includes(name));
  return [...known, ...rest];
}

function renderRelease(version, date, sections) {
  const out = [`## [${version}] - ${date}`, ''];
  for (const name of orderedSectionNames(sections)) {
    out.push(`### ${name}`);
    out.push(...sections.get(name));
    out.push('');
  }
  return out.join('\n');
}

/**
 * Splits CHANGELOG.md into its intro and its release sections, so a fold can
 * rewrite one release without reflowing the other thirty-five. Only a release
 * that is actually being folded into gets re-rendered.
 */
function parseChangelog(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((line, i) => {
    if (/^## \[/.test(line)) starts.push(i);
  });

  const intro = lines.slice(0, starts.length ? starts[0] : lines.length).join('\n');
  const releases = starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
    const body = lines.slice(start, end).join('\n');
    const m = /^## \[([^\]]+)\]\s*-\s*(.+)$/.exec(lines[start]);
    return { version: m ? m[1] : '', date: m ? m[2].trim() : '', body };
  });

  return { intro, releases };
}

function serialize(intro, releases) {
  const body = releases.map((r) => r.body.replace(/\s*$/, '')).join('\n\n');
  return `${intro.replace(/\s*$/, '')}\n\n${body}\n`;
}

/**
 * Pure core: folds `groups` (version → sections) into the changelog text and
 * returns the new text. Exported so it can be tested without a git repository —
 * this rewrites the project's public record on main, unattended.
 */
function foldInto(changelogText, groups, dateFor) {
  const { intro, releases } = parseChangelog(changelogText);

  for (const version of [...groups.keys()].sort(compareVersions)) {
    const incoming = groups.get(version);
    const existing = releases.find((r) => r.version === version);

    if (existing) {
      // Folding into a release that already has a section (a rerun, or a hand-
      // written entry): merge the bullets rather than stack a second heading.
      const merged = parseSections(existing.body);
      mergeSections(merged, incoming);
      existing.body = renderRelease(version, existing.date, merged);
      continue;
    }

    const release = {
      version,
      date: dateFor(version),
      body: renderRelease(version, dateFor(version), incoming),
    };
    const at = releases.findIndex((r) => compareVersions(version, r.version) < 0);
    if (at === -1) releases.push(release);
    else releases.splice(at, 0, release);
  }

  return serialize(intro, releases);
}

function fragmentFiles() {
  if (!fs.existsSync(fragmentDir)) return [];
  return fs
    .readdirSync(fragmentDir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => path.join(fragmentDir, name));
}

/** The earliest tag containing the commit that added this fragment. */
function releaseOf(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const sha = git(`log --diff-filter=A --format=%H -1 -- "${rel}"`);
  if (!sha) return '';
  const tags = git(`tag --contains ${sha} --sort=v:refname`)
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => parseVersion(t));
  return tags[0] || '';
}

function main() {
  if (!fs.existsSync(mdPath)) {
    console.error('CHANGELOG.md not found');
    process.exit(1);
  }

  const files = fragmentFiles();
  if (files.length === 0) {
    console.log('No changelog fragments pending.');
    return report([]);
  }

  const groups = new Map();
  const dates = new Map();
  const folded = [];

  for (const file of files) {
    const version = releaseOf(file);
    if (!version) {
      console.log(`Skipping ${path.basename(file)} — no tag contains it yet.`);
      continue;
    }

    const sections = parseSections(fs.readFileSync(file, 'utf8'));
    if (sections.size === 0) {
      console.log(`Skipping ${path.basename(file)} — no "### Section" with bullets in it.`);
      continue;
    }

    if (!groups.has(version)) groups.set(version, new Map());
    mergeSections(groups.get(version), sections);
    dates.set(version, git(`log -1 --format=%ad --date=short ${version}`) || today());
    folded.push(file);
  }

  if (folded.length === 0) return report([]);

  const next = foldInto(fs.readFileSync(mdPath, 'utf8'), groups, (v) => dates.get(v) || today());
  fs.writeFileSync(mdPath, next, 'utf8');
  for (const file of folded) fs.rmSync(file);

  const versions = [...groups.keys()].sort(compareVersions);
  console.log(`Folded ${folded.length} fragment(s) into ${versions.join(', ')}.`);
  return report(versions);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Tells the workflow whether there is anything to commit. */
function report(versions) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `folded=${versions.length > 0}\nversions=${versions.join(', ')}\n`
  );
}

if (require.main === module) main();

module.exports = { compareVersions, parseSections, mergeSections, foldInto, parseChangelog };
