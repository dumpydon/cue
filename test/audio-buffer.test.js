const test=require('node:test'),assert=require('node:assert/strict');
const {pcmFrame,queuePCM,MAX_QUEUED_AUDIO_BYTES}=require('../src/audio-buffer');
test('invalid, oversized and partial PCM frames never reach native audio processing',()=>{
 for(const value of [null,{},'audio',new ArrayBuffer(3),new ArrayBuffer(0),new ArrayBuffer(200000)])assert.equal(pcmFrame(value),null);
 const view=new Uint8Array([0,1,2,3,4,5]).subarray(2,4);assert.deepEqual([...pcmFrame(view)],[2,3]);
 assert.equal(pcmFrame(new ArrayBuffer(640)).length,640);
});
test('a slow speech provider cannot grow the pending PCM queue without a bound',()=>{
 const chunks=[];let dropped=0;
 for(let i=0;i<10000;i++)dropped+=queuePCM(chunks,Buffer.alloc(3200,i%256));
 assert.ok(dropped>0);assert.ok(chunks.reduce((n,b)=>n+b.length,0)<=MAX_QUEUED_AUDIO_BYTES);
 assert.equal(chunks.at(-1)[0],9999%256);
});
