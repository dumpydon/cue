export const REPLAY_LIMIT=5
export const REPLAY_DELAY=5000

// In-memory state belongs to the top same-origin page, so reopening an install
// iframe does not reset its allowance. A real page refresh creates a new budget.
export function pageReplayBudget(view,key){
  let page=view
  try{while(page.parent!==page&&page.parent.location.origin===view.location.origin)page=page.parent}catch{/* Cross-origin embedding cannot share state. */}
  const store=page.__cueDemoReplayBudgets??=(Object.create(null))
  return store[key]??=( {plays:0} )
}

export function createReplayLoop({budget,replay,onChange=()=>{},now=()=>performance.now(),schedule=setTimeout,unschedule=clearTimeout}){
  let timer=null,waiting=false,enabled=true,remaining=0,anchor=0
  function disarm(){
    if(timer===null)return
    remaining=Math.max(0,remaining-Math.max(0,now()-anchor))
    unschedule(timer);timer=null
  }
  function arm(){
    if(!waiting||!enabled||timer!==null)return
    anchor=now()
    timer=schedule(()=>{
      timer=null;remaining=0
      if(!waiting)return
      waiting=false;onChange()
      // Another copy of the guide may have used the last play while we waited.
      if(enabled&&budget.plays<REPLAY_LIMIT)replay()
    },remaining)
  }
  function cancel(){disarm();waiting=false;remaining=0;onChange()}
  return {
    get plays(){return budget.plays},
    get waiting(){return waiting},
    begin(){cancel();budget.plays=Math.min(REPLAY_LIMIT,budget.plays+1);onChange()},
    finish(){
      if(waiting||budget.plays===0||budget.plays>=REPLAY_LIMIT)return
      waiting=true;remaining=REPLAY_DELAY;arm();onChange()
    },
    cancel,
    setEnabled(value){
      if(enabled===value)return
      if(!value)disarm()
      enabled=value;if(value)arm();onChange()
    },
  }
}
