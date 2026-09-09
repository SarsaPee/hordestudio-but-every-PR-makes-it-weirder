/* Persistent, offline life systems. No provider, DOM, storage or wall-clock reads. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VHWorldEngine=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const minute=60000, day=86400000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(Number(x))?Number(x):a));
const str=(x,n=200)=>String(x||'').slice(0,n);
const list=x=>Array.isArray(x)?x:[];
const clone=x=>JSON.parse(JSON.stringify(x));
function roll(key){let h=2166136261;for(const c of String(key))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;}
const categories=['top','bottom','dress','outerwear','underwear','shoes','accessory'];
const modes=['WALK','DRIVE','BICYCLE','TRANSIT','RIDESHARE'];
const tags=x=>[...new Set((Array.isArray(x)?x:String(x||'').split(',')).map(v=>str(v,40).trim().toLowerCase()).filter(Boolean))].slice(0,20);
function config(raw={}) {raw=raw&&typeof raw==='object'?raw:{};return {
 transport:{enabled:raw.transport?.enabled===true,liveRouting:raw.transport?.liveRouting===true,car:raw.transport?.car===true,bicycle:raw.transport?.bicycle===true,transit:raw.transport?.transit!==false,rideshare:raw.transport?.rideshare!==false,
 preferredMode:modes.includes(raw.transport?.preferredMode)?raw.transport.preferredMode:'WALK',habitWeight:clamp(raw.transport?.habitWeight??4,0,60),weatherWeight:clamp(raw.transport?.weatherWeight??15,0,120),fatigueWeight:clamp(raw.transport?.fatigueWeight??15,0,120),costWeight:clamp(raw.transport?.costWeight??0.5,0,10),
 budget:clamp(raw.transport?.budget??100,0,1e7),fatiguePerMinute:clamp(raw.transport?.fatiguePerMinute??0.05,0,1),lateStress:clamp(raw.transport?.lateStress??0.15,0,2),delayChance:clamp(raw.transport?.delayChance??0,0,1),maxDelay:clamp(raw.transport?.maxDelay??10,0,180)},
 adaptation:{enabled:raw.adaptation?.enabled!==false,retryMinutes:clamp(raw.adaptation?.retryMinutes??30,5,240),followupHours:clamp(raw.adaptation?.followupHours??24,1,168),socialRestMinutes:clamp(raw.adaptation?.socialRestMinutes??30,5,240),socialRecoveryEnergy:clamp(raw.adaptation?.socialRecoveryEnergy??25,0,100)},
 gifts:{enabled:raw.gifts?.enabled===true,mailAllowed:raw.gifts?.mailAllowed===true,cashAllowed:raw.gifts?.cashAllowed===true,minTrust:clamp(raw.gifts?.minTrust??25,-100,100),playerBudget:clamp(raw.gifts?.playerBudget??1000,0,1e7),maxValue:clamp(raw.gifts?.maxValue??100,0,1e6),openingMinutes:clamp(raw.gifts?.openingMinutes??3,1,60),pressureSensitivity:clamp(raw.gifts?.pressureSensitivity??0.5,0,1),deliveryHours:clamp(raw.gifts?.deliveryHours??24,0,720),likes:tags(raw.gifts?.likes),dislikes:tags(raw.gifts?.dislikes)},
 socialAgent:{enabled:raw.socialAgent?.enabled===true,model:str(raw.socialAgent?.model,200),intervalHours:clamp(raw.socialAgent?.intervalHours??6,1,168),maxEvents:clamp(raw.socialAgent?.maxEvents??4,1,8)},
 vision:{provider:raw.vision?.provider==='openrouter'?'openrouter':'local',localModel:str(raw.vision?.localModel,200),openrouterModel:str(raw.vision?.openrouterModel,200)},
 closet:{mode:raw.closet?.mode==='items'?'items':'presets',laundryMinutes:clamp(raw.closet?.laundryMinutes??45,1,240),laundryHours:clamp(raw.closet?.laundryHours??48,1,720),style:tags(raw.closet?.style)},
 items:list(raw.items).filter(i=>i&&typeof i==='object').slice(0,150).map((i,n)=>({id:str(i.id||`item-${n}`,80),name:str(i.name||'Item'),category:categories.includes(i.category)?i.category:'accessory',tags:tags(i.tags),warmth:clamp(i.warmth??1,0,5),photo:str(i.photo,8e6),owned:i.owned!==false,incompatible:tags(i.incompatible)})),
 frame:{openerMode:raw.frame?.openerMode==='vh_first'?'vh_first':'player_first',openingDelayMinutes:clamp(raw.frame?.openingDelayMinutes??1,0,1440),openerScenario:str(raw.frame?.openerScenario,2000),mode:['direct','dating','private_social','public_social'].includes(raw.frame?.mode)?raw.frame.mode:'direct',acceptRequests:raw.frame?.acceptRequests!==false,minComfort:clamp(raw.frame?.minComfort??-20,-100,100),requestMinutes:clamp(raw.frame?.requestMinutes??2,0,1440)},
 voice:{vocabulary:str(raw.voice?.vocabulary,1600),fillers:str(raw.voice?.fillers,500),affection:str(raw.voice?.affection,500),conflict:str(raw.voice?.conflict,500),punctuation:str(raw.voice?.punctuation,300),capitalization:str(raw.voice?.capitalization,100),emoji:str(raw.voice?.emoji,100),cadence:clamp(raw.voice?.cadence??1,0.25,3)},
 people:list(raw.people).filter(p=>p&&typeof p==='object').slice(0,60).map(p=>({personId:str(p.personId,80),placeId:str(p.placeId,80),days:list(p.days).map(Number).filter(d=>d>=0&&d<=6),start:clamp(p.start,0,1439),end:clamp(p.end,1,1440),goal:str(p.goal,160),goalMinutes:clamp(p.goalMinutes??60,5,10000),activity:str(p.activity),mood:str(p.mood,60)}))
};}
function runtime(raw={}) {raw=raw&&typeof raw==='object'?raw:{};return {socialNextAt:clamp(raw.socialNextAt,0,9e15),socialError:str(raw.socialError,500),socialQueue:list(raw.socialQueue).filter(x=>x&&x.id).slice(-40).map(x=>clone(x)),openingAt:clamp(raw.openingAt,0,9e15),version:1,started:raw.started===true,lastAt:clamp(raw.lastAt,0,9e15),placeId:str(raw.placeId,80),balance:raw.balance==null?null:clamp(raw.balance,0,1e7),playerBalance:raw.playerBalance==null?null:clamp(raw.playerBalance,0,1e7),
 journey:raw.journey&&raw.journey.id?{...clone(raw.journey),id:str(raw.journey.id,160),from:str(raw.journey.from,80),to:str(raw.journey.to,80),mode:modes.includes(raw.journey.mode)?raw.journey.mode:'WALK',departedAt:clamp(raw.journey.departedAt,0,9e15),arrivesAt:clamp(raw.journey.arrivesAt,0,9e15),pausedUntil:clamp(raw.journey.pausedUntil,0,9e15)}:null,
 reconciliation:raw.reconciliation&&typeof raw.reconciliation==='object'?{from:clamp(raw.reconciliation.from,0,9e15),until:clamp(raw.reconciliation.until,0,9e15),overdue:clamp(raw.reconciliation.overdue,0,10000)}:null,
 followups:list(raw.followups).filter(x=>x&&x.id).slice(-40).map(x=>({...x,id:str(x.id,180),text:str(x.text,500)})),recoveries:list(raw.recoveries).filter(x=>x&&x.id).slice(-40).map(x=>clone(x)),
 targets:list(raw.targets).map(x=>str(x,160)).slice(-400),events:list(raw.events).filter(e=>e&&typeof e==='object').slice(-300).map(e=>({...e,id:str(e.id,180),summary:str(e.summary,600)})),
 gifts:list(raw.gifts).filter(g=>g&&typeof g==='object').slice(-100).map(g=>({...g,id:str(g.id,100),label:str(g.label),itemId:str(g.itemId,80),tags:tags(g.tags),value:clamp(g.value,0,1e6)})),
 inventory:list(raw.inventory).map(x=>str(x,80)).slice(-150),outfit:raw.outfit?clone(raw.outfit):null,laundry:raw.laundry?clone(raw.laundry):null,wear:raw.wear&&typeof raw.wear==='object'?clone(raw.wear):{},
 connection:raw.connection?clone(raw.connection):{state:'none',requestedAt:0,dueAt:0},mailConsent:typeof raw.mailConsent==='boolean'?raw.mailConsent:null,cashConsent:typeof raw.cashConsent==='boolean'?raw.cashConsent:null,people:raw.people&&typeof raw.people==='object'?clone(raw.people):{}};}
function ensure(c){c.lifeProfile ||= {};c.lifeProfile.world ||= config();c.lifeRuntime ||= {};c.lifeRuntime.world ||= runtime();c.lifeRuntime.world.socialQueue ||= [];c.lifeRuntime.world.followups ||= [];c.lifeRuntime.world.recoveries ||= [];return c.lifeRuntime.world;}
function event(r,id,kind,summary,at,extra={}){if(r.events.some(e=>e.id===id))return; r.events.push({id,kind,summary,at,...extra});r.events=r.events.slice(-300);}
function allowedMode(p,mode){return mode==='WALK'||mode==='DRIVE'&&p.car||mode==='BICYCLE'&&p.bicycle||mode==='TRANSIT'&&p.transit||mode==='RIDESHARE'&&p.rideshare;}
function routeScore(c,leg){const p=c.lifeProfile.world.transport,env=c.lifeRuntime.environment||{},physical=['WALK','BICYCLE'].includes(leg.mode);
 const wet=Number(env.weatherCode)>=51,energy=clamp(c.humanDynamics?.energy??80,0,100);
 return leg.minutes+Number(leg.cost||0)*p.costWeight-(leg.mode===p.preferredMode?p.habitWeight:0)+(physical?((100-energy)/100*p.fatigueWeight+(wet?p.weatherWeight:0)):0);
}
function followup(c,id,text,at){const r=ensure(c);if(c.lifeProfile.world.adaptation?.enabled===false||r.followups.some(x=>x.id===id))return;
 r.followups.push({id,text,createdAt:at,dueAt:at,status:'pending',expiresAt:at+(c.lifeProfile.world.adaptation?.followupHours||24)*3600000});r.followups=r.followups.slice(-40);}
function pendingFollowup(c,now){return (c.lifeRuntime?.world?.followups||[]).find(x=>x.status==='pending'&&x.dueAt<=now&&x.expiresAt>now);}
function acknowledge(c,receipt,reply,now){if(!receipt||typeof reply!=='string')return false;const r=ensure(c),entry=r.followups.find(x=>x.id===receipt.id&&x.status==='pending'&&x.dueAt<=now&&x.expiresAt>now),quote=str(receipt.evidence,500).trim();
 if(!entry||quote.length<8||!reply.includes(quote))return false;entry.status='addressed';entry.addressedAt=now;return true;}
function recover(c,id,label,placeId,at){const r=ensure(c);if(c.lifeProfile.world.adaptation?.enabled===false||r.recoveries.some(x=>x.id===id))return;
 r.recoveries.push({id,label,placeId,status:'pending',dueAt:at+(c.lifeProfile.world.adaptation?.retryMinutes||30)*minute,expiresAt:at+day});r.recoveries=r.recoveries.slice(-40);
 event(r,'reconsider:'+id,'recovery',`The plan to ${label} was disrupted; will reconsider it when free.`,at);
}
function relationshipDecision(c){const d=c.relationshipDynamics||{},stress=Number(c.humanDynamics?.stress||0);
 return {comfort:Number(d.comfort??0)+Number(d.trust??0)*0.25-Number(d.resentment??0)*0.5-stress*0.1,stress};}
function enqueueSocial(c,proposals,now){const r=ensure(c),p=c.lifeProfile.world.socialAgent;if(!p?.enabled)return 0;let added=0;
 for(const raw of list(proposals).slice(0,p.maxEvents)){
  const person=c.lifeProfile.socialCircle?.find(x=>x.id===raw.personId);if(!person||!['message','comment'].includes(raw.kind)||typeof raw.text!=='string'||!raw.text.trim())continue;
  const post=raw.kind==='comment'?(c.socialPosts||[]).find(x=>x.id===raw.postId&&x.visibility==='public'):null;if(raw.kind==='comment'&&!post)continue;
  const text=str(raw.text,500).trim();if(r.socialQueue.some(x=>x.personId===person.id&&x.text===text))continue;
  r.socialQueue.push({id:`npc:${now}:${added}`,personId:person.id,kind:raw.kind,postId:post?.id||'',text,dueAt:now+clamp(raw.delayMinutes,1,p.intervalHours*60)*minute,expiresAt:now+day,status:'pending'});added++;
 }r.socialQueue=r.socialQueue.slice(-40);return added;}
function connected(c){const p=c.lifeProfile?.world?.frame;return !p||p.mode==='direct'||p.mode==='public_social'||c.lifeRuntime?.world?.connection?.state==='accepted';}
function requestConnection(c,now){const r=ensure(c),p=c.lifeProfile.world.frame;if(connected(c))return;if(r.connection.state==='pending'||r.connection.state==='declined')return;
 r.connection={state:'pending',requestedAt:now,dueAt:now+p.requestMinutes*minute*(0.5+roll(c.id+'|connect|'+now))};event(r,'connection-request:'+now,'connection','A connection request was received.',now);}
function offerGift(c,gift,now){const r=ensure(c),p=c.lifeProfile.world.gifts;
 if(!connected(c))throw Error('Connect before offering gifts.');if(!p.enabled)throw Error('This person is not accepting gift offers.');
 if(!gift.id||r.gifts.some(g=>g.id===gift.id))return false;
 if(r.gifts.length>=100)throw Error('Gift history is full.');
 const cash=gift.kind==='cash',digital=gift.kind==='digital',value=clamp(gift.value,0,1e6),trust=Number(c.relationshipDynamics?.trust??c.mood?.relationship??0);
 if(value<=0&&cash)throw Error('Enter a positive simulated amount.');
 if(cash?!(r.cashConsent??p.cashAllowed):!digital&&!(r.mailConsent??p.mailAllowed))throw Error(cash?'They have not agreed to receive cash.':'They have not agreed to receive mailed gifts.');
 if(r.playerBalance===null)r.playerBalance=p.playerBudget;
 if(value>r.playerBalance)throw Error('Not enough simulated player funds.');
 if(trust<p.minTrust)throw Error('Their relationship requirement has not been met.');
 const item=c.lifeProfile.world.items.find(i=>i.id===gift.itemId);
 if(!cash&&!item)throw Error('Choose an uploaded gift item first.');
 if(!cash&&(item.owned||r.inventory.includes(item.id)||r.gifts.some(g=>g.itemId===item.id&&g.status!=='declined')))throw Error('This item is already owned or on its way.');
 const disliked=!cash&&item.tags.some(t=>p.dislikes.includes(t));
 const pressure=relationshipDecision(c),recent=r.gifts.filter(g=>g.offeredAt>now-day&&g.status!=='declined').length;
 const pressured=p.pressureSensitivity>0&&pressure.comfort<0&&(value>p.maxValue*(1-p.pressureSensitivity*0.5)||recent>=3);
 const accepted=value<=p.maxValue&&!disliked&&!pressured;
 const record={id:str(gift.id,100),kind:cash?'cash':digital?'digital':'item',itemId:item?.id||'',label:cash?'Simulated cash':item.name,tags:item?.tags||[],value,status:accepted?'shipping':'declined',offeredAt:now,dueAt:now+(cash||digital?0:p.deliveryHours*3600000)};
 if(accepted)r.playerBalance-=value;
 r.gifts.push(record);event(r,'gift-offer:'+record.id,'gift',accepted?`Accepted an offer of ${record.label}; ${cash?'transfer pending':'delivery pending'}.`:`Declined ${record.label}: ${pressured?'feels too pressured in the current relationship':disliked?'does not suit their preferences':'exceeds their gift value limit'}.`,now);
 return accepted;
}
function consent(c,choice,messages,now){if(!choice||!['mail','cash'].includes(choice.kind)||typeof choice.allow!=='boolean')return false;
 const msg=list(messages).filter(m=>m.role==='user'&&!m.invalidated&&m.readAt>0&&m.readAt<=now&&m.timestamp<=now).at(-1);
 const quote=str(choice.evidence,300).trim();if(!msg||quote.length<4||!String(msg.text||'').includes(quote))return false;
 const r=ensure(c),id=`consent:${msg.id}:${choice.kind}`;if(r.events.some(e=>e.id===id))return false;
 r[choice.kind==='mail'?'mailConsent':'cashConsent']=choice.allow;
 event(r,id,'permission',`${choice.allow?'Granted':'Withdrew'} permission for ${choice.kind==='mail'?'mailed gifts':'simulated cash transfers'}.`,now);return true;
}
function owned(c,r){return c.lifeProfile.world.items.filter(i=>i.owned||r.inventory.includes(i.id));}
function chooseOutfit(c,now,situation={},forcedId=''){
 const r=ensure(c),p=c.lifeProfile.world;if(p.closet.mode!=='items')return null;
 const rawContext=String(situation.outfitContext||situation.activity||'casual').toLowerCase();
 const context=rawContext+' '+({active:'fitness sporty athleisure',home:'casual lounge cozy',sleep:'sleep lounge',work:'work professional',formal:'formal professional',social:'social casual'}[rawContext]||'');
 const temperature=Number(c.lifeRuntime.environment?.temperature??20);
 const key=`${context}|${Math.floor(temperature/8)}|${Math.floor((c.humanDynamics?.stress||0)/30)}`;
 if(!forcedId&&r.outfit?.key===key&&now-r.outfit.at<12*3600000)return r.outfit;
 const available=owned(c,r).filter(i=>!r.wear[i.id]?.dirtyAt);
 if(forcedId&&!available.some(i=>i.id===forcedId))throw Error('That garment is unavailable or needs laundry.');
 const score=i=>((c.humanDynamics?.stress||0)>50&&i.tags.some(t=>['cozy','comfortable','lounge'].includes(t))?8:0)+i.tags.filter(t=>context.includes(t)||p.closet.style.includes(t)).length*8 + (temperature<15?i.warmth*3:temperature>26?-i.warmth*3:0) +roll(c.id+'|outfit|'+Math.floor(now/day)+'|'+i.id)*3+(i.id===forcedId?1000:0);
 const ranked=[...available].sort((a,b)=>score(b)-score(a));
 const pick=category=>ranked.find(i=>i.category===category);
 const dress=pick('dress'),top=pick('top'),bottom=pick('bottom');let selected=[];
 if(dress&&(!top||!bottom||score(dress)>score(top)+score(bottom)))selected=[dress];else if(top&&bottom)selected=[top,bottom];else return r.outfit;
 for(const category of ['underwear','shoes','outerwear','accessory']){if(category==='outerwear'&&temperature>22&&!forcedId)continue;const item=pick(category);if(item)selected.push(item);}
 selected=selected.filter((i,n,all)=>!all.slice(0,n).some(other=>i.incompatible.includes(other.id.toLowerCase())||other.incompatible.includes(i.id.toLowerCase())));
 if(forcedId&&!selected.some(i=>i.id===forcedId))throw Error('No compatible complete outfit can include this item.');
 if(!selected.some(i=>i.category==='dress')&&!(selected.some(i=>i.category==='top')&&selected.some(i=>i.category==='bottom')))return r.outfit;
 const ids=selected.map(i=>i.id);if(r.outfit?.ids?.join('|')!==ids.join('|')){
  for(const id of r.outfit?.ids||[]){if(!ids.includes(id))r.wear[id]={dirtyAt:now};}
  r.outfit={ids,label:selected.map(i=>i.name).join(', '),at:now,key};
  event(r,'outfit:'+now,'outfit',`Changed into ${r.outfit.label}.`,now);
 }else r.outfit={...r.outfit,key};return r.outfit;
}
function interrupt(c,now,minutes=0){const r=ensure(c),j=r.journey;if(!j)throw Error('No journey is in progress.');const delay=clamp(minutes,1,180)*minute;
 j.arrivesAt+=delay;j.pausedUntil=Math.max(now,j.pausedUntil||0)+delay;
 event(r,'journey-delay:'+j.id+':'+now,'travel',`Journey paused for ${delay/minute} minutes.`,now);}
// Resolve a wall-clock appointment through the character's timezone rather
// than treating every local day as 24 hours (DST transitions can differ).
function wallTime(c,dateKey,mins,guess,localAt){
 const target=Date.parse(dateKey+'T00:00:00Z')+mins*minute;let value=guess,latest=guess;
 for(let i=0;i<4;i++){const local=localAt(c,value),observed=Date.parse(local.dateKey+'T00:00:00Z')+(local.hour*60+local.minute)*minute;const delta=target-observed;if(!delta)return value;value+=delta;latest=Math.max(latest,value);}
 return latest;
}
function advance(c,now,localAt,baselineAt){const r=ensure(c),p=c.lifeProfile.world;const prior=r.events.length?r.events.at(-1).id:'';const effects={stress:0,energy:0};
 if(r.balance===null)r.balance=p.transport.budget;
 if(!r.lastAt){r.lastAt=Math.floor(now/minute)*minute;r.placeId=r.placeId||c.lifeProfile.places?.find(i=>i.kind==='home')?.id||c.lifeProfile.places?.[0]?.id||'';}
 if(now<r.lastAt)return {events:[],...effects};
 function step(at){
  const local=localAt(c,at),minuteOfDay=local.hour*60+local.minute;
  if(r.connection.state==='pending'&&r.connection.dueAt<=at){const feeling=relationshipDecision(c);r.connection.state=p.frame.acceptRequests&&feeling.comfort>=(p.frame.minComfort??-20)?'accepted':'declined';r.connection.reason=!p.frame.acceptRequests?'Not open to requests':feeling.comfort<(p.frame.minComfort??-20)?'Not comfortable enough with the current relationship':'Comfortable connecting';event(r,'connection-result:'+r.connection.requestedAt,'connection',r.connection.state==='accepted'?(p.frame.mode==='dating'?"Matched. Messaging is now available.":'Connection accepted. Messaging is now available.'):'Connection request declined.',at);}
  const physicalBaseline=baselineAt?baselineAt(c,at):{};
  if(!p.transport.enabled&&physicalBaseline.placeId)r.placeId=physicalBaseline.placeId;
  const homeNow=!r.journey&&c.lifeProfile.places.find(x=>x.id===r.placeId)?.kind==='home';
  for(const g of r.gifts){
   if(g.status==='shipping'&&g.dueAt<=at){if(g.kind==='item'){g.status='delivered';g.deliveredAt=at;event(r,'gift-delivered:'+g.id,'delivery',`${g.label} was delivered to home; not collected or opened yet.`,at);}else{g.status='received';g.receivedAt=at;if(g.kind==='cash')r.balance+=g.value;else if(!r.inventory.includes(g.itemId))r.inventory.push(g.itemId);event(r,'gift-received:'+g.id,'gift',`Received ${g.label}.`,at);followup(c,'gift:'+g.id,`Received ${g.label}; decide whether and how to acknowledge it.`,at);}}
   if(g.status==='delivered'&&homeNow&&physicalBaseline.availability==='available'){g.status='collected';g.collectedAt=at;g.opensAt=at+(p.gifts.openingMinutes||3)*minute;event(r,'gift-collected:'+g.id,'gift',`Collected the package containing ${g.label}; opening it when free.`,at);}
   if(g.status==='collected'&&g.opensAt<=at&&homeNow&&physicalBaseline.availability==='available'){g.status='received';g.receivedAt=at;if(!r.inventory.includes(g.itemId))r.inventory.push(g.itemId);
    const liked=g.tags.some(t=>p.gifts.likes.includes(t));event(r,'gift-received:'+g.id,'gift',`Opened ${g.label}${liked?', which fits their stated preferences':''}.`,at);if(liked)effects.stress-=2;followup(c,'gift:'+g.id,`Actually opened ${g.label}; react according to how it felt, without treating it as an obligation to be affectionate.`,at);}
  }
  if(p.transport.enabled){
   if(r.journey&&r.journey.arrivesAt<=at){const j=r.journey;r.placeId=j.to;r.journey=null;const late=Math.max(0,Math.ceil((j.arrivesAt-j.targetStart)/minute));const missed=j.arrivesAt>=j.targetEnd;
    effects.energy-=Math.min(25,Math.max(0,(j.arrivesAt-j.departedAt)/minute)*p.transport.fatiguePerMinute*(['WALK','BICYCLE'].includes(j.mode)?1:0.2));
    effects.stress+=Math.min(25,late*p.transport.lateStress);event(r,'arrival:'+j.id,'arrival',`Arrived at ${j.toLabel}${missed?' after the commitment ended':late?` ${late} minutes late`:''}.`,j.arrivesAt,{lateMinutes:late,missed,placeId:j.to});if(missed)recover(c,j.id,j.toLabel,j.to,j.arrivesAt);const conversation=c.continuityRuntime?.conversation;if(conversation?.status==='paused')followup(c,'return:'+j.id,`Now arrived. Return to the interrupted topic if still relevant: ${str(conversation.topic,180)} ${str(conversation.openQuestion,180)}`,j.arrivesAt);}
   if(!r.journey){
    const midnight=Math.floor(at/minute)*minute-minuteOfDay*minute;
    const targets=[];
    for(let d=-1;d<=1;d++){const sample=localAt(c,midnight+d*day+12*3600000);for(const block of c.lifeProfile.weeklySchedule||[]){if(!block.days.includes(sample.weekday)||!block.placeId)continue;const start=wallTime(c,sample.dateKey,block.startMinute,midnight+d*day+block.startMinute*minute,localAt),end=wallTime(c,sample.dateKey,(block.endMinute<=block.startMinute?1440:0)+block.endMinute,midnight+d*day+(block.endMinute<=block.startMinute?1440:0)*minute+block.endMinute*minute,localAt);
      if(end<=at||start>at+12*3600000)continue;targets.push({block,start,end,id:`${sample.dateKey}:${block.id}`});}}
    targets.sort((a,b)=>a.start-b.start);const target=targets.find(t=>!r.targets.includes(t.id));
    if(target){
     if(target.block.placeId===r.placeId){if(at>=target.start)r.targets.push(target.id);}
     else{
      const routes=(c.lifeProfile.travelLegs||[]).filter(l=>l.from===r.placeId&&l.to===target.block.placeId&&allowedMode(p.transport,l.mode)&&Number(l.cost||0)<=r.balance).sort((a,b)=>routeScore(c,a)-routeScore(c,b));
      const leg=routes[0];const current=targets.some(t=>t.block.placeId===r.placeId&&at>=t.start&&at<t.end);
      if(leg&&at>=target.start-leg.minutes*minute&&!current){const delay=roll(c.id+'|delay|'+target.id)<p.transport.delayChance?Math.ceil(roll(c.id+'|delay-length|'+target.id)*p.transport.maxDelay):0;
       if(c.lifeProfile.places.find(i=>i.id===r.placeId)?.kind==='home')chooseOutfit(c,at,{activity:target.block.activity,outfitContext:target.block.outfitContext});
       const to=c.lifeProfile.places.find(i=>i.id===leg.to);r.journey={id:target.id,from:r.placeId,to:leg.to,toLabel:to?.label||leg.to,mode:leg.mode,routeSource:leg.source,departedAt:at,arrivesAt:at+(leg.minutes+delay)*minute,targetStart:target.start,targetEnd:target.end,cost:Number(leg.cost||0)};
       r.balance-=r.journey.cost;r.targets.push(target.id);event(r,'departure:'+target.id,'travel',`Left for ${r.journey.toLabel} by ${leg.mode.toLowerCase()}${delay?`; departure delay ${delay} minutes`:''}.`,at,{cost:r.journey.cost});}
      else if(!leg&&at>=target.start){r.targets.push(target.id);effects.stress+=3;event(r,'unreachable:'+target.id,'missed',`Could not reach ${target.block.activity}: no affordable available route from the current place.`,at);recover(c,target.id,target.block.activity,target.block.placeId,at);}
     }
    }
   }
  }
  const baseline=baselineAt?baselineAt(c,at):{};
  if(!p.transport.enabled&&baseline.placeId)r.placeId=baseline.placeId;
  const atHome=c.lifeProfile.places.find(place=>place.id===r.placeId)?.kind==='home';
  for(const queued of r.socialQueue||[]){if(queued.status!=='pending'||queued.dueAt>at)continue;if(queued.expiresAt<=at){queued.status='expired';continue;}
   const person=c.lifeProfile.socialCircle?.find(x=>x.id===queued.personId);if(!person){queued.status='cancelled';continue;}
   if(!p.socialAgent?.enabled||r.journey||baseline.availability!=='available'||r.people[person.id]?.restUntil>at)continue;
   if(queued.kind==='comment'){const post=c.socialPosts?.find(x=>x.id===queued.postId);if(!post)continue;if(post.visibility!=='public'){queued.status='cancelled';continue;}
    post.comments ||= [];if(!post.comments.some(x=>x.id===queued.id))post.comments.push({id:queued.id,authorId:person.id,authorName:person.name,text:queued.text,createdAt:at});post.comments=post.comments.slice(-50);
   }
   queued.status='delivered';queued.deliveredAt=at;event(r,queued.id,'npc_'+queued.kind,`${person.name} ${queued.kind==='comment'?'commented on a public post':'sent a message'}: “${queued.text}”`,at,{personId:person.id});
   break;
  }

  for(const item of r.recoveries){if(item.status!=='pending')continue;if(at>=item.expiresAt){item.status='expired';continue;}
   if(at>=item.dueAt&&!r.journey&&baseline.availability==='available'){
    item.status='decided';item.decidedAt=at;
    for(let offset=1;offset<=7&&!item.nextAttemptAt;offset++){const future=localAt(c,at+offset*day);const next=(c.lifeProfile.weeklySchedule||[]).filter(b=>b.placeId===item.placeId&&b.days.includes(future.weekday)).sort((a,b)=>a.startMinute-b.startMinute)[0];if(next)item.nextAttemptAt=wallTime(c,future.dateKey,next.startMinute,at+offset*day,localAt);}
    item.action=Number(c.humanDynamics?.energy??80)<40?'recovery':'preparation';
    event(r,'recovery-action:'+item.id,'recovery_action',`Reconsidered the missed plan (${item.label}); ${item.action==='recovery'?'taking a restorative break':'making a new plan for a later opportunity'}. The original appointment remains missed.${item.nextAttemptAt?` Next scheduled opportunity: ${new Date(item.nextAttemptAt).toISOString()}.`:''}`,at,{action:item.action});
    if(c.continuityRuntime?.conversation?.status==='paused')followup(c,'recovery:'+item.id,`The earlier plan was disrupted: ${item.label}. Explain only if relevant to the interrupted conversation; do not claim the missed appointment was completed.`,at);
   }
  }
  for(const item of r.followups)if(item.status==='pending'&&at>=item.expiresAt)item.status='expired';

  if(p.closet.mode==='items'&&atHome&&!r.journey){
   if(r.laundry&&at>=r.laundry.endsAt){for(const id of r.laundry.ids)delete r.wear[id];event(r,'laundry-finish:'+r.laundry.startedAt,'laundry','Finished a load of laundry; those garments are clean again.',at);r.laundry=null;effects.energy-=1;}
   const dirty=owned(c,r).filter(i=>r.wear[i.id]?.dirtyAt&&at-r.wear[i.id].dirtyAt>=p.closet.laundryHours*3600000);
   if(!r.laundry&&dirty.length&&baseline.availability==='available'){r.laundry={ids:dirty.map(i=>i.id),startedAt:at,endsAt:at+p.closet.laundryMinutes*minute};event(r,'laundry-start:'+at,'laundry','Started a load of laundry at home.',at);}
  }
  if(!r.journey&&baseline.availability!=='asleep'&&(!p.transport.enabled||c.lifeProfile.places.find(place=>place.id===r.placeId)?.kind==='home'))chooseOutfit(c,at,baseline);
  for(const person of c.lifeProfile.socialCircle||[]){
   let schedule=p.people.find(n=>n.personId===person.id&&n.days.includes(local.weekday)&&minuteOfDay>=n.start&&minuteOfDay<n.end);
   const previous=r.people[person.id]||{energy:80,stress:15,lastAt:at};
   if(previous.energy<(p.adaptation?.socialRecoveryEnergy??25)&&!(previous.restUntil>at))previous.restUntil=at+(p.adaptation?.socialRestMinutes||30)*minute;
   if(previous.restUntil>at)schedule=null;
   const elapsed=Math.max(0,Math.min(60,(at-previous.lastAt)/minute));
   r.people[person.id]={...previous,placeId:schedule?.placeId||'',activity:schedule?.activity||'off duty',energy:clamp(previous.energy+(schedule?-0.05:0.08)*elapsed,0,100),stress:clamp(previous.stress+(schedule?0.02:-0.04)*elapsed,0,100),lastAt:at};
   const current=r.people[person.id];if(schedule?.goal){if(current.goal!==schedule.goal){current.goal=schedule.goal;current.progress=0;current.goalCompleted=false;}if(!current.goalCompleted){current.progress=Math.min(schedule.goalMinutes,(current.progress||0)+elapsed);if(current.progress>=schedule.goalMinutes)current.goalCompleted=true;}}
  }
  if(!r.journey&&r.placeId){for(const schedule of p.people){if(schedule.placeId!==r.placeId||!schedule.days.includes(local.weekday)||minuteOfDay<schedule.start||minuteOfDay>=schedule.end)continue;
    const person=c.lifeProfile.socialCircle?.find(i=>i.id===schedule.personId);if(!person||r.people[person.id]?.placeId!==r.placeId)continue;
    const id=`encounter:${local.dateKey}:${person.id}:${schedule.placeId}:${schedule.start}`;
    event(r,id,'encounter',`Crossed paths with ${person.name} at ${c.lifeProfile.places.find(i=>i.id===r.placeId)?.label||'a recurring place'} while they were ${schedule.activity||'there'}${r.people[person.id]?.energy<35?' (tired)':r.people[person.id]?.stress>55?' (under pressure)':schedule.mood?` (${schedule.mood})`:''}.`,at,{personId:person.id,placeId:r.placeId});const personState=r.people[person.id];if(personState.goal&&personState.lastSharedProgress!==personState.progress){event(r,id+':progress','encounter',`${person.name} is ${personState.goalCompleted?'finished with':'still working on'} ${personState.goal}.`,at,{personId:person.id,placeId:r.placeId});personState.lastSharedProgress=personState.progress;}}}
  r.targets=r.targets.slice(-400);
 }
 if(now-r.lastAt>72*3600000){const cutoff=Math.floor((now-72*3600000)/minute)*minute,old=r.lastAt;
  if(r.journey&&r.journey.arrivesAt<=cutoff){r.placeId=r.journey.to;recover(c,r.journey.id,r.journey.toLabel,r.journey.to,cutoff);r.journey=null;}
  const obligations=(c.commitments||[]).filter(x=>x.status==='pending'&&x.dueAt>old&&x.dueAt<=cutoff);
  for(const item of obligations){item.status='missed';item.resolvedAt=cutoff;}
  for(const g of r.gifts)if(g.kind==='item'&&g.status==='shipping'&&g.dueAt<=cutoff){g.status='delivered';g.deliveredAt=g.dueAt;}
  r.reconciliation={from:old,until:cutoff,overdue:obligations.length};
  event(r,'absence:'+old+':'+cutoff,'reconciliation',`${Math.floor((cutoff-old)/day)} older days were reconciled without inventing encounters or completed activities. ${obligations.length} overdue commitments remain missed; uncollected parcels wait at home.`,cutoff);
  r.lastAt=cutoff;
 }
 const start=Math.max(r.lastAt+minute,Math.floor((now-72*3600000)/minute)*minute);
 if(!r.started){r.started=true;step(r.lastAt);}
 for(let at=start;at<=now;at+=minute){step(at);r.lastAt=at;}
 const index=r.events.findIndex(e=>e.id===prior);return {events:prior?r.events.slice(index+1):r.events.slice(),...effects};
}
function situation(c,now){const r=c.lifeRuntime?.world,p=c.lifeProfile?.world;if(!r||!p?.transport.enabled||!r.lastAt||now<r.lastAt||now>r.lastAt+minute)return null;
 const j=r.journey;if(j&&now<j.arrivesAt)return {source:'travel',activity:`${now<(j.pausedUntil||0)?'Paused during':'Travelling by '+j.mode.toLowerCase()+' on'} the journey to ${j.toLabel}`,label:`Travelling to ${j.toLabel}`,availability:j.mode==='DRIVE'||j.mode==='BICYCLE'?'private':'busy',placeId:'',placeLabel:`Between ${c.lifeProfile.places.find(p=>p.id===j.from)?.label||j.from} and ${j.toLabel}`,withNames:[],startedAt:j.departedAt,endsAt:j.arrivesAt,outfit:r.outfit?.label||c.currentOutfit||'',environment:c.lifeRuntime.environment};
 return null;}
function routeRequest(c,now){const p=c.lifeProfile?.world?.transport,r=c.lifeRuntime?.world,j=r?.journey;
 if(!p?.liveRouting||!j||j.routeSource==='Manual override'||j.routeStatus||now>=j.arrivesAt||now-j.departedAt>5*minute)return null;
 const origin=c.lifeProfile.places.find(x=>x.id===j.from)?.googlePlaceId,destination=c.lifeProfile.places.find(x=>x.id===j.to)?.googlePlaceId;
 const originCoordinates=c.lifeProfile.places.find(x=>x.id===j.from)?.mapCoordinates,destinationCoordinates=c.lifeProfile.places.find(x=>x.id===j.to)?.mapCoordinates;
 if((!origin||!destination)&&(!originCoordinates||!destinationCoordinates))return null;
 return {id:j.id,origin,destination,originCoordinates,destinationCoordinates,mode:j.mode==='RIDESHARE'?'DRIVE':j.mode};}
function applyRoute(c,id,response,now){const r=ensure(c),j=r.journey;if(!j||j.id!==id||j.routeStatus)return false;
 const seconds=Number(String(response?.routes?.[0]?.duration||'').replace(/s$/,''));
 if(!Number.isFinite(seconds)||seconds<=0||seconds>86400){j.routeStatus='fallback';event(r,'route:'+id,'travel','Live routing was unavailable; using the authored travel estimate.',now);return false;}
 const plannedMs=j.arrivesAt-j.departedAt;const authored=c.lifeProfile.travelLegs.find(l=>l.from===j.from&&l.to===j.to&&l.mode===j.mode)?.minutes*minute||plannedMs;
 j.arrivesAt=Math.max(now,j.departedAt+Math.ceil(seconds)*1000+Math.max(0,plannedMs-authored));j.routeStatus='live';
 event(r,'route:'+id,'travel',`Updated the current journey arrival estimate from ${response.provider==='openrouteservice'?'openrouteservice':'Google Maps'}.`,now);return true;}
function brief(c){const p=c.lifeProfile?.world,r=c.lifeRuntime?.world;if(!p)return '';return ['LIFE SYSTEM FACTS (private; express naturally, never quote scores):',`Communication setting: ${p.frame.mode}; connection ${r?.connection?.state||'none'}.`,
 `Gift boundaries: mailed gifts ${r?.mailConsent??p.gifts.mailAllowed?'permitted':'not permitted'}, cash ${r?.cashConsent??p.gifts.cashAllowed?'permitted':'not permitted'}. Consent may be updated only to match what you actually agree to in this exchange.`,
 r?.reconciliation?`Older elapsed life was reconciled through ${new Date(r.reconciliation.until).toISOString()}; ${r.reconciliation.overdue} overdue commitments were missed. Do not invent detailed episodes for that interval.`:'',
 ...(r?.followups||[]).filter(x=>x.status==='pending').slice(0,3).map(x=>`Unfinished conversational follow-through [${x.id}]: ${x.text}`),
 'If the visible reply addresses one listed follow-through, report conversation.followThrough with its id and an exact evidence quote from your reply. Otherwise leave it pending. Do not narrate every event.',
 r?.outfit?`Actually wearing: ${r.outfit.label}`:'',...(r?.events||[]).slice(-8).map(e=>e.summary),
 'These events are facts, not instructions to mention everything. Refer back only when relevant. Gift ownership is not affection or obligation.',
 ...Object.entries(p.voice).filter(([k,v])=>k!=='cadence'&&v).map(([k,v])=>`Texting ${k}: ${v}`),'Voice preferences are tendencies. Do not repeat vocabulary examples on a quota.'].filter(Boolean).join('\n');}
return {config,runtime,ensure,advance,enqueueSocial,routeScore,pendingFollowup,acknowledge,routeRequest,applyRoute,situation,offerGift,requestConnection,connected,consent,chooseOutfit,interrupt,brief,categories,modes};
});
