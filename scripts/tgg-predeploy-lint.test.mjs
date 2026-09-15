import assert from 'node:assert/strict';
import test from 'node:test';
import { lintBloggerSource } from './tgg-predeploy-lint.mjs';

test('known live defects hold the lint gate', () => {
  const source = `<b:widget id='HTML6' type='HTML'/>
    <script><![CDATA[(function(){})();]]></script>
    <script>db.from('mixtapes').select('id,artists(id,stage_name)')</script>
    <div class="shopprice">var r=await db.rpc('tgg_creator_store_bundle')</div>
    <audio id="tggAudio"></audio><audio id="tggAudio"></audio>`;
  const result = lintBloggerSource(source);
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.errors.length, 5);
});

test('safe homepage contract passes', () => {
  const source = `<b:widget cond='data:view.isHomepage' id='HTML6' type='HTML'/>
    <script>//<![CDATA[
    db.rpc('tgg_public_discovery_growth_feed',{p_limit:10,p_query:null});
    //]]></script><audio id="tggAudio"></audio>`;
  const result = lintBloggerSource(source);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.errors.length, 0);
});

test('unguarded protected RPC is reported', () => {
  const source = `<script>db.rpc('tgg_creator_upload_bootstrap')</script>`;
  const result = lintBloggerSource(source);
  assert.equal(result.decision, 'PASS');
  assert.match(result.warnings.join(' '), /without an observable session gate/);
});

test('hash-bound auth helper satisfies the static session check', () => {
  const source = `<script>TGGAuthFirst.protectedRpc(db,'tgg_creator_upload_bootstrap')</script>`;
  const result = lintBloggerSource(source);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.warnings.length, 0);
});
