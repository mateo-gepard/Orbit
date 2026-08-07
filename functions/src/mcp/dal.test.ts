import assert from 'node:assert/strict';
import test from 'node:test';
import { MCP_LIMITS, htmlToPlainText } from './dal';

// Threadmap's editor stores note and project content as plain text; only legacy
// records hold Tiptap HTML. These cases pin both halves of that contract, because a
// tag-stripping pass that is too eager deletes everything between an unrelated '<'
// and the next '>' — silent corruption in the MCP read path.

test('plain-text content with angle brackets survives untouched', () => {
  const cases = [
    'Fix: if (a < b) { return <result>; }',
    'Email Mateo <mateo@example.com> about the PCB',
    'Compare 5<10 and 20>15',
    'Use Array<string> for the tags field',
    'Openpulse: VBAT < 3.4V triggers <shutdown> on the main PCB',
  ];
  for (const value of cases) {
    assert.equal(htmlToPlainText(value), value, value);
  }
});

test('literal entities are not decoded in plain-text content', () => {
  assert.equal(htmlToPlainText('Tom &amp; Jerry'), 'Tom &amp; Jerry');
  assert.equal(htmlToPlainText('Use &lt;br&gt; to break a line'), 'Use &lt;br&gt; to break a line');
});

test('legacy HTML content is still reduced to readable text', () => {
  assert.equal(htmlToPlainText('<p>Real HTML note</p>'), 'Real HTML note');
  assert.equal(htmlToPlainText('<p>One</p><p>Two</p>'), 'One\nTwo');
  assert.equal(htmlToPlainText('<div>A<br/>B</div>'), 'A\nB');
  assert.equal(htmlToPlainText('<ul><li>First</li><li>Second</li></ul>'), 'First\nSecond');
  assert.equal(htmlToPlainText('<p>Tom &amp; Jerry</p>'), 'Tom & Jerry');
});

test('script and style bodies are removed rather than flattened into text', () => {
  assert.equal(htmlToPlainText('<p>Note</p><script>alert(1)</script>'), 'Note');
  assert.equal(htmlToPlainText('<style>p{color:red}</style><p>Styled</p>'), 'Styled');
  assert.equal(
    htmlToPlainText('<script>var a = 1 < 2;</script><p>After</p>'),
    'After',
  );
});

test('non-strings and empty values return an empty string', () => {
  for (const value of [undefined, null, 0, false, {}, [], '']) {
    assert.equal(htmlToPlainText(value), '');
  }
});

test('output is truncated with an ellipsis at the configured maximum', () => {
  const long = 'x'.repeat(MCP_LIMITS.outputContent + 500);
  const result = htmlToPlainText(long);
  assert.equal(result.length, MCP_LIMITS.outputContent);
  assert.ok(result.endsWith('…'));

  assert.equal(htmlToPlainText('abcdefghij', 5), 'abcd…');
  assert.equal(htmlToPlainText('abcd', 5), 'abcd');
});

test('markup detection does not leak regex state between calls', () => {
  // A global regex used with .test() would advance lastIndex and make the second
  // call disagree with the first.
  const html = '<p>a</p><p>b</p>';
  assert.equal(htmlToPlainText(html), 'a\nb');
  assert.equal(htmlToPlainText(html), 'a\nb');
  assert.equal(htmlToPlainText('a < b'), 'a < b');
  assert.equal(htmlToPlainText(html), 'a\nb');
});
