const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createChatStore } = require('../src/chat-store');
function setup(t) { const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cue-chat-test-')); t.after(()=>fs.rmSync(directory,{recursive:true,force:true})); let tick=1000; return { directory, now:()=>++tick }; }
function ask(store,user='Explain binary search?') { const ref=store.begin({user,mode:'ask',scope:'general',category:'technical'}); store.append(ref,'Use sorted input.'); store.finish(ref,{answer:'Use sorted input.\n\n```python\n    return low\n```'}); return ref; }

test('independent local chats survive restart, preserve exact text, auto-title and rename', t=>{
 const cfg=setup(t), store=createChatStore(cfg); const first=store.create('general','general');
 ask(store,'  Explain binary search?\n\t  Preserve spaces.  '); store.rename(first.id,'LeetCode');
 const second=store.create('general','general'); ask(store,'Explain RAG?');
 const reload=createChatStore(cfg);
 assert.equal(reload.activeId,second.id); assert.equal(reload.list().length,2);
 assert.equal(reload.get(first.id).title,'LeetCode'); assert.equal(reload.get(first.id).exchanges[0].user,'  Explain binary search?\n\t  Preserve spaces.  ');
 assert.equal(reload.get(second.id).title,'Explain RAG?');
 reload.activate(first.id); assert.equal(createChatStore(cfg).activeId,first.id);
 assert.equal(fs.statSync(path.join(cfg.directory,first.id+'.json')).mode&0o777,0o600);
});
test('partial generation is durably restored as interrupted and never marked complete',t=>{
 const cfg=setup(t), store=createChatStore(cfg); store.create();
 const ref=store.begin({user:'Pending question',mode:'ask',scope:'general'}); store.append(ref,'Partial answer'); store.flush();
 const reload=createChatStore(cfg); const exchange=reload.get().exchanges[0];
 assert.equal(exchange.status,'interrupted'); assert.equal(exchange.assistant,'Partial answer');
 assert.equal(createChatStore(cfg).get().exchanges[0].status,'interrupted');
});
test('long archives paginate without losing old code; trash and restore keep threads isolated',t=>{
 const cfg=setup(t), store=createChatStore(cfg); const chat=store.create();
 for(let i=0;i<75;i++)ask(store,'Problem '+i);
 const page=store.page(); assert.equal(page.exchanges.length,30); assert.equal(page.offset,45);
 assert.equal(store.page(chat.id,45).exchanges[0].user,'Problem 15'); assert.equal(store.page(chat.id,15).exchanges.length,15);
 store.trash(chat.id); assert.equal(store.list().length,0); assert.equal(store.list({trash:true}).length,1); assert.equal(store.activeId,null);
 assert.throws(()=>store.activate(chat.id),/Trash/); assert.equal(createChatStore(cfg).activeId,null);
 store.restore(chat.id); store.activate(chat.id); assert.equal(store.get().exchanges.length,75);
});
test('preferences belong to their thread, can be edited and forgotten, and are flagged out of raw recall',t=>{
 const cfg=setup(t),store=createChatStore(cfg); const a=store.create();
 ask(store,'I prefer DP solutions in recursive form.');
 assert.equal(store.get().memories.length,1); assert.equal(store.get().exchanges[0].preferenceUpdate,true);
 const b=store.create(); assert.equal(store.get().memories.length,0);
 store.setMemory(a.id,{instructions:'Show complexity.',memoryEnabled:false,memories:[]});
 store.activate(a.id); ask(store,'I prefer Java.'); assert.equal(store.get().memories.length,0);
 assert.equal(store.get(b.id).instructions,'');
 assert.throws(()=>store.setMemory(a.id,{instructions:'x'.repeat(1501),memoryEnabled:true,memories:[]}),/Invalid/);
});
test('invalid IDs and corrupt files cannot overwrite another file or silently erase history',t=>{
 const cfg=setup(t),store=createChatStore(cfg); const a=store.create(); ask(store);
 for(const id of ['../outside','index',{},null])assert.throws(()=>store.rename(id,'Bad'));
 fs.writeFileSync(path.join(cfg.directory,'broken.json'),'{broken');
 const reload=createChatStore(cfg); assert.equal(reload.get(a.id).exchanges.length,1); assert.equal(reload.warnings.length,1);
 assert.equal(fs.readFileSync(path.join(cfg.directory,'broken.json'),'utf8'),'{broken');
 // A catalog failure must never hide already-written chat content.
 fs.writeFileSync(path.join(cfg.directory,'index.json'),'{broken');
 assert.equal(createChatStore(cfg).list().length,1);
});
test('a write failure leaves the existing durable chat readable and reports failure',t=>{
 const cfg=setup(t),store=createChatStore(cfg); const a=store.create(); ask(store);
 fs.mkdirSync(path.join(cfg.directory,a.id+'.json.tmp'));
 assert.throws(()=>store.rename(a.id,'Lost edit'));
 assert.equal(store.get(a.id).title,'Explain binary search?');
 assert.equal(createChatStore(cfg).get(a.id).title,'Explain binary search?');
});

test('a mixed preference and question retains the question for follow-ups without stale instructions',t=>{
 const cfg=setup(t),store=createChatStore(cfg);store.create();
 ask(store,'I prefer recursive DP.\nSolve coin change?');
 const exchange=store.get().exchanges[0];
 assert.equal(exchange.preferenceUpdate,false); assert.equal(exchange.contextUser,'Solve coin change?');
 assert.match(exchange.user,/recursive DP/); assert.equal(store.get().memories.length,1);
});
