const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChatContext, requestTokens, MAX_ADDED_TOKENS } = require('../src/chat-context');
const { learnPreferences } = require('../src/chat-memory');
const { MODES } = require('../src/prompts');
const system=MODES.ask.buildSystem('', '');
const make=(i,user='Solve graph problem '+i,assistant='Use BFS.\n'+('```python\n    queue.append(node)\n```\n'.repeat(100)))=>({id:String(i),user,assistant,scope:'leetcode',status:'complete',createdAt:i});
function context(overrides={}) {return buildChatContext({system,userText:'Question: Solve coin change with DP.',question:'Solve coin change with DP.',scope:'leetcode',exchanges:[],...overrides});}
test('50 long coding solutions cannot grow estimated text input beyond the strict budget',()=>{
 const exchanges=Array.from({length:50},(_,i)=>make(i));
 const memories=learnPreferences([],'I prefer DP in recursive form with memoization.','preference',1000);
 for(const question of ['Why?', 'Solve coin change with DP.', 'Explain this code: '+ 'x += 1;\n'.repeat(300),'解释这个动态规划问题。'.repeat(50),'🙂'.repeat(100)]) {
  const result=context({exchanges,memories,question,userText:question,now:2000});
  assert.ok(result.budget.addedTextTokens<=MAX_ADDED_TOKENS);
  assert.ok(result.budget.totalTextTokens<=result.budget.freshTextTokens*1.9);
  assert.equal(requestTokens(result.system,result.turns),result.budget.totalTextTokens);
  assert.equal(result.turns.at(-1).text,question);
  assert.ok(result.turns.length<=7);
  assert.match(result.system,/recursive form/);
 }
});
test('recent follow-ups and a relevant older problem both fit without bringing unrelated threads',()=>{
 const exchanges=Array.from({length:50},(_,i)=>make(i));
 exchanges[3]=make(3,'Coin change recurrence with memoization','Use dp(amount) = 1 + min(dp(amount - coin)).');
 exchanges.push({...make(51,'private other topic','PRIVATE_RAG_CONTEXT'),scope:'rag'});
 const result=context({exchanges});
 assert.match(JSON.stringify(result.turns),/Coin change recurrence/);
 assert.match(JSON.stringify(result.turns),/graph problem 49/);
 assert.doesNotMatch(JSON.stringify(result.turns),/PRIVATE_RAG_CONTEXT/);
});
test('failed and interrupted drafts and forgotten preference turns never re-enter context',()=>{
 const exchanges=[{...make(1,'I prefer recursion.','Use recursion.'),preferenceUpdate:true},{...make(2,'failed','FAILED_TEXT'),status:'failed'},{...make(3,'cut off','INTERRUPTED_TEXT'),status:'interrupted'}];
 assert.equal(context({exchanges}).turns.length,1);
 const result=context({exchanges,includeHistory:false}); assert.equal(result.turns.length,1);
});
test('newer DP preference supersedes the old one after many intervening messages',()=>{
 let memories=learnPreferences([],'I prefer recursive DP.','old',1000);
 memories=learnPreferences(memories,'I prefer bottom-up DP now.','new',2000);
 const result=context({memories,now:3000,exchanges:Array.from({length:50},(_,i)=>make(i))});
 assert.match(result.system,/bottom-up DP/); assert.doesNotMatch(result.system,/recursive DP/);
 const disabled=context({memories,memoryEnabled:false,now:3000}); assert.doesNotMatch(disabled.system,/bottom-up DP/);
});
