const test = require('node:test'), assert = require('node:assert/strict');
const { createAnswerRun, waitWithSignal } = require('../src/answer-run');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test('cancellation releases a stuck await and reaches the actual transport signal', async () => {
 const run=createAnswerRun(); let aborted=false;
 run.signal.addEventListener('abort',()=>{aborted=true;});
 const pending=run.wait(new Promise(()=>{}));run.cancel();
 await assert.rejects(pending,{code:'ANSWER_CANCELLED'});assert.equal(aborted,true);assert.equal(run.token('late'),false);run.finish();
});
test('preparation and stalled streams have independent bounded deadlines', async()=>{
 const prep=createAnswerRun();await assert.rejects(prep.stage(new Promise(()=>{}),10,'Capture stuck'),{code:'ANSWER_PREPARATION_TIMEOUT'});prep.finish();
 const run=createAnswerRun({firstActivityMs:15,idleMs:15});run.activity();
 await assert.rejects(run.wait(new Promise(()=>{})),{code:'ANSWER_STALLED'});run.finish();
});
test('provider progress supports a slow first answer while the absolute deadline still bounds endless work',async()=>{
 const run=createAnswerRun({totalMs:70,firstActivityMs:25,idleMs:25});run.activity();
 const pulse=setInterval(()=>run.activity(),10);
 await assert.rejects(run.wait(new Promise(()=>{})),{code:'ANSWER_DEADLINE'});clearInterval(pulse);run.finish();
});
test('visible output is bounded and a completed request has no later timeout',async()=>{
 const run=createAnswerRun({maxChars:10,totalMs:30});assert.equal(run.token('123456'),true);assert.equal(run.token('12345'),false);assert.equal(run.characters,6);assert.equal(run.signal.reason.code,'ANSWER_TOO_LARGE');run.finish();
 const done=createAnswerRun({totalMs:10});done.finish();await pause(20);assert.equal(done.signal.aborted,false);
});
test('already-aborted work is observed so a later rejection is not unhandled',async()=>{
 const controller=new AbortController();controller.abort(new Error('cancelled'));
 const late=new Promise((_,reject)=>setTimeout(()=>reject(new Error('late transport')),5));
 await assert.rejects(waitWithSignal(late,controller.signal),/cancelled/);await pause(10);
});
