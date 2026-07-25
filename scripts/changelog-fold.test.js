const test = require('node:test');
const assert = require('node:assert');

const { compareVersions, parseSections, foldInto, parseChangelog } = require('./changelog-fold');

const INTRO = '# Fintraffic Changelog\n\nAll notable changes…\n';
const CHANGELOG = `${INTRO}
## [v0.13.0] - 2026-07-25

### Added
- **Sea conditions**: FMI observations.

## [v0.12.0] - 2026-07-24

### Added
- **Nearest on desktop**: the five closest vessels.
`;

const dateFor = () => '2026-07-26';

function group(version, text) {
  return new Map([[version, parseSections(text)]]);
}

test('compareVersions orders newest first', () => {
  const versions = ['v0.9.0', 'v0.10.0', 'v0.10.2', 'v1.0.0', 'v0.10.10'];
  assert.deepStrictEqual(versions.sort(compareVersions), [
    'v1.0.0',
    'v0.10.10',
    'v0.10.2',
    'v0.10.0',
    'v0.9.0',
  ]);
});

test('parseSections keeps a wrapped bullet as one bullet', () => {
  const sections = parseSections('### Changed\n- **One**: first line\n  continued here\n- **Two**: second\n');
  assert.deepStrictEqual(sections.get('Changed'), [
    '- **One**: first line\n  continued here',
    '- **Two**: second',
  ]);
});

test('parseSections drops a heading with nothing under it', () => {
  assert.strictEqual(parseSections('### Added\n\n### Fixed\n- **Real**: yes\n').has('Added'), false);
});

test('a new version is inserted above the current top release', () => {
  const out = foldInto(CHANGELOG, group('v0.14.0', '### Changed\n- **Top bar**: replay moved.\n'), dateFor);
  const { releases } = parseChangelog(out);
  assert.deepStrictEqual(releases.map((r) => r.version), ['v0.14.0', 'v0.13.0', 'v0.12.0']);
  assert.match(out, /## \[v0\.14\.0\] - 2026-07-26\n\n### Changed\n- \*\*Top bar\*\*: replay moved\./);
});

test('an older version lands in the middle, not at the top', () => {
  const out = foldInto(CHANGELOG, group('v0.12.5', '### Fixed\n- **Late**: arrived after.\n'), dateFor);
  assert.deepStrictEqual(parseChangelog(out).releases.map((r) => r.version), [
    'v0.13.0',
    'v0.12.5',
    'v0.12.0',
  ]);
});

test('two fragments for different versions each land in their own release', () => {
  const groups = new Map([
    ['v0.14.0', parseSections('### Changed\n- **A**: one.\n')],
    ['v0.15.0', parseSections('### Added\n- **B**: two.\n')],
  ]);
  const out = foldInto(CHANGELOG, groups, dateFor);
  assert.deepStrictEqual(parseChangelog(out).releases.map((r) => r.version), [
    'v0.15.0',
    'v0.14.0',
    'v0.13.0',
    'v0.12.0',
  ]);
});

test('folding into an existing release merges rather than duplicating the heading', () => {
  const out = foldInto(CHANGELOG, group('v0.13.0', '### Added\n- **Extra**: also shipped.\n'), dateFor);
  assert.strictEqual(out.match(/## \[v0\.13\.0\]/g).length, 1);
  assert.strictEqual(out.match(/### Added/g).length, 2); // v0.13.0 and v0.12.0
  assert.match(out, /- \*\*Sea conditions\*\*[\s\S]*- \*\*Extra\*\*/);
});

test('the existing release keeps its own date when merged into', () => {
  const out = foldInto(CHANGELOG, group('v0.13.0', '### Fixed\n- **Late**: fix.\n'), dateFor);
  assert.match(out, /## \[v0\.13\.0\] - 2026-07-25/);
});

test('folding the same fragment twice is idempotent', () => {
  const fragment = '### Changed\n- **Top bar**: replay moved.\n';
  const once = foldInto(CHANGELOG, group('v0.14.0', fragment), dateFor);
  const twice = foldInto(once, group('v0.14.0', fragment), dateFor);
  assert.strictEqual(once, twice);
});

test('sections are emitted in Keep a Changelog order', () => {
  const out = foldInto(
    CHANGELOG,
    group('v0.14.0', '### Notes\n- **N**: note.\n\n### Fixed\n- **F**: fix.\n\n### Added\n- **A**: add.\n'),
    dateFor
  );
  const body = parseChangelog(out).releases[0].body;
  assert.ok(body.indexOf('### Added') < body.indexOf('### Fixed'));
  assert.ok(body.indexOf('### Fixed') < body.indexOf('### Notes'));
});

test('the intro and untouched releases survive verbatim', () => {
  const out = foldInto(CHANGELOG, group('v0.14.0', '### Changed\n- **X**: y.\n'), dateFor);
  assert.ok(out.startsWith(INTRO.trimEnd()));
  assert.match(out, /## \[v0\.12\.0\] - 2026-07-24\n\n### Added\n- \*\*Nearest on desktop\*\*/);
});

// A Windows checkout leaves CRLF in the file. `.` does not match `\r`, so a
// heading matcher ending in `(.+)$` matched nothing, every version parsed as ""
// and the new release was appended to the *end* of the changelog — silently,
// because an unparseable version compares equal to everything.
test('a CRLF changelog still puts the new release at the top', () => {
  const crlf = CHANGELOG.replace(/\n/g, '\r\n');
  const out = foldInto(crlf, group('v0.14.0', '### Changed\n- **Top bar**: replay moved.\n'), dateFor);
  assert.deepStrictEqual(parseChangelog(out).releases.map((r) => r.version), [
    'v0.14.0',
    'v0.13.0',
    'v0.12.0',
  ]);
});

test('a CRLF fragment parses into the same sections as an LF one', () => {
  const text = '### Changed\n- **One**: first.\n- **Two**: second.\n';
  assert.deepStrictEqual(parseSections(text.replace(/\n/g, '\r\n')), parseSections(text));
});

test('a changelog whose headings do not parse is refused, not appended to', () => {
  const broken = '# Title\n\n## [not-a-version]\n\n### Added\n- **X**: y.\n';
  assert.throws(
    () => foldInto(broken, group('v0.14.0', '### Changed\n- **X**: y.\n'), dateFor),
    /none parse as/
  );
});

test('the file ends with exactly one newline', () => {
  const out = foldInto(CHANGELOG, group('v0.14.0', '### Changed\n- **X**: y.\n'), dateFor);
  assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'));
});
