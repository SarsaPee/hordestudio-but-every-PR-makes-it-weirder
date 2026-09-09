const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildContext, functionSource } = require('./app_source');
const now = Date.UTC(2026,8,8,12);
let gate, response, requests, active, duringFetch;
const ctx = { console:{warn(){}},state:{globalSettings:{},personas:[],companions:[]},
    getActiveCompanionTimeline:()=>active,
    providerHasCredentials:()=>true, companionTextProviderId:()=> 'offline',
    companionLifeState:()=>({label:'Lunch at home',availability:'available',situation:{label:'Lunch at home',withNames:[]}}),
    labsProposal:async()=>{if(gate instanceof Error)throw gate; return gate;},
    applyCompanionGenerationConfig:body=>({...body,max_tokens:420}),sanitizeMessagesForProvider:messages=>messages,
    providerApiBase:()=> 'https://offline.invalid',providerAuthHeaders:()=>({}),providerAttributionHeaders:()=>({}),
    companionRequestContextSize:()=>8192,
    fetch:async(url,options)=>{requests.push(JSON.parse(options.body));if(duringFetch)duringFetch();return {ok:true,json:async()=>({choices:[{message:response}]})};}
};
buildContext(vm,['normalizeCompanion','generateCompanionAutonomousSocialPost'],ctx);
const person=()=>ctx.normalizeCompanion({id:'social',name:'Ada',age:28,model:'offline',socialFeedEnabled:true,socialPostFrequency:'daily',socialFeedImages:true,allowPhotos:true,socialPhotoRatio:100});
const reset=()=>{gate=null;requests=[];active={id:'a'};duringFetch=null;response={content:JSON.stringify({text:'Lunch break.',scene:'A sandwich on the kitchen table.',category:'everyday'})};};
(async()=>{
    reset();gate={candidate:{}};let c=person();let result=await ctx.generateCompanionAutonomousSocialPost(c,now);
    assert(result.posted && result.pendingPhoto);assert.equal(requests.length,1);
    assert.equal(requests[0].tools.length,1);assert.equal(requests[0].tools[0].function.name,'publish_social_post');
    assert(!requests[0].messages[0].content.includes('commit_human_turn'));
    assert.equal(c.socialPosts[0].kind,'photo');
    reset();gate=new Error('Optional sensor offline');result=await ctx.generateCompanionAutonomousSocialPost(person(),now);assert(result.posted);
    reset();gate={candidate:{shouldPost:false,confidence:0.9}};result=await ctx.generateCompanionAutonomousSocialPost(person(),now);assert.equal(result.reason,'gate');assert.equal(requests.length,0);
    console.log('PASS focused social-only request, weak/unavailable gate fallback, confident deferral and photo placeholder');
    reset();response={content:JSON.stringify({text:'Photo without a description'})};c=person();
    await assert.rejects(ctx.generateCompanionAutonomousSocialPost(c,now),/omitted its image description/);assert.equal(c.socialPosts.length,0);
    reset();response={content:JSON.stringify({scene:'A cup of tea on a table.'})};c=person();result=await ctx.generateCompanionAutonomousSocialPost(c,now);assert(result.posted && result.pendingPhoto);
    console.log('PASS missing image description cannot silently become a status; captionless photos remain valid');
    reset();c=person();duringFetch=()=>{active={id:'b'};};result=await ctx.generateCompanionAutonomousSocialPost(c,now);assert.equal(result.reason,'stale');assert.equal(c.socialPosts.length,0);
    reset();gate={candidate:{shouldPost:false,confidence:1}};c=person();result=await ctx.generateCompanionAutonomousSocialPost(c,now,{force:true});assert(result.posted);
    console.log('PASS stale social generation is rejected and explicit creation bypasses optional gate');
    reset();c=person();c.socialFeedRuntime.lastPostAt=now-60000;
    result=await ctx.generateCompanionAutonomousSocialPost(c,now);assert.equal(result.reason,'cadence');assert.equal(requests.length,0);
    const life=ctx.companionLifeState;ctx.companionLifeState=()=>({label:'Sleeping',availability:'asleep',situation:{availability:'asleep',endsAt:now+3600000}});
    reset();result=await ctx.generateCompanionAutonomousSocialPost(person(),now);assert.equal(result.reason,'availability');assert.equal(result.retryAt,now+3600000);assert.equal(requests.length,0);
    ctx.companionLifeState=life;
    console.log('PASS unavailable windows and minimum posting gap defer without paying for a discarded post');

    let finish;const post={id:'p',pending:true,scene:'Tea'};c={id:'c',socialPosts:[post],usage:{photosGenerated:0}};
    const photoCtx={console,companionSocialPhotoInFlight:new Set(),generateCompanionPhoto:async()=>new Promise(resolve=>{finish=resolve;}),
        loadGeneratedImage:async()=> 'data:image/png;base64,synthetic',Image:function(){},saveState:async()=>{},state:{},renderCompanionSocialPanel:()=>{}};
    vm.createContext(photoCtx);vm.runInContext(functionSource('resolveCompanionSocialPhoto'),photoCtx);
    const task=photoCtx.resolveCompanionSocialPhoto(c,post);c.socialPosts=[];finish('synthetic');await task;
    assert.equal(c.usage.photosGenerated,0);assert.equal(post.photo,undefined);assert.equal(photoCtx.companionSocialPhotoInFlight.size,0);
    console.log('PASS detached photo results cannot alter another timeline or its usage');
})().catch(error=>{console.error(error);process.exitCode=1;});
