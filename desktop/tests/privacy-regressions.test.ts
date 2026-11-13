// All identity and preference values in this suite are explicitly fictional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../electron/core';
import { emptyProfiles, validateProfiles, packetFields } from '../electron/profiles';
import { discoveryQueries } from '../electron/discovery';
const require = createRequire(import.meta.url);
test('source and packaging inputs reject private paths, document IDs, secrets and real contacts', () => {
  const {checkSource} = require('../native/privacy-check.cjs');
  assert(checkSource() > 40);
});
test('independent fictional storage roots preserve profiles across restart without sharing identity or filters', () => {
  const root = mkdtempSync(join(tmpdir(),'cannon-fictional-'));
  try {
    const paths = [join(root,'alpha.sqlite'),join(root,'beta.sqlite')];
    const a:any = emptyProfiles(), b:any = emptyProfiles();
    a.shared.name='Fictional Avery'; a.shared.email='avery@example.test';
    a.job.enabled=true; a.job.jobTitleKeywords='librarian';
    a.job.locations=[{city:'Oslo',country:'Norway'}];
    b.shared.name='Fictional Blake'; b.shared.email='blake@example.test';
    b.vc.enabled=true; b.vc.productKeywords='agriculture';
    b.vc.targetCountries='Japan';
    for (const [i,p] of [a,b].entries()) {
      const db = new Store(paths[i]); db.set('profiles-v1',validateProfiles(p)); db.db.close();
      const reopened = new Store(paths[i]);
      assert.deepEqual(reopened.get('profiles-v1',null),p); reopened.db.close();
    }
    assert.notDeepEqual(discoveryQueries('job',a.job), discoveryQueries('job',b.job));
    assert.deepEqual(discoveryQueries('job',b.job),[]);
    assert.deepEqual(discoveryQueries('vc',a.vc),[]);
    assert(!JSON.stringify(packetFields(b,'vc','https://example.test/apply')).includes(a.shared.email));
    const fresh:any=emptyProfiles();
    assert(Object.values(fresh.shared).every(x => x === ''));
    assert.deepEqual(discoveryQueries('job',fresh.job),[]);
    assert.deepEqual(discoveryQueries('vc',fresh.vc),[]);
    a.job.locations.push({city:'Fictional Place'});
    assert.deepEqual(fresh.job.locations,[]);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('privacy scanner covers document links, paths and secret families without storing real values', () => {
  const {inspect} = require('../native/privacy-check.cjs');
  const samples = [
    ['C:', 'Users', 'Fictional', 'document.txt'].join(String.fromCharCode(92)),
    ['https:', '', 'drive.google.com', 'file', 'd', 'x'.repeat(24)].join('/'),
    ['https:', '', 'docs.google.com', 'document', 'd', 'x'.repeat(24)].join('/'),
    'AK' + 'IA' + 'A'.repeat(16),
    'xo' + 'xb-' + 'x'.repeat(24),
    'gh' + 'p_' + 'x'.repeat(24),
    '/ho' + 'me/fictional/private.txt',
    'fictional' + '@' + 'invalid-domain.com',
  ];
  for (const value of samples) assert.throws(() => inspect(value, 'synthetic sentinel'));
  assert.doesNotThrow(() => inspect('Fictional Avery <avery@example.test>', 'fictional'));
});

test('network acceptance entry points cannot open saved profiles or decryption material', () => {
  const fs = require('node:fs');
  for (const file of ['audit-live.ts','saved-profile-acceptance.ts']) {
    const source = fs.readFileSync('tests/' + file, 'utf8');
    assert(!/readFileSync|copyFileSync|DatabaseSync|safeStorage|--database/.test(source));
  }
});
