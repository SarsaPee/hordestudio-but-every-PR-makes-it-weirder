const fs = require('node:fs');
const vm = require('node:vm');
const { buildContext, functionSource } = require('./app_source');
const now = Date.now();
const ctx = { console, state: { globalSettings: {}, personas: [], companions: [], companionThreads: {}, companionTimelines: {} },
    companionLifeState: () => ({ activity:'home', label:'at home', availability:'available', situation:{} }),
    companionAlcoholContext: () => false };
buildContext(vm, ['normalizeCompanion','sanitizeCompanionObserverCommit','applyCompanionMoodUpdate'], ctx);
const values = c => ({ valence:c.mood.valence, emotionalActivation:c.mood.arousal, sexualArousal:c.humanDynamics.sexualArousal });
function probe(enabled, input) {
    const c = ctx.normalizeCompanion({id:'affect',name:'Ada',age:28,libidoEnabled:enabled,
        mood:{valence:0,arousal:0,label:'content',relationship:20,lastUpdated:now},
        humanDynamics:{lastUpdated:now,sexualArousal:0}});
    const before=values(c);
    const commit=ctx.sanitizeCompanionObserverCommit(c, {state:input},now);
    ctx.applyCompanionMoodUpdate(c,commit.state,now);
    return {enabled,before,after:values(c),sanitizedSexualDelta:commit.state.sexual_arousal_change ?? null};
}
(async()=>{
    const affect = {
        validExplicitDelta:probe(true,{valence_change:6,arousal_change:8,sexual_arousal_change:12}),
        onlyEmotionalActivation:probe(true,{valence_change:6,arousal_change:8}),
        disabledSexualSystem:probe(false,{valence_change:6,arousal_change:8,sexual_arousal_change:12}),
        zeroObserverTransaction:probe(true,{valence_change:0,arousal_change:0,sexual_arousal_change:0})
    };
    let release, started;
    const began = new Promise(resolve=>{started=resolve;});
    const response={responseGroupId:'r',turnAudit:{},role:'companion'};
    const original={id:'old',messages:[response]}; let active=original;
    const human={id:'h',separatedCognition:true,mood:{valence:0},continuityRuntime:{revision:0}};
    const writes=[];
    const orchestration={console,companionObserverQueues:new Map(),
        state:{activeCompanionId:'h',view:'none'}, getCompanion:()=>human,
        getActiveCompanionTimeline:()=>active,getCompanionThread:()=>active.messages,
        refreshCompanionObserverCapabilities:async()=>{},companionObserverPrompt:()=>[],
        repairCompanionTurnCommit:async()=>{started();return new Promise(resolve=>{release=resolve;});},
        sanitizeCompanionObserverCommit:(c,commit)=>commit,
        applyCompanionMoodUpdate:(c,delta)=>{writes.push(active.id);c.mood.valence+=delta.valence_change;},
        applyCompanionTurnCommit(){},companionContinuity:()=>human.continuityRuntime,
        persistCompanionRuntime(){},saveState:async()=>{},applyCompanionLabsMemoryGate:async()=>{}};
    vm.createContext(orchestration);
    vm.runInContext(functionSource('scheduleCompanionTurnObservation'),orchestration);
    const task=orchestration.scheduleCompanionTurnObservation(human,original.messages,'hello',{
        timelineId:'old',responseGroupId:'r',sourceMessageIds:[],nowMs:now});
    await began;
    active={id:'new',messages:[]};
    human.mood={valence:0}; // The active timeline changes while observation is in flight.
    release({commit:{state:{valence_change:6}}});
    await task;
    const lifeCtx = {console,state:{globalSettings:{},personas:[],companions:[],companionThreads:{},companionTimelines:{}}};
    buildContext(vm,['normalizeCompanion','advanceCompanionLife','companionLifeState'],lifeCtx);
    const bedtime=Date.UTC(2026,8,8,0,0);
    const sleeper=lifeCtx.normalizeCompanion({id:'sleeper',name:'Ada',age:28,locationMode:'custom',timezoneOffsetMinutes:0,
        sleepArchetype:'normal',lifeWildcardsEnabled:false,lifeWeatherEnabled:false,
        humanDynamics:{energy:70,lastUpdated:bedtime-60000},
        lifeProfile:{initializedAt:bedtime-86400000,weeklySchedule:[{id:'evening',days:[1],startMinute:1380,endMinute:1440,activity:'reading at home',availability:'available',withIds:[]}]}});
    lifeCtx.state.companions=[sleeper];
    lifeCtx.state.companionThreads.sleeper=[{id:'chat',role:'companion',text:'Tell me what happened next.',timestamp:bedtime-60000}];
    lifeCtx.advanceCompanionLife(sleeper,bedtime-60000);
    const before=lifeCtx.companionLifeState(sleeper,bedtime-60000).availability;
    lifeCtx.advanceCompanionLife(sleeper,bedtime);
    const transition={before,after:lifeCtx.companionLifeState(sleeper,bedtime).availability,
        pendingContact:sleeper.lifeRuntime.pendingInitiative,
        messageCount:lifeCtx.state.companionThreads.sleeper.length,
        latestLedger:sleeper.lifeRuntime.simulationLedger.slice(-1)};
    const result={generatedAt:new Date().toISOString(),affect,transition,

        delayedObserver:{sourceTimeline:'old',activeTimeline:'new',stateWriteTargets:writes,newTimelineValence:human.mood.valence}};
    fs.writeFileSync('docs/vh-affect-transition-audit-results-2026-09-07.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
