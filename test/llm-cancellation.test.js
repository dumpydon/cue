const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createLLM}=require('../src/llm');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(10);}throw Error('Transport did not close');}
async function server(t,handler){const s=http.createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>{s.closeAllConnections();s.close();});return 'http://127.0.0.1:'+s.address().port;}
test('stopping an OpenAI-compatible stream closes the real HTTP connection without a retry',async t=>{
 let closed=false,calls=0;
 const url=await server(t,(req,res)=>{calls++;req.resume();res.on('close',()=>{closed=true;});res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{content:'First part'}}]})+'\n\n');});
 const llm=createLLM({provider:'custom',baseUrl:url+'/v1',apiKeys:{custom:'synthetic'},models:{custom:{fast:'synthetic',smart:'synthetic'}}});
 const controller=new AbortController(),reason=Object.assign(new Error('stop test'),{code:'ANSWER_CANCELLED'});let output='';
 await assert.rejects(llm.stream({system:'',turns:[{role:'user',text:'A synthetic question'}],signal:controller.signal,onToken:text=>{output+=text;controller.abort(reason);}}),{code:'ANSWER_CANCELLED'});
 await until(()=>closed);assert.equal(calls,1);assert.equal(output,'First part');
});
test('Ollama receives an output ceiling and its stream can also be aborted',async t=>{
 let body,closed=false;
 const url=await server(t,(req,res)=>{let data='';req.on('data',c=>{data+=c;});req.on('end',()=>{body=JSON.parse(data);res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(JSON.stringify({message:{content:'Local partial'}})+'\n');});res.on('close',()=>{closed=true;});});
 const llm=createLLM({provider:'ollama',apiKeys:{ollama:url},models:{ollama:{fast:'synthetic'}}});const controller=new AbortController();
 await assert.rejects(llm.stream({system:'',turns:[{role:'user',text:'Synthetic'}],maxTokens:123,signal:controller.signal,onToken:()=>controller.abort(new Error('stop local'))}),/stop local/);
 await until(()=>closed);assert.equal(body.options.num_predict,123);
});
