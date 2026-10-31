const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
let signal;const original=Module._load;
Module._load=function(name,parent,main){if(name==='openai')return class{static async toFile(){return {};}constructor(){this.audio={transcriptions:{create:(_request,options)=>{signal=options.signal;return new Promise(()=>{});}}};}};return original.call(this,name,parent,main);};
const {createSTT}=require('../src/stt');test.after(()=>{Module._load=original;});
test('a stuck speech request gets a real abort signal and returns a visible timeout',async()=>{
 const stt=createSTT({sttProvider:'openai',apiKeys:{openai:'synthetic'}},{timeoutMs:15});
 const result=await stt.transcribe(Buffer.alloc(6400));assert.equal(result.error.code,'STT_TIMEOUT');assert.equal(signal.aborted,true);
});
test('renderer recovery can cancel a speech request without accepting a late result',async()=>{
 const stt=createSTT({sttProvider:'openai',apiKeys:{openai:'synthetic'}});const controller=new AbortController();
 const pending=stt.transcribe(Buffer.alloc(6400),{signal:controller.signal});controller.abort(Object.assign(new Error('audio stopped'),{code:'STT_CANCELLED'}));
 const result=await pending;assert.equal(result.error.code,'STT_CANCELLED');assert.equal(signal.aborted,true);
});
