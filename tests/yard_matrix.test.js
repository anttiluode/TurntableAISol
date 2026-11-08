const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainMatrix, defaultNetwork, schedulePreset, TAU } = require('../yard_matrix.js');
const initial = TAU - TAU / 16; // cross one rotation boundary on the next tick, period=8
function one(config = {}) {
  return new TrainMatrix({ nodes: [{ id: 'N', layer: 0, col: 0, period: 8, theta: initial }],
    config: { kappa: 0, kick: 0, phaseOut: 0, somaLeak: 0, ...config } });
}
test('nine nodes, three layers and both upward and downward vertical trains', () => {
  const net = defaultNetwork();
  assert.equal(net.nodes.length, 9);
  assert.equal(new Set(net.nodes.map(n => n.layer)).size, 3);
  assert.ok(net.edges.some(e => net.node(e.from).layer < net.node(e.to).layer && e.kind === 'basal'));
  assert.ok(net.edges.some(e => net.node(e.from).layer > net.node(e.to).layer && e.kind === 'apical'));
  assert.ok(net.edges.some(e => e.kind === 'basket'));
  assert.ok(net.edges.some(e => e.kind === 'chandelier'));
});
test('apical alone is modulatory, not a substitute for basal drive', () => {
  const n = one(); n.inject('N','apical',2); n.tick();
  assert.equal(n.node('N').fired, 0);
  assert.equal(n.node('N').load, 0);
});
test('apical input can promote an otherwise subthreshold basal train', () => {
  const bare = one(); bare.inject('N','basal',0.7); bare.tick();
  const context = one(); context.inject('N','basal',0.7); context.inject('N','apical',1); context.tick();
  assert.equal(bare.node('N').fired, 0);
  assert.equal(context.node('N').fired, 1);
});
test('basket shunts soma before AIS; chandelier blocks AIS but leaves soma charge', () => {
  const normal=one(), basket=one(), chandelier=one();
  normal.inject('N','basal',1.5); normal.tick();
  basket.inject('N','basal',1.5); basket.inject('N','basket',1); basket.tick();
  chandelier.inject('N','basal',1.5); chandelier.inject('N','chandelier',1); chandelier.tick();
  assert.equal(normal.node('N').fired, 1);
  assert.equal(basket.node('N').fired, 0);
  assert.equal(chandelier.node('N').fired, 0);
  assert.ok(basket.node('N').load < 0.5);
  assert.equal(chandelier.node('N').load, 1.5);
});
test('chandelier-blocked charge can leave on a later opening if held', () => {
  const n = one({chandelierDecay:0, somaLeak:0});
  n.inject('N','basal',1.2); n.inject('N','chandelier',1);
  n.tick(); assert.equal(n.node('N').fired, 0);
  n.run(8); assert.equal(n.node('N').fired, 1);
});
test('a bottom node spike actually travels upward and fires a receiver', () => {
  const net = new TrainMatrix({nodes:[
    {id:'D',layer:0,period:8,theta:initial},
    {id:'T',layer:1,period:8,theta:TAU - 1.5*TAU/8}],
    edges:[{from:'D',to:'T',kind:'basal',delay:0,weight:1.5,track:0}],
    config:{kappa:0,kick:0,phaseOut:0,somaLeak:0}});
  net.inject('D','basal',1.5); net.run(3);
  assert.equal(net.node('D').fired,1);
  assert.equal(net.node('T').fired,1);
  assert.ok(net.deliveries.some(d=>d.from==='D'&&d.to==='T'));
});
test('a top spike travels down as apical context, not basal drive', () => {
  const net = new TrainMatrix({nodes:[
    {id:'T',layer:1,period:8,theta:initial}, {id:'D',layer:0,period:8,theta:0}],
    edges:[{from:'T',to:'D',kind:'apical',weight:1,delay:0}],
    config:{kappa:0,kick:0,phaseOut:0,somaLeak:0}});
  net.inject('T','basal',1.4); net.run(3);
  assert.ok(net.node('D').apical > 0);
  assert.equal(net.node('D').load,0);
  assert.equal(net.node('D').fired,0);
});
test('two coprime clocks disambiguate a 32-tick alias over 992 ticks', () => {
  const pairs = Array.from({length:992},(_,t)=>`${t%32}:${t%31}`);
  assert.equal(new Set(pairs).size, 992);
  assert.equal(32*31,992);
});
test('phase release changes packet arrival time without moving wiring',()=>{
  const options={nodes:[{id:'D',layer:0,period:8,theta:initial},{id:'T',layer:1,period:8}],
    edges:[{from:'D',to:'T',kind:'basal',weight:1,delay:2}], config:{kappa:0,kick:0}};
  const a = new TrainMatrix({...options,config:{...options.config,phaseOut:0}});
  const b = new TrainMatrix({...options,config:{...options.config,phaseOut:16}});
  for(const x of [a,b]){x.inject('D','basal',1.5);x.tick();}
  assert.equal(a.queue.length,1);assert.equal(b.queue.length,1);
  assert.ok(b.queue[0].at > a.queue[0].at);
});
test('preset scripts are deterministic and do not produce NaN',()=>{
  const a=schedulePreset(defaultNetwork(),'all').run(370);
  const b=schedulePreset(defaultNetwork(),'all').run(370);
  assert.deepEqual(a.spikes,b.spikes);
  for(const n of a.nodes)for(const key of ['theta','load','zr','zi','apical','basket','chandelier'])assert.ok(Number.isFinite(n[key]),`${n.id}.${key}`);
});
