/*
 * EO2D - 2D "Edge of Chaos" cellular automata engine.
 * Port of David Eck's 1D CA engine (math.hws.edu/eck/js/edge-of-chaos/CA.html)
 * to a 2D toroidal square lattice, preserving his lambda activation path.
 *
 * Modes:
 *   asym    - raw rule table over the full window code (center sits inside the
 *             window as a positional cell, Eck's original 1D semantics).
 *   d4      - outputs tied across all 8 square symmetries of the window;
 *             class outputs materialized into the raw table at rule-gen time,
 *             so the per-generation loop stays a plain table lookup in every mode.
 *   permute - Jade's outer-permutation: the class key is (center state, multiset
 *             of the NEIGHBORS ONLY). The center is excluded from the bag and
 *             keeps positional identity; which class set applies depends on the
 *             cell state. Dense-ranked bags fit the 2^25 class budget even for
 *             the 25-cell shapes at 8 states.
 *
 * Budget: stored table cap = 2^25 entries (rule + activation path ~ 200MB peak
 * for Moore-2 asymmetric at 2 states).
 *
 * Requires David Bau's seedrandom attached to Math.seedrandom (vendor copy in
 * lib/). All randomness flows through seeded generators; world-type coins that
 * Eck left to bare Math.random are seeded here for full reproducibility.
 */
(function (global) {
  "use strict";

  const TABLE_BUDGET = 1 << 25; // 33,554,432 stored entries

  // ---------------------------------------------------------------- binomials
  function binom(n, k) {
    if (k < 0 || n < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  // ------------------------------------------------- window geometries (2D)
  // Offsets are [dx, dy], center included, fixed order per shape.
  function vnOffsets(rad) {
    const offs = [[0, 0]];
    for (let ring = 1; ring <= rad; ring++) {
      const cells = [];
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++)
          if (Math.abs(dx) + Math.abs(dy) === ring) cells.push([dx, dy]);
      cells.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
      for (const c of cells) offs.push(c);
    }
    return offs;
  }
  function mooreOffsets(rad) {
    const offs = [];
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) offs.push([dx, dy]);
    return offs;
  }

  const SHAPES = {
    vn1: { label: "von Neumann r1 (cross, 5 cells)",  offsets: vnOffsets(1), radius: 1 },
    vn2: { label: "von Neumann r2 (diamond, 13 cells)", offsets: vnOffsets(2), radius: 2 },
    vn3: { label: "von Neumann r3 (diamond, 25 cells)", offsets: vnOffsets(3), radius: 3 },
    m1:  { label: "Moore 3x3 (9 cells)",   offsets: mooreOffsets(1), radius: 1 },
    m2:  { label: "Moore 5x5 (25 cells)",  offsets: mooreOffsets(2), radius: 2 },
  };
  (function () {
    for (const k in SHAPES) {
      const sh = SHAPES[k];
      sh.cells = sh.offsets.length;
      sh.centerIdx = sh.offsets.findIndex(function (o) { return o[0] === 0 && o[1] === 0; });
    }
  })();

  // ------------------------------------------------------- D4 slot mappings
  // Eight transforms of the square. map[i] = slot whose value becomes digit i.
  const TF = [
    function (x, y) { return [x, y]; },
    function (x, y) { return [y, -x]; },
    function (x, y) { return [-x, -y]; },
    function (x, y) { return [-y, x]; },
    function (x, y) { return [-x, y]; },
    function (x, y) { return [x, -y]; },
    function (x, y) { return [y, x]; },
    function (x, y) { return [-y, -x]; },
  ];

  function d4SlotMaps(shape) {
    const sh = SHAPES[shape];
    const index = new Map();
    sh.offsets.forEach(function (o, i) { index.set(o[0] + "," + o[1], i); });
    return TF.map(function (f) {
      const m = new Int32Array(sh.cells);
      for (let i = 0; i < sh.cells; i++) {
        const t = f(sh.offsets[i][0], sh.offsets[i][1]);
        const j = index.get(t[0] + "," + t[1]);
        if (j === undefined) throw new Error("shape not D4-symmetric: " + shape);
        m[i] = j;
      }
      return m;
    });
  }

  // Burnside orbit count: orbits = (1/8) summed over transforms of states^cycles
  // where cycles counts cycles of the position-permutation graph i -> map[i].
  function burnsideOrbitsFromMaps(maps, states, cells) {
    let sum = 0;
    for (let t = 0; t < 8; t++) {
      const m = maps[t], seen = new Uint8Array(cells);
      let cycles = 0;
      for (let i = 0; i < cells; i++) {
        if (seen[i]) continue;
        cycles++;
        let j = i;
        while (!seen[j]) { seen[j] = 1; j = m[j]; }
      }
      sum += Math.pow(states, cycles);
    }
    return Math.round(sum / 8);
  }
  function burnsideOrbits(shape, states) {
    return burnsideOrbitsFromMaps(d4SlotMaps(shape), states, SHAPES[shape].cells);
  }

  // ----------------------------------------------------- permute rank tables
  // Dense rank of a bag vector (counts[1..s-1], total <= nbs) so the class
  // table stays within budget even at 24 neighbors x 8 states. Rank 0 = the
  // all-zero bag. G[vi][used][c] = sum over x in [0,c) of C(used+x+R, R)
  // where R = number of remaining positions after vi.
  function makeRankTables(nbs, states) {
    const s1 = states - 1;
    const G = [];
    for (let vi = 0; vi < s1; vi++) {
      const Rk = s1 - vi - 1; // variables remaining after this position
      const row = [];
      for (let used = 0; used <= nbs; used++) {
        const cell = new Float64Array(nbs + 1);
        cell[0] = 0;
        for (let c = 1; c <= nbs - used; c++) {
          cell[c] = cell[c - 1] + binom((nbs - used - (c - 1)) + Rk, Rk);
        }
        row.push(cell);
      }
      G.push(row);
    }
    return G;
  }
  function bagRank(tables, s1, counts) {
    let rank = 0, used = 0;
    for (let vi = 0; vi < s1; vi++) {
      const c = counts[vi + 1];
      if (c) { rank += tables[vi][used][c]; used += c; }
    }
    return rank;
  }

  // ------------------------------------------------------------- budget law
  function maxStates(shape, mode) {
    const C = SHAPES[shape].cells, nbs = C - 1;
    let s = 32;
    if (mode === "permute") {
      while (s > 1 && s * binom(nbs + s - 1, s - 1) > TABLE_BUDGET) s--;
    } else {
      while (s > 1 && Math.pow(s, C) > TABLE_BUDGET) s--;
    }
    return s;
  }
  function classCount(shape, states, mode) {
    const C = SHAPES[shape].cells, nbs = C - 1;
    if (mode === "permute") return states * binom(nbs + states - 1, states - 1);
    if (mode === "asym") return Math.round(Math.pow(states, C));
    return burnsideOrbits(shape, states);
  }

  // ----------------------------------------------------------------- engine
  function Engine() {
    this.states = 4;
    this.shape = "m1";
    this.mode = "d4";

    this.ruleSeed = 0;
    this.worldSeed = 0;
    this.worldType = 3;

    this.random = Math.random; // replaced by Math.seedrandom(seed) in family/world creation
    this.N = 0;                // stored table size (raw codes for asym/d4, class ids for permute)
    this.classCt = 0;          // total classes incl. the forced-dead one
    this.path = null;          // Uint32: activation order over class ids (length classCt-1)
    this.out = null;           // Uint8: output per class id (rep-indexed for d4)
    this.rule = null;          // Uint8: materialized table the generation loop reads
    this.rulesUsed = 0;        // active path entries
    this.maps = null;          // d4 slot maps (or null)
    this.pw = null;            // states^i per slot
    this.rankT = null;         // permute rank tables (or null)
    this.bagCt = 0;

    this.C = SHAPES.m1.cells;

    this.W = 0; this.H = 0;
    this.r = 1; this.Wp = 0; this.Hp = 0;
    this.grid = null;          // padded working grid
    this.nextGrid = null;
    this.world = null;         // W*H inner view (UI/paint/save)
    this.initialWorld = null;
    this.slotDelta = null;
    this.centerDelta = 0;
    this.counts = null;
    this.gen = 0;
  }

  Engine.prototype.configure = function (states, shape, mode) {
    if (!SHAPES[shape]) throw new Error("unknown shape: " + shape);
    if (["asym", "d4", "permute"].indexOf(mode) < 0) throw new Error("unknown mode: " + mode);
    const cap = maxStates(shape, mode);
    if (states < 2 || states > Math.min(32, cap))
      throw new Error("states " + states + " exceeds cap " + Math.min(32, cap) + " for " + shape + "/" + mode);
    this.states = states;
    this.shape = shape;
    this.mode = mode;
    const sh = SHAPES[shape];
    this.C = sh.cells;
    this.r = sh.radius;
    this.maps = mode === "d4" ? d4SlotMaps(shape) : null;
    this.pw = new Float64Array(this.C);
    for (let i = 0; i < this.C; i++) this.pw[i] = Math.pow(states, i);
    if (mode === "permute") {
      const nbs = this.C - 1;
      this.bagCt = binom(nbs + states - 1, states - 1);
      this.classCt = states * this.bagCt;
      this.rankT = makeRankTables(nbs, states);
      this.counts = new Int32Array(states);
    } else {
      this.rankT = null;
      this.counts = null;
    }
    this.rule = null;
    this.path = null;
    this.out = null;
    this.rulesUsed = 0;
  };

  Engine.prototype.randInt = function (min, max) {
    return min + Math.floor((max - min + 1) * this.random());
  };

  Engine.prototype.remap = function (t, code) {
    const m = this.maps[t], pw = this.pw, s = this.states, C = this.C;
    let dst = 0;
    for (let i = 0; i < C; i++) {
      dst += Math.floor(code / pw[m[i]]) % s * pw[i];
    }
    return dst;
  };

  // -------------------------------------------------------- rule family
  Engine.prototype.newRuleFamily = function (seed) {
    if (!Math.seedrandom) throw new Error("seedrandom.js must be loaded first");
    this.ruleSeed = (seed === undefined || seed === null)
      ? Math.floor(Math.pow(2, 32) * Math.random())
      : seed;
    this.random = new Math.seedrandom(this.ruleSeed);
    const s = this.states, sP1 = s - 1;
    this.rulesUsed = 0;

    if (this.mode === "asym") {
      this.N = Math.pow(s, this.C);
      this.classCt = this.N;
      this.out = new Uint8Array(this.N);
      for (let i = 1; i < this.N; i++) this.out[i] = this.randInt(1, sP1);
      this.path = new Uint32Array(this.N - 1);
      for (let i = 0; i < this.N - 1; i++) this.path[i] = i + 1;
      this.shufflePath();
      this.rule = new Uint8Array(this.N);
    } else if (this.mode === "permute") {
      this.N = this.classCt;
      this.out = new Uint8Array(this.classCt);
      this.out[0] = 0; // (center 0, all-zero bag) stays dead forever
      for (let i = 1; i < this.classCt; i++) this.out[i] = this.randInt(1, sP1);
      this.path = new Uint32Array(this.classCt - 1);
      for (let i = 0; i < this.classCt - 1; i++) this.path[i] = i + 1;
      this.shufflePath();
      this.rule = new Uint8Array(this.classCt);
    } else { // d4
      this.N = Math.pow(s, this.C);
      this.classCt = burnsideOrbitsFromMaps(this.maps, s, this.C);
      this.out = new Uint8Array(this.N); // sparse: entries live at orbit reps
      this.path = new Uint32Array(this.classCt - 1);
      this.rule = new Uint8Array(this.N);
      const maps = this.maps;
      const assigned = new Uint8Array(this.N);
      let rep = 0;
      for (let c = 0; c < this.N; c++) {
        if (assigned[c]) continue;
        // c is the smallest unassigned code, so its orbit is untouched and c is
        // that orbit's minimum (its canonical representative).
        for (let t = 0; t < 8; t++) assigned[this.remap(t, c)] = 1;
        if (c !== 0) {           // orbit {0} = the all-dead window, forced dead
          this.out[c] = this.randInt(1, sP1);
          this.path[rep++] = c;
        }
      }
      if (rep !== this.classCt - 1)
        throw new Error("orbit enumeration " + rep + " disagrees with Burnside " + (this.classCt - 1));
      this.shufflePath();
    }
    this.materializeFull(Math.round(0.33 * this.path.length));
  };

  Engine.prototype.shufflePath = function () {
    const p = this.path;
    for (let i = p.length - 1; i > 0; i--) {
      const j = this.randInt(0, i);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
  };

  Engine.prototype.writeClass = function (rep, v) {
    if (this.mode === "d4") {
      for (let t = 0; t < 8; t++) this.rule[this.remap(t, rep)] = v;
    } else {
      this.rule[rep] = v;
    }
  };

  Engine.prototype.materializeFull = function (k) {
    this.rule.fill(0);
    const p = this.path, o = this.out;
    const kk = Math.min(k, p.length);
    for (let i = 0; i < kk; i++) this.writeClass(p[i], o[p[i]]);
    this.rulesUsed = kk;
  };

  Engine.prototype.setRulesUsed = function (k) {
    const pathLen = this.path.length;
    k = Math.max(0, Math.min(pathLen, Math.round(k)));
    if (k === this.rulesUsed) return;
    const lo = Math.min(k, this.rulesUsed), hi = Math.max(k, this.rulesUsed);
    const on = k > this.rulesUsed;
    for (let i = lo; i < hi; i++) {
      const rep = this.path[i];
      this.writeClass(rep, on ? this.out[rep] : 0);
    }
    this.rulesUsed = k;
  };

  // ------------------------------------------------------------- world grid
  Engine.prototype.setWorldSize = function (W, H) {
    this.W = W;
    this.H = H;
    this.Wp = W + 2 * this.r;
    this.Hp = H + 2 * this.r;
    this.grid = new Uint8Array(this.Wp * this.Hp);
    this.nextGrid = new Uint8Array(this.Wp * this.Hp);
    this.world = new Uint8Array(W * H);
    this.initialWorld = new Uint8Array(W * H);
    const sh = SHAPES[this.shape];
    this.slotDelta = new Int32Array(this.C);
    for (let i = 0; i < this.C; i++)
      this.slotDelta[i] = sh.offsets[i][1] * this.Wp + sh.offsets[i][0];
    const c = sh.offsets[sh.centerIdx];
    this.centerDelta = c[1] * this.Wp + c[0];
    this.gen = 0;
  };

  Engine.prototype.syncWorldToGrid = function () {
    const W = this.W, H = this.H, r = this.r, Wp = this.Wp;
    const grid = this.grid, world = this.world;
    for (let y = 0; y < H; y++) {
      const prow = (y + r) * Wp + r, row = y * W;
      for (let x = 0; x < W; x++) grid[prow + x] = world[row + x];
    }
    this.refreshPads();
  };

  Engine.prototype.gridToWorld = function () {
    const W = this.W, H = this.H, r = this.r, Wp = this.Wp;
    const grid = this.grid, world = this.world;
    for (let y = 0; y < H; y++) {
      const prow = (y + r) * Wp + r, row = y * W;
      for (let x = 0; x < W; x++) world[row + x] = grid[prow + x];
    }
  };

  // Side pass first (inner rows' edge pads), then full-width band rows so the
  // corners pick up freshly wrapped side pads.
  Engine.prototype.refreshPads = function () {
    const r = this.r, W = this.W, H = this.H, Wp = this.Wp, Hp = this.Hp;
    const grid = this.grid;
    for (let y = 0; y < H; y++) {
      const prow = (y + r) * Wp;
      for (let px = 0; px < r; px++) {
        grid[prow + px] = grid[prow + W + px];               // left pad mirrors inner col W-r+px
        grid[prow + W + r + px] = grid[prow + r + px];       // right pad mirrors inner col px
      }
    }
    for (let py = 0; py < r; py++) {
      const sy = (py - r + H) % H;
      const src = (sy + r) * Wp, dst = py * Wp;
      for (let px = 0; px < Wp; px++) grid[dst + px] = grid[src + px];
    }
    for (let py = Hp - r; py < Hp; py++) {
      const sy = (py - r) % H;
      const src = (sy + r) * Wp, dst = py * Wp;
      for (let px = 0; px < Wp; px++) grid[dst + px] = grid[src + px];
    }
  };

  // --------------------------------------------------------------- stepping
  Engine.prototype.stepGeneration = function () {
    const W = this.W, H = this.H, r = this.r, Wp = this.Wp;
    const grid = this.grid, next = this.nextGrid, delta = this.slotDelta;
    const C = this.C, s = this.states, rule = this.rule;

    if (this.mode === "permute") {
      const bagCt = this.bagCt, rankT = this.rankT, s1 = s - 1, cd = this.centerDelta;
      const counts = this.counts;
      for (let y = 0; y < H; y++) {
        const prow = (y + r) * Wp + r;
        for (let x = 0; x < W; x++) {
          const base = prow + x;
          counts.fill(0);
          for (let i = 0; i < C; i++) {
            if (i !== SHAPES[this.shape].centerIdx) counts[grid[base + delta[i]]]++;
          }
          const rank = bagRank(rankT, s1, counts);
          next[base] = rule[grid[base + cd] * bagCt + rank];
        }
      }
    } else {
      for (let y = 0; y < H; y++) {
        const prow = (y + r) * Wp + r;
        for (let x = 0; x < W; x++) {
          const base = prow + x;
          let code = 0;
          // slot i must carry weight s^i (matches pw/remap/orbit machinery).
          // Horner from the last slot gives digit_i * s^i. (2026-11-11 fix:
          // was forward Horner = weight s^(C-1-i); the mismatch is invisible
          // on square windows -- reversal is rot180 there -- but breaks D4
          // on the holed diamond lists.)
          for (let i = C - 1; i >= 0; i--) code = code * s + grid[base + delta[i]];
          next[base] = rule[code];
        }
      }
    }
    const t = this.grid;
    this.grid = next;
    this.nextGrid = t;
    this.refreshPads();
    this.gen++;
    this.gridToWorld();
  };

  Engine.prototype.paintCell = function (x, y, v) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this.world[y * this.W + x] = v;
    this.grid[(y + this.r) * this.Wp + this.r + x] = v;
  };

  // ------------------------------------------------------------ world types
  // Port of Eck's nine initial conditions. Symmetric = mirrored across the
  // vertical axis (his 1D palindrome generalized). Coins are seeded here where
  // his code used bare Math.random (types 3/4), for full reproducibility.
  Engine.prototype.newWorld = function (type, seed) {
    if (!Math.seedrandom) throw new Error("seedrandom.js must be loaded first");
    this.worldSeed = (seed === undefined || seed === null)
      ? Math.floor(Math.pow(2, 32) * Math.random())
      : seed;
    this.worldType = type;
    this.random = new Math.seedrandom(this.worldSeed);
    const w = this.world, W = this.W, H = this.H, s = this.states, sP1 = s - 1;
    const rnd = this.random;
    const e = this;
    w.fill(0);
    switch (type) {
      case 1: // all cells live
        for (let i = 0; i < w.length; i++) w[i] = e.randInt(1, sP1);
        break;
      case 2: // all cells, symmetric across the vertical axis
        for (let y = 0; y < H; y++) {
          const row = y * W;
          for (let x = 0; x < W - 1 - x; x++) {
            const v = e.randInt(1, sP1);
            w[row + x] = v;
            w[row + (W - 1 - x)] = v;
          }
          if (W % 2 === 1) w[row + (W - 1) / 2] = e.randInt(1, sP1);
        }
        break;
      case 3: // all cells, half dead
        for (let i = 0; i < w.length; i++) w[i] = (rnd() < 0.5) ? 0 : e.randInt(1, sP1);
        break;
      case 4: // all cells, 75% dead
        for (let i = 0; i < w.length; i++) w[i] = (rnd() < 0.75) ? 0 : e.randInt(1, sP1);
        break;
      case 5: { // one centered clump
        const bw = Math.min(100, Math.floor(W / 3)), bh = Math.min(100, Math.floor(H / 3));
        const x0 = Math.floor((W - bw) / 2), y0 = Math.floor((H - bh) / 2);
        for (let y = y0; y < y0 + bh; y++)
          for (let x = x0; x < x0 + bw; x++) w[y * W + x] = e.randInt(1, sP1);
        break;
      }
      case 6: { // symmetric clump: mirrored pairs, band centered on the axis
        const bw = Math.min(100, Math.floor(W / 3)), bh = Math.min(100, Math.floor(H / 3));
        const x0 = Math.floor((W - bw) / 2), y0 = Math.floor((H - bh) / 2);
        for (let y = y0; y < y0 + bh; y++) {
          const row = y * W;
          for (let x = x0; x <= W - 1 - x; x++) {
            const v = e.randInt(1, sP1);
            w[row + x] = v;
            w[row + (W - 1 - x)] = v;
          }
        }
        break;
      }
      case 7: { // several clumps in a centered row
        const bw = Math.min(50, Math.floor(W / 5)), bh = Math.min(50, Math.floor(H / 5));
        const ctX = Math.max(1, Math.floor(W / (2 * bw)));
        const startX = Math.floor((W - bw * (2 * ctX - 1)) / 2);
        const y0 = Math.floor((H - bh) / 2);
        for (let j = 0; j < ctX; j++) {
          const x0 = startX + j * 2 * bw;
          for (let y = y0; y < y0 + bh; y++)
            for (let x = x0; x < x0 + bw; x++) w[y * W + x] = e.randInt(1, sP1);
        }
        break;
      }
      case 8: // one dot (state 1) at the center
        w[Math.floor(H / 2) * W + Math.floor(W / 2)] = 1;
        break;
      case 9: // dots on a lattice
        for (let y = 4; y < H - 2; y += 10)
          for (let x = 4; x < W - 2; x += 10) w[y * W + x] = e.randInt(1, sP1);
        break;
      default:
        throw new Error("bad world type: " + type);
    }
    this.initialWorld = new Uint8Array(w);
    this.gen = 0;
    this.syncWorldToGrid();
  };

  Engine.prototype.restart = function () {
    this.world.set(this.initialWorld);
    this.gen = 0;
    this.syncWorldToGrid();
  };

  // ---------------------------------------------------------------- exports
  const EO2D = {
    version: "0.1",
    TABLE_BUDGET: TABLE_BUDGET,
    SHAPES: SHAPES,
    Engine: Engine,
    maxStates: maxStates,
    classCount: classCount,
    burnsideOrbits: burnsideOrbits,
    d4SlotMaps: d4SlotMaps,
    bagRank: bagRank,
    makeRankTables: makeRankTables,
    binom: binom,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = EO2D;
  else global.EO2D = EO2D;
})(typeof window !== "undefined" ? window : globalThis);
