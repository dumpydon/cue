const test=require('node:test'),assert=require('node:assert/strict');
const {createRendererRecovery}=require('../src/renderer-recovery');
test('renderer restarts are delayed, coalesced and bounded instead of entering a crash loop',()=>{
 let now=0,queued,restored=0,failed=0;
 const recovery=createRendererRecovery({now:()=>now,schedule:fn=>{queued=fn;return 1;},clear:()=>{queued=null;},recover:()=>restored++,exhausted:()=>failed++});
 recovery.crashed();recovery.crashed();assert.equal(restored,0);queued();assert.equal(restored,1);
 recovery.crashed();queued();assert.equal(restored,2);recovery.crashed();assert.equal(failed,1);
 now=61000;recovery.crashed();queued();assert.equal(restored,3);
 recovery.crashed();recovery.dispose();assert.equal(queued,null);recovery.crashed();assert.equal(restored,3);
});
