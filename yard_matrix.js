/* Turntable AISol: layered train-yard computing lab.
 * Deliberately designed mathematical toy, not a biophysical neuron.
 * One deterministic, dependency-free engine for the browser and Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrainMatrix = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = 2 * Math.PI;
  const kinds = ['basal', 'apical', 'basket', 'chandelier'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap = x => ((x % TAU) + TAU) % TAU;
  const angles = [TAU / 4, TAU / 2, 3 * TAU / 4];

  function configs() {
    return {
      kappa: 1, somaLeak: 0.014, apicalDecay: 0.92, basketDecay: 0.82,
      chandelierDecay: 0.84, apicalGain: 0.9, basketStrength: 1.4,
      chandelierThreshold: 0.45, threshold: 1.0, phaseOut: 8, kick: 0.025,
      aisMode: 'load', enableApical: true, enableBasket: true,
      enableChandelier: true, enableVertical: true, enableLateral: true,
    };
  }

  class TrainMatrix {
    constructor({ nodes = [], edges = [], config = {} } = {}) {
      this.cfg = { ...configs(), ...config };
      this.nodeDefs = nodes.map(n => ({ ...n }));
      this.edgeDefs = edges.map(e => ({ ...e }));
      this.reset();
    }
    reset() {
      this.t = 0;
      this.nodes = this.nodeDefs.map(def => ({
        ...def, period: def.period || 32, theta: wrap(def.theta || 0),
        load: 0, zr: 0, zi: 0, apical: 0, basket: 0, chandelier: 0,
        fired: 0, lastFire: -Infinity, lastIn: 0, lastGate: 0,
      }));
      this.lookup = new Map(this.nodes.map((n, i) => [n.id, i]));
      if (this.lookup.size !== this.nodes.length) throw new Error('Node IDs must be unique');
      this.edges = this.edgeDefs.map((e, i) => {
        if (!this.lookup.has(e.from) || !this.lookup.has(e.to)) throw new Error('Bad edge endpoint: ' + JSON.stringify(e));
        if (!kinds.includes(e.kind)) throw new Error('Bad edge kind: ' + e.kind);
        return { id: i, weight: 1, delay: 2, track: 0, ...e };
      });
      this.queue = [];
      this.events = [];
      this.spikes = [];
      this.deliveries = [];
    }
    node(id) {
      const i = this.lookup.get(id);
      if (i === undefined) throw new Error('Unknown node: ' + id);
      return this.nodes[i];
    }
    inject(to, kind = 'basal', amp = 1, track = 0, delay = 0, source = 'external') {
      this.node(to);
      if (!kinds.includes(kind)) throw new Error('Unknown arrival kind');
      if (delay < 0) throw new Error('Negative travel delay');
      const p = { from: source, to, kind, amp, track, born: this.t, at: this.t + delay, edgeId: -1 };
      this.queue.push(p);
      return p;
    }
    // Step is synchronous: everything arriving at a tick is integrated before phase crossing and output.
    tick() {
      const cfg = this.cfg, now = this.t;
      const arrivals = new Map(this.nodes.map(n => [n.id, []]));
      const remaining = [];
      for (const p of this.queue) {
        if (p.at <= now) {
          arrivals.get(p.to).push(p);
          this.deliveries.push({ ...p, deliveredAt: now });
        } else remaining.push(p);
      }
      this.queue = remaining;
      const emitted = [];
      for (const n of this.nodes) {
        let basal = 0, zr = 0, zi = 0, entrain = 0, tuft = 0, shunt = 0, veto = 0;
        for (const p of arrivals.get(n.id)) {
          if (p.kind === 'basal') {
            const phi = angles[((p.track % 3) + 3) % 3];
            const gate = Math.exp(cfg.kappa * (Math.cos(n.theta - phi) - 1));
            const current = p.amp * gate;
            basal += current;
            zr += current * Math.cos(n.theta);
            zi += current * Math.sin(n.theta);
            entrain += p.amp * Math.sin(phi - n.theta);
          } else if (p.kind === 'apical') tuft += p.amp;
          else if (p.kind === 'basket') shunt += p.amp;
          else if (p.kind === 'chandelier') veto += p.amp;
        }
        n.apical = n.apical * cfg.apicalDecay + (cfg.enableApical ? tuft : 0);
        n.basket = n.basket * cfg.basketDecay + (cfg.enableBasket ? shunt : 0);
        n.chandelier = n.chandelier * cfg.chandelierDecay + (cfg.enableChandelier ? veto : 0);
        // Basket cells shunt soma state; no negative-carriage arithmetic required.
        const shuntFactor = Math.exp(-cfg.basketStrength * n.basket);
        n.load = (n.load * (1 - cfg.somaLeak) + basal) * shuntFactor;
        n.zr = (n.zr * (1 - cfg.somaLeak) + zr) * shuntFactor;
        n.zi = (n.zi * (1 - cfg.somaLeak) + zi) * shuntFactor;
        n.lastIn = basal;
        n.lastGate = shuntFactor;
        const before = n.theta;
        const advance = TAU / n.period + cfg.kick * entrain;
        n.theta = wrap(n.theta + advance);
        const crossed = Math.floor((before + advance) / TAU) > 0;
        if (!crossed) continue;
        const level = cfg.aisMode === 'vector' ? Math.hypot(n.zr, n.zi) : n.load;
        const gain = 1 + cfg.apicalGain * clamp(n.apical, 0, 2);
        const inhibited = cfg.enableChandelier && n.chandelier >= cfg.chandelierThreshold;
        if (!inhibited && level * gain >= cfg.threshold) {
          const phase = wrap(Math.atan2(n.zi, n.zr));
          const tau = Math.round(cfg.phaseOut * phase / TAU);
          const consumed = cfg.threshold / gain;
          const keep = level > 0 ? clamp(1 - consumed / level, 0, 1) : 0;
          n.load *= keep;
          n.zr *= keep; n.zi *= keep;
          n.fired++;
          n.lastFire = now;
          const spike = { node: n.id, t: now, phase, tau, layer: n.layer, gain };
          emitted.push(spike);
          this.spikes.push(spike);
        }
      }
      // A departing train is a propagating event. Delay includes phase-coded axon timing.
      for (const s of emitted) {
        for (const e of this.edges) {
          if (e.from !== s.node) continue;
          if (!cfg.enableVertical && this.node(e.from).layer !== this.node(e.to).layer) continue;
          if (!cfg.enableLateral && this.node(e.from).layer === this.node(e.to).layer) continue;
          this.queue.push({ from: e.from, to: e.to, kind: e.kind, amp: e.weight,
            track: e.track, born: now, at: now + e.delay + s.tau + 1, edgeId: e.id });
        }
      }
      this.t++;
      if (this.events.length > 1000) this.events.splice(0, this.events.length - 1000);
      if (this.spikes.length > 10000) this.spikes.splice(0, this.spikes.length - 10000);
      return emitted;
    }
    run(ticks) { for (let i = 0; i < ticks; i++) this.tick(); return this; }
    snapshot() {
      return { t: this.t, nodes: this.nodes.map(n => ({ id: n.id, layer: n.layer, col: n.col,
        phase: n.theta, load: n.load, apical: n.apical, basket: n.basket,
        chandelier: n.chandelier, fired: n.fired, period: n.period, lastFire: n.lastFire })),
        pending: this.queue.length, spikes: this.spikes.length };
    }
  }

  function defaultNetwork(config = {}) {
    // Three height levels: bottom-up basal packets, top-down apical packets,
    // horizontal associative packets, two specialized inhibitory projections.
    const clocks = [[32, 31, 37], [35, 33, 29], [41, 43, 39]];
    const nodes = [];
    for (let layer = 0; layer < 3; layer++) for (let col = 0; col < 3; col++) {
      nodes.push({ id: ['D', 'M', 'T'][layer] + col, layer, col,
        period: clocks[layer][col], theta: (col + layer) * TAU / 12 });
    }
    const edges = [];
    for (let layer = 0; layer < 2; layer++) for (let col = 0; col < 3; col++) {
      const a = ['D', 'M'][layer] + col, b = ['M', 'T'][layer] + col;
      edges.push({ from: a, to: b, kind: 'basal', track: col, weight: 2.6, delay: 3 });
      edges.push({ from: b, to: a, kind: 'apical', weight: 0.9, delay: 4 });
    }
    for (const prefix of ['D', 'M', 'T']) {
      edges.push({ from: prefix + '0', to: prefix + '1', kind: 'basal', track: 0, weight: 1.1, delay: 2 });
      edges.push({ from: prefix + '1', to: prefix + '2', kind: 'basal', track: 1, weight: 1.1, delay: 2 });
    }
    edges.push({ from: 'T2', to: 'M1', kind: 'basket', weight: 1.2, delay: 2 });
    edges.push({ from: 'T0', to: 'D1', kind: 'chandelier', weight: 1.3, delay: 2 });
    return new TrainMatrix({ nodes, edges, config });
  }

  function schedulePreset(net, preset) {
    net.reset();
    // Burst pulse widths: delayed packets from a common, testable stimulus script.
    const pulse = (id, at, amp = 2.2, track = 0, type = 'basal') => {
      for (let dt = 0; dt < 4; dt++) net.inject(id, type, amp, track, at + dt, 'stimulus');
    };
    if (preset === 'climb') {
      for (let i = 0; i < 5; i++) { pulse('D0', 8 + i * 66, 2.1, 0); pulse('D1', 24 + i * 66, 2.1, 1); }
    } else if (preset === 'apical') {
      for (let i = 0; i < 5; i++) { pulse('M1', 8 + i * 70, 2.2, 1); pulse('T1', 6 + i * 70, 2.6, 1); }
    } else if (preset === 'basket') {
      for (let i = 0; i < 5; i++) { pulse('T2', 6 + i * 70, 2.6, 2); pulse('M1', 22 + i * 70, 2.2, 1); }
    } else if (preset === 'chandelier') {
      for (let i = 0; i < 5; i++) { pulse('T0', 6 + i * 70, 2.6, 0); pulse('D1', 23 + i * 70, 2.3, 1); }
    } else if (preset === 'all') {
      for (let i = 0; i < 6; i++) for (let c = 0; c < 3; c++) pulse('D'+c, 7 + 13*c + i*62, 2.5, c);
      for (let i = 0; i < 4; i++) pulse('T1', 30 + i*91, 2.6, 1);
    }
    return net;
  }
  return { TrainMatrix, defaultNetwork, schedulePreset, configs, TAU };
});
