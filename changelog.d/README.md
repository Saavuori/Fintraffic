# Pending changelog entries

Every pull request drops its changelog entry here as **its own file**, named after
the branch — `changelog.d/my-branch.md`. CI folds the pending files into
`CHANGELOG.md` after the merge, under the version it just tagged, and deletes
them. So this directory is empty most of the time; what you see in it is the work
that has merged since the last release, or is still in flight.

## Writing one

```markdown
### Changed
- **The replay range is the track history's own 1h / 24h / 7d / 60d**: those buttons
  moved down into the replay section, where they now visibly set both things at once…
```

Sections are the Keep a Changelog ones — `Added`, `Changed`, `Deprecated`,
`Removed`, `Fixed`, `Security` — plus `Notes` for context that isn't itself a
change. Use as many as the PR needs; they are merged and re-ordered on fold.

**Never write a `## [vX.Y.Z]` heading.** That is the entire point of this
directory. Versions are minted by CI from the conventional-commit type *after*
the merge, so at PR time the number is unknowable — anything written by hand is a
guess that goes stale the moment another PR merges first. CI attaches the real
one. A fragment carrying a version heading fails the PR check.

The house voice is unchanged: say what changed and **why it was worth doing**,
in prose, for someone who wasn't there. The v0.10.3 and v0.11.0 entries in
`CHANGELOG.md` are what to aim at.

## Why files instead of editing CHANGELOG.md

Two PRs open at once used to collide twice over: both edited the same lines at the
top of `CHANGELOG.md`, and both predicted the same next version, so whichever
merged second had a conflict *and* a wrong heading. A file per branch has no
shared lines to conflict over, and no version to be wrong about.

## Escape hatch

A PR with no user- or ops-facing change at all — and that is rarer than it looks;
CI and chore changes are ops-facing — can skip the fragment by carrying the
`no-changelog` label.
