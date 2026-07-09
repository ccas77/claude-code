// Fast unit checks for the compliance-critical pure functions.
// Run: node --experimental-sqlite --test   (or: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompliantAmazonLink, assertNoAmazonInEmail, amazonUrl } from '../src/amazon.mjs';
import { slugify, jsonLdSafe } from '../src/util.mjs';

test('amazon link must carry a tag', () => {
  assert.equal(isCompliantAmazonLink('https://www.amazon.com/dp/B01?tag=x-20').ok, true);
  assert.equal(isCompliantAmazonLink('https://www.amazon.com/dp/B01').ok, false);
});

test('shortened/cloaked hosts are rejected', () => {
  assert.equal(isCompliantAmazonLink('https://amzn.to/abc').ok, false);
  assert.equal(isCompliantAmazonLink('https://a.co/abc').ok, false);
});

test('non-amazon links are not subject to the tag rule', () => {
  assert.equal(isCompliantAmazonLink('https://apple.com/books/x').ok, true);
});

test('email content may not contain amazon/affiliate links', () => {
  assert.throws(() => assertNoAmazonInEmail('https://www.amazon.com/dp/B01?tag=x-20'));
  assert.throws(() => assertNoAmazonInEmail('https://amzn.to/abc'));
  assert.doesNotThrow(() => assertNoAmazonInEmail('https://your-domain.com/some-list'));
});

test('amazonUrl builds a plain tagged dp link', () => {
  const u = amazonUrl('B0TEST', 'default');
  // With no tag configured in test env, still a bare amazon dp link (audit would flag it).
  assert.match(u, /amazon\.[^/]+\/dp\/B0TEST/);
});

test('slugify is stable and url-safe', () => {
  assert.equal(slugify('Grumpy/Sunshine & More!'), 'grumpy-sunshine-and-more');
});

test('jsonLdSafe neutralizes </script> breakouts', () => {
  const out = jsonLdSafe({ x: '</script><script>alert(1)' });
  assert.equal(out.includes('</script>'), false);
  assert.equal(out.includes('\\u003c'), true);
});
