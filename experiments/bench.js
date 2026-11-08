/* Reproducible controlled intervention and network receipt; node experiments/bench.js */
const { TrainMatrix, defaultNetwork, schedulePreset, TAU } = require('../yard_matrix.js');
const fs=require('node:fs');
const path=require('node:path');
function gateTrial({apical=false,basket=false,chandelier=false}={}) {
  const net=new TrainMatrix({nodes:[{id:'N',layer:0,period:8,theta:TAU-TAU/16}],
    config:{kappa:0,kick:0,phaseOut:0,somaLeak:0.35,apicalDecay:0,basketDecay:0,chandelierDecay:0}});
  // Independent isolated trials: every cycle starts from the same initial state.
  let fires=0,remaining=0;
  for(let k=0;k<30;k++) {
    net.reset();
    net.inject('N','basal',0.7);
    if(apical)net.inject('N','apical',1);
    if(basket)net.inject('N','basket',1);
    if(chandelier)net.inject('N','chandelier',1);
    net.tick();
    fires+=net.node('N').fired;
    remaining+=net.node('N').load;
  }
  return {trials:30,spikes:fires,mean_remaining_load:+(remaining/30).toFixed(4)};
}
function inhibitionTrial(kind) {
  const n = new TrainMatrix({nodes:[{id:'N',layer:0,period:8,theta:TAU-TAU/16}],
    config:{kappa:0,kick:0,phaseOut:0,somaLeak:0,chandelierDecay:0}});
  n.inject('N','basal',1.5);
  if(kind)n.inject('N',kind,1);
  n.tick();
  return {spikes:n.node('N').fired,retained_load:+n.node('N').load.toFixed(4)};
}
function networkTrial(preset, controls={}) {
  const net=schedulePreset(defaultNetwork(controls),preset).run(420);
  const counts={};for(const n of net.nodes) counts[n.id]=n.fired;
  return {spikes:net.spikes.length,by_node:counts,
    up_deliveries:net.deliveries.filter(d=>d.from!=='stimulus'&&net.node(d.from).layer<net.node(d.to).layer).length,
    down_deliveries:net.deliveries.filter(d=>d.from!=='stimulus'&&net.node(d.from).layer>net.node(d.to).layer).length,
    basket_deliveries:net.deliveries.filter(d=>d.kind==='basket').length,
    chandelier_deliveries:net.deliveries.filter(d=>d.kind==='chandelier').length};
}
function bench(){return {
  note:'All outputs from deterministic, designed dynamics; not measured biology or learned AI',
  clock_alias:{single_period:32,paired_period:31,unique_ticks:32*31},
  apical:{basal_only:gateTrial(),basal_plus_tuft:gateTrial({apical:true}),tuft_only:(()=>{const n=new TrainMatrix({nodes:[{id:'N',layer:0,period:8,theta:TAU-TAU/16}],config:{kappa:0}});n.inject('N','apical',2);n.tick();return n.node('N').fired})()},
  inhibition:{none:inhibitionTrial(),basket:inhibitionTrial('basket'),chandelier:inhibitionTrial('chandelier')},
  multi_layer:{climb:networkTrial('climb'),apical:networkTrial('apical'),basket:networkTrial('basket'),chandelier:networkTrial('chandelier'),all:networkTrial('all'),no_vertical:networkTrial('all',{enableVertical:false}),no_apical_climb:networkTrial('climb',{enableApical:false}),no_basket_basket:networkTrial('basket',{enableBasket:false}),no_chandelier_chandelier:networkTrial('chandelier',{enableChandelier:false})}
};}
if(require.main===module){const result=bench();const dest=path.join(__dirname,'..','results.json');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
module.exports={bench};
