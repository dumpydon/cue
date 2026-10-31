const test=require('node:test'),assert=require('node:assert/strict');
const {createWorkspaceVisibility}=require('../src/workspace-visibility');
function harness({platform='darwin',saved}={}){
 let preference=saved,all=true,failSave=false;const calls=[];
 const window={isDestroyed:()=>false,isVisibleOnAllWorkspaces:()=>all,setVisibleOnAllWorkspaces:(value,options)=>{all=value;calls.push({value,options});}};
 const api=createWorkspaceVisibility({platform,getWindow:()=>window,readPreference:()=>preference,writePreference:value=>{if(failSave)throw Error('Disk full');preference=value;}});
 return{api,window,calls,setFail:()=>{failSave=true;},get preference(){return preference;},get all(){return all;}};
}
test('legacy and fresh settings stay on one desktop and opt-in following includes fullscreen apps',()=>{
 const h=harness();h.api.applyToWindow(h.window);assert.equal(h.all,false);
 assert.deepEqual(h.calls[0],{value:false,options:{visibleOnFullScreen:false,skipTransformProcessType:true}});
 h.api.setFollowAll(true);assert.equal(h.all,true);assert.equal(h.preference,true);assert.equal(h.calls.at(-1).options.visibleOnFullScreen,true);
 h.api.setFollowAll(false);assert.equal(h.all,false);assert.equal(h.preference,false);
 const restart=harness({saved:true});restart.api.applyToWindow(restart.window);assert.equal(restart.all,true);
});
test('failed saves restore native membership; malformed and unsupported requests cannot change it',()=>{
 const h=harness({saved:false});h.api.applyToWindow(h.window);h.setFail();assert.throws(()=>h.api.setFollowAll(true),/Disk full/);assert.equal(h.all,false);assert.equal(h.preference,false);
 for(const value of ['true',{},null])assert.throws(()=>h.api.setFollowAll(value));
 const windows=harness({platform:'win32'});windows.api.applyToWindow(windows.window);assert.equal(windows.calls.length,0);assert.equal(windows.api.state().available,false);assert.throws(()=>windows.api.setFollowAll(true),/macOS and Linux/);
});
