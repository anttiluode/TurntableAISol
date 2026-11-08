# Turntable AISol — the vertical train yards

**[Open the live single-file browser lab](https://anttiluode.github.io/TurntableAISol/)** (once Pages is enabled for `main` / root). No install, libraries, WebGL, server or GPU required. Download `index.html` **and** `yard_matrix.js` into the same folder for offline use. The engine also runs in Node.

> Antti's thought experiment, 8 November 2026: trains should move not only around the turning platform but **up and down through layers**. An **apical tuft track** receives cars from above. **Basket** trains control the soma; **chandelier** trains control the axon initial segment. Neurons are an inspiration, not a claim that this simulates cellular physiology. Choo choo.

This is a **separate experiment** from [TurntableNeuron v3](https://github.com/anttiluode/TurntableNeuron). It preserves the idea of rotating phase gates and phase-delayed departures, but defines an explicit **nine-yard, three-layer directed graph** with two-way vertical routes, local clocks, and three different contextual/inhibitory mechanisms. There is no imported neural-network framework and **no learning** in this version.

## Live lab

Open `index.html`. Choose **Climb**, **Apical**, **Basket**, **Chandelier**, or **All nine yards**. Click a yard to inject a basal train; Shift-click to inject apical input. Toggle individual controls without restarting to perform interventions. Adjust the gate selectivity `κ` and departure phase delay. Click a node to inspect its load, phase, apical gain, basket shunt and chandelier veto. The dots traveling on rails are actual scheduled packets from the same code that runs the tests. You can pause, single-step or restart.

The three levels are **D** (dendritic layer), **M** (middle), and **T** (upper). Their independent clock periods in ticks are:

| Layer | Left | Middle | Right |
|---|---:|---:|---:|
| Top | 41 | 43 | 39 |
| Middle | 35 | 33 | 29 |
| Bottom | 32 | 31 | 37 |

**Up:** D → M → T uses excitatory basal tracks. **Down:** T → M → D uses an apical modulatory path. **Across:** within-layer routes are basal. **Specialized projections:** T2 → M1 basket; T0 → D1 chandelier. The connection-matrix display shows all directed routes.

## Local mathematics

Each yard has a soma scalar `L`, a vector `(z_x,z_y)`, its own clock `θ`, apical level `a`, basket level `b` and chandelier level `c`. Every external or inter-yard train is a discrete packet with `from`, `to`, `type`, `track`, `weight`, departure tick and arrival tick.

For basal packet current `I_i(t)` entering input track `i`, capture uses a rotating angular gate:

```
g_i = exp[ κ (cos(θ - φ_i) - 1) ]
B   = Σ_i g_i I_i
L'  = ((1 - somaLeak) L + B) exp(-basketStrength · b)
z'  = ((1 - somaLeak) z + Σ_i g_i I_i exp(i θ)) exp(-basketStrength · b)
θ'  = θ + 2π / period + kick · Σ_i I_i sin(φ_i - θ)
```

`b` is a decaying **basket shunt**: it suppresses soma charge continuously. The decaying **apical tuft** variable `a` does *not* add current directly to `L`; instead it changes how close an existing basal current is to firing: `effectiveLevel = level × (1 + apicalGain × clamp(a,0,2))`. The decaying **chandelier** variable `c` vetoes a firing event at the exit when above a threshold, without directly clearing the soma. The AIS checks threshold only when the local turntable crosses its exit angle. A successful departure removes the consumed part of `L,z` and creates a train on each outgoing edge, with an extra delay set by `arg(z)`. The route (`edge`) determines whether the packet becomes basal, apical, basket or chandelier when it arrives.

This is a nonlinear hybrid event-driven recurrent system. For a fixed schedule and regime, its transport/capture pieces can be represented by sparse matrices. **It is not equivalent to a single static dense AI matrix**: its event thresholds, shunt, veto, mutable local phase and input-dependent packet timing make it state-dependent. The angle-dot-product gate is *attention-like* but has no softmax. Different periods are reminiscent of multi-frequency rotary coordinates, not an implementation of transformer RoPE.

### Why multiple clocks?

With one period of 32 ticks, observations at `t=0` and `t=32` alias. The combined phase pair `(t mod 32, t mod 31)` has 992 distinct states before repeating. Add 37 and the combined exact integer-period pattern has 36,704 ticks. That is a representational possibility, **not** proof that a downstream yard can reliably decode all those states under noise.

## Measured controls (reproduce with Node)

Run:

```bash
node --test tests/yard_matrix.test.js
node experiments/bench.js
```

The second command writes `results.json`. The lab and these commands run the *same* `yard_matrix.js`, with no stochastic seed or dependency.

**Controlled single-yard interventions**, 30 independent trials for the apical case:

| Input at exit crossing | Spikes | Soma remaining |
|---|---:|---:|
| Basal 0.7 only | 0/30 | 0.7000 |
| Basal 0.7 + apical 1 | 30/30 | 0.1737 |
| Apical alone | 0 | 0 |

**Different inhibition mechanisms**, each with identical basal input of 1.5:

| Condition | Immediate spike | Load after step |
|---|---:|---:|
| No inhibitor | 1 | 0.5000 |
| Basket current = 1 | 0 | 0.3699 |
| Chandelier current = 1 | 0 | 1.5000 |

Basket and chandelier both suppress the event, but **for different computational reasons**. One reduces the accumulated signal; the other denies the exit. In a separate test, the chandelier can release the retained charge at the next exit after the block decays.

**Full three-layer network (420 ticks):**

| Preset | Total spikes | Delivered upward | Delivered downward |
|---|---:|---:|---:|
| Climb | 50 | 43 | 26 |
| Apical | 22 | 9 | 26 |
| Basket | 12 | 2 | 22 |
| Chandelier | 22 | 10 | 24 |
| All nine yards | 72 | 56 | 42 |
| All nine yards, no vertical wiring | 31 | 0 | 0 |

The **Climb** experiment reaches upper yards (T1: 4, T2: 3 departures). In the **Basket** preset the target M1 fires once with the shunt, versus seven times in the same scenario when basket shunting is disabled. In the **Chandelier** preset, D1 fires six times with the veto, versus nine with that veto disabled. Those are system-level *interventions*, not statements about anatomical basket or chandelier neurons.

## Limitations and next gates

1. **Transmission is engineered.** The interlayer topology, weights, arrival delays and inhibitory operations are chosen by hand. No autonomous discovery of a useful routing code or behavior is shown.
2. **No biological claims.** Apical, basket, and chandelier are functional abstractions inspired by cortical circuit organization, not realistic compartment biophysics. There is no actual dendritic cable differential equation in this version.
3. **No noise robustness measured.** The clean multi-clock representation could be fragile to drift or jitter. The immediately useful next benchmark is *controlled jitter and adaptive entrainment* compared against a frozen-clock baseline.
4. **No endogenous goal.** This experiment is separate from the Friday mirror-memory / local-repair idea; it does not hold an internal target or repair lesions.
5. **Matrix question remains quantitative.** Compare this network against a matched-parameter recurrent matrix/state-space baseline on an actual task (classification, routing, or sequence memory). Count parameters, operations, latency and performance. The pretty network picture alone is not evidence of AI superiority.

## Files

- `yard_matrix.js`: dependency-free UMD core, usable by browser or Node.
- `index.html`: interactive network, 9×9 directed connection matrix and controls.
- `tests/yard_matrix.test.js`: deterministic intervention/regression tests.
- `experiments/bench.js`: reproducible comparison scenarios.
- `results.json`: recorded machine-readable outputs.

License: MIT. Designed as an educational and experimental computational model.
