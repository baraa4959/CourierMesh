import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { languages } from '../public/i18n.js';
const asset = file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');

test('administration console serves a local, authentic Bootstrap stylesheet', () => {
  const html = asset('index.html');
  const css = asset('vendor/bootstrap.min.css');
  assert.match(css.slice(0, 200), /Bootstrap\s+v5\.3\.6/);
  assert.match(html, /href="\/assets\/vendor\/bootstrap\.min\.css"/);
  assert.match(html, /class="form-control"/);
  assert.match(html, /class="btn btn-primary"/);
  assert.match(html, /class="card/);
  assert.doesNotMatch(html, /cdn\.|jsdelivr|unpkg/);
});

test('administration console has no decorative slogans or wide-letter headings', () => {
  const html = asset('index.html');
  const css = asset('style.css');
  assert.doesNotMatch(html, /EMAIL INFRASTRUCTURE|CONTROL CENTER|WORKSPACE|One endpoint|Private by design/i);
  assert.doesNotMatch(html, /class="eyebrow"|class="nav-icon"|class="sidebar-foot"/);
  assert.doesNotMatch(css, /letter-spacing\s*:\s*[1-9]/);
  assert.doesNotMatch(html, /#page-subtitle/);
  for (const key of html.matchAll(/data-t="([^"]+)"/g)) {
    for (const locale of ['en', 'ar', 'fr', 'es']) {
      assert.ok(languages[locale][key[1]], `Missing ${locale} translation for ${key[1]}`);
    }
  }
});

test('all control IDs used by the application are available in the HTML', () => {
  const script = asset('app.js'), html = asset('index.html');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  for (const [, id] of script.matchAll(/\$\('#([\w-]+)'\)/g)) {
    assert.ok(ids.has(id), `Missing element #${id}`);
  }
});
