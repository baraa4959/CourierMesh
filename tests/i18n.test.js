import test from 'node:test';
import assert from 'node:assert/strict';
import {languages} from '../public/i18n.js';

test('all four interface languages have identical translation key sets',()=>{
 const expected=Object.keys(languages.en).sort();
 assert.ok(expected.length>=100);
 for(const locale of ['en','ar','fr','es']){
   assert.deepEqual(Object.keys(languages[locale]).sort(),expected);
   assert.ok(Object.values(languages[locale]).every(v=>typeof v==='string'&&v.trim().length>0));
 }
});
