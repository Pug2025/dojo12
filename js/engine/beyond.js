/* Dojo 12 engine — the Beyond lane (PLAN §6.9). Headless.
   Above the grid there is always a next thing. Each topic has its own belt,
   its own scouts and its own walkthrough. No visible ring here: these take
   thinking, and a clock on thinking is the wrong instrument. Speed still counts,
   quietly, after the fact. */
"use strict";
D.beyond = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  function id(topic, key) { return 'bey:' + topic + ':' + key; }

  /* Each topic lists its own items. Everything is generated, nothing is authored
     per child, and the ids are stable so a save keeps its history. */
  const TOPICS = [
    {
      id: 'sq', input: 'number',
      gen() {
        const out = [];
        for (let n = 13; n <= 20; n++) out.push({ key: 'sq' + n, ans: n * n, a: n, kind: 'square' });
        for (let n = 2; n <= 10; n++) out.push({ key: 'cb' + n, ans: n * n * n, a: n, kind: 'cube' });
        return out;
      },
    },
    {
      id: 'easy2d', input: 'number',
      gen() {
        const out = [];
        for (const m of [15, 20, 25, 50]) for (let n = 2; n <= 12; n++) {
          out.push({ key: m + 'x' + n, ans: m * n, a: m, b: n, kind: 'mul' });
        }
        return out;
      },
    },
    {
      id: 'mul2x1', input: 'number',
      gen() {
        const out = [];
        for (let a = 12; a <= 39; a++) for (let b = 3; b <= 9; b++) {
          if (a % 10 === 0) continue;
          out.push({ key: a + 'x' + b, ans: a * b, a: a, b: b, kind: 'mul' });
        }
        return out;
      },
    },
    {
      id: 'divrem', input: 'remainder',
      gen() {
        const out = [];
        for (let a = 13; a <= 79; a++) for (let b = 3; b <= 9; b++) {
          if (a % b === 0) continue;
          out.push({ key: a + '/' + b, ans: Math.floor(a / b), ans2: a % b, a: a, b: b, kind: 'divrem' });
        }
        return out;
      },
    },
    {
      id: 'divis', input: 'yesno',
      gen() {
        const out = [];
        const numbers = [24, 36, 45, 52, 63, 72, 81, 90, 96, 105, 114, 128, 135, 144, 156, 168, 189, 200, 216, 243];
        for (const n of numbers) for (const d of [2, 3, 4, 5, 6, 8, 9, 10]) {
          out.push({ key: n + 'by' + d, ans: n % d === 0 ? 1 : 0, a: n, b: d, kind: 'divis' });
        }
        return out;
      },
    },
    {
      id: 'factors', input: 'number',
      gen() {
        const out = [];
        const pairs = [[12, 18], [16, 24], [15, 20], [21, 28], [24, 36], [18, 30], [14, 35],
                       [27, 45], [20, 50], [16, 40], [22, 33], [30, 42]];
        for (const [a, b] of pairs) {
          out.push({ key: 'gcf' + a + ',' + b, ans: gcd(a, b), a: a, b: b, kind: 'gcf' });
          const l = a * b / gcd(a, b);
          if (l <= 60) out.push({ key: 'lcm' + a + ',' + b, ans: l, a: a, b: b, kind: 'lcm' });
        }
        for (const n of [23, 27, 29, 33, 37, 39, 41, 49, 51, 53, 57, 59]) {
          out.push({ key: 'pr' + n, ans: isPrime(n) ? 1 : 0, a: n, kind: 'prime', input: 'yesno' });
        }
        for (const [n, m] of [[17, 5], [23, 4], [31, 6], [44, 7], [52, 8], [67, 9], [75, 10], [86, 12]]) {
          out.push({ key: 'nx' + n + ',' + m, ans: Math.ceil(n / m) * m, a: n, b: m, kind: 'next' });
        }
        return out;
      },
    },
    {
      id: 'frac', input: 'number',
      gen() {
        const out = [];
        const fracs = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [3, 4], [2, 5], [3, 5], [5, 6], [1, 6]];
        for (const [n, d] of fracs) for (const total of [12, 20, 24, 30, 36, 40, 48, 60]) {
          if (total % d) continue;
          out.push({ key: n + '_' + d + 'of' + total, ans: total / d * n, a: n, b: d, c: total, kind: 'frac' });
        }
        return out;
      },
    },
    {
      id: 'pct', input: 'number',
      gen() {
        const out = [];
        for (const p of [5, 10, 15, 20, 25, 50]) for (const total of [20, 40, 60, 80, 120, 160, 200, 240]) {
          const v = total * p / 100;
          if (Math.round(v * 10) !== v * 10) continue;
          out.push({ key: p + 'of' + total, ans: v, a: p, b: total, kind: 'pct' });
        }
        return out;
      },
    },
    {
      id: 'dec10', input: 'decimal',
      gen() {
        const out = [];
        const bases = [0.3, 0.45, 0.8, 1.2, 2.5, 3.07, 4.8, 6, 12, 37, 250];
        for (const a of bases) for (const m of [10, 100, 1000]) {
          out.push({ key: a + 'x' + m, ans: r6(a * m), a: a, b: m, form: 'x', kind: 'dec' });
          const q = r6(a / m);
          // Grade 6 stops at thousandths; ten-thousandths is the furthest this goes.
          if (decimals(q) <= 4) out.push({ key: a + 'd' + m, ans: q, a: a, b: m, form: 'd', kind: 'dec' });
        }
        return out;
      },
    },
    {
      id: 'mul2x2', input: 'number',
      gen() {
        const out = [];
        for (const a of [12, 13, 14, 15, 16, 17, 18, 19, 21, 23, 24, 25]) {
          for (const b of [11, 12, 13, 14, 15, 21, 22, 25]) {
            out.push({ key: a + 'x' + b, ans: a * b, a: a, b: b, kind: 'mul' });
          }
        }
        return out;
      },
    },
    {
      id: 'ops', input: 'number',
      gen() {
        const out = [];
        const add = (form, a, b, c, ans) =>
          out.push({ key: form + '_' + a + '_' + b + '_' + c, ans: ans, a: a, b: b, c: c, form: form, kind: 'ops' });
        for (const [a, b, c] of [[3, 4, 5], [2, 6, 3], [5, 2, 4], [8, 3, 2], [4, 5, 6], [7, 2, 3], [6, 4, 2], [9, 3, 4]]) {
          add(1, a, b, c, a + b * c);                 // a + b x c
          add(2, a, b, c, (a + b) * c);               // (a + b) x c
          add(4, a, b, c, a * b - c);                 // a x b - c
        }
        for (const [a, b, c] of [[20, 12, 4], [30, 18, 6], [25, 16, 8], [40, 21, 7], [15, 9, 3], [50, 36, 9], [28, 20, 5], [45, 24, 6]]) {
          add(3, a, b, c, a - b / c);                 // a - b / c
        }
        for (const [a, b, c] of [[18, 2, 4], [24, 5, 1], [36, 3, 6], [42, 4, 3], [56, 5, 3], [30, 2, 3], [48, 6, 2], [60, 7, 5]]) {
          if (a % (b + c) === 0) add(5, a, b, c, a / (b + c));   // a / (b + c)
        }
        return out;
      },
    },
  ];

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  // Decimal arithmetic without the float dust: 0.3 x 10 is 3, not 3.0000000000000004.
  function r6(x) { return Number(x.toFixed(6)); }
  function decimals(x) { const t = String(x), i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; }
  function isPrime(n) {
    if (n < 2) return false;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return true;
  }

  const BY_ID = {};
  let built = false;
  function build() {
    if (built) return;
    built = true;
    for (const topic of TOPICS) {
      BY_ID[topic.id] = topic;
      topic.facts = [];
      for (const item of topic.gen()) {
        const factId = id(topic.id, item.key);
        const fact = {
          id: factId, op: 'bey', lane: 'beyond', topic: topic.id, kind: item.kind,
          a: item.a, b: item.b, c: item.c, ans: item.ans, ans2: item.ans2, form: item.form,
          input: item.input || topic.input,
        };
        D.facts.register(fact);
        topic.facts.push(factId);
      }
    }
  }

  function topics() { build(); return TOPICS; }
  function topic(tid) { build(); return BY_ID[tid]; }
  function topicKey(tid) { return 'bey:' + tid; }
  function topicFacts(tid) { build(); return (BY_ID[tid] || { facts: [] }).facts.slice(); }

  /* A topic can generate hundreds of items, which is right for practice and
     wrong for a belt. The belt set is twenty-four of them, evenly spaced through
     the topic, so the ladder and the test have a target a child can finish. The
     rest of the pool is still served. */
  function beltSet(tid) {
    build();
    const all = topicFacts(tid);
    if (all.length <= cfg.TEST_CARDS) return all;
    const out = [];
    const step = all.length / cfg.TEST_CARDS;
    for (let i = 0; i < cfg.TEST_CARDS; i++) out.push(all[Math.floor(i * step)]);
    return out;
  }

  /* Topics open in order. The scout draws from the first one not yet open. */
  function nextTopic() {
    build();
    for (const t of TOPICS) {
      const st = D.state.tables[topicKey(t.id)];
      if (!st || st.status === 'new') return t.id;
    }
    return null;
  }
  function openTopic(tid) {
    const key = topicKey(tid);
    const st = D.scheduler.tableState(key);
    if (st.status === 'new') st.status = 'focus';
    return st;
  }
  function openTopics() {
    build();
    return TOPICS.filter(t => {
      const st = D.state.tables[topicKey(t.id)];
      return st && st.status !== 'new';
    }).map(t => t.id);
  }

  function scoutPool() {
    const tid = nextTopic();
    if (!tid) return [];
    return topicFacts(tid);
  }

  /* The lane's share of a run, weighted toward what is not yet fast. */
  function pick(n, used) {
    build();
    const pool = [];
    for (const tid of openTopics()) {
      for (const fid of topicFacts(tid)) {
        if (used.indexOf(fid) >= 0) continue;
        if (M().isFast(fid)) continue;
        pool.push(fid);
      }
    }
    if (!pool.length) {
      for (const tid of openTopics()) for (const fid of topicFacts(tid)) if (used.indexOf(fid) < 0) pool.push(fid);
    }
    return D.u.take(pool, n, () => 1);
  }

  /* Beyond scouting turns into an open lane at the purple belt (rework 2026-09-10). */
  function ensure() {
    build();
    const lane = D.state.lanes.beyond;
    if (lane.open && !openTopics().length) openTopic(TOPICS[0].id);
    if (lane.open) {
      const focus = openTopics();
      // A topic at eighty per cent fast opens the next one.
      for (const tid of focus) {
        const st = M().statsFor(topicFacts(tid));
        if (st.fastPct >= cfg.FOCUS_PROMOTE_PCT) {
          D.scheduler.tableState(topicKey(tid)).status = 'open';
          const next = nextTopic();
          if (next) openTopic(next);
        }
      }
    }
  }

  /* The walkthrough for a Beyond fact: the same shape as everywhere else, steps
     the child types, never the answer first. */
  function script(factId) {
    const f = D.facts.get(factId);
    if (!f) return null;
    const c = D.copy.step, L = D.copy.label;
    const mk = (kind, prompt, label, answer) => ({ kind: kind, prompt: prompt, label: label, answer: answer, simpler: null });
    switch (f.kind) {
      case 'square': return { famId: 'bey.sq', steps: [
        mk('mul', c.mul(f.a, 10), L.mul(f.a, 10), f.a * 10),
        mk('mul', c.mul(f.a, f.a - 10), L.mul(f.a, f.a - 10), f.a * (f.a - 10)),
        mk('add', c.add(f.a * 10, f.a * (f.a - 10)), L.add(f.a * 10, f.a * (f.a - 10)), f.ans)] };
      case 'cube': return { famId: 'bey.cube', steps: [
        mk('mul', c.mul(f.a, f.a), L.mul(f.a, f.a), f.a * f.a),
        mk('mul', c.mul(f.a * f.a, f.a), L.mul(f.a * f.a, f.a), f.ans)] };
      case 'mul': {
        const tens = Math.floor(f.a / 10) * 10, ones = f.a % 10;
        if (!ones) return { famId: 'bey.mul', steps: [
          mk('mul', c.mul(f.a / 10, f.b), L.mul(f.a / 10, f.b), (f.a / 10) * f.b),
          mk('ten', c.zeroEnd((f.a / 10) * f.b), L.mul((f.a / 10) * f.b, 10), f.ans)] };
        return { famId: 'bey.mul', steps: [
          mk('mul', c.mul(tens, f.b), L.mul(tens, f.b), tens * f.b),
          mk('mul', c.mul(ones, f.b), L.mul(ones, f.b), ones * f.b),
          mk('add', c.add(tens * f.b, ones * f.b), L.add(tens * f.b, ones * f.b), f.ans)] };
      }
      case 'divrem': return { famId: 'bey.divrem', steps: [
        mk('whatTimes', c.whatTimesUnder(f.b, f.a), L.mul(f.b, f.ans), f.ans),
        mk('mul', c.mul(f.b, f.ans), L.mul(f.b, f.ans), f.b * f.ans),
        mk('sub', c.sub(f.a, f.b * f.ans), L.sub(f.a, f.b * f.ans), f.ans2)] };
      case 'divis': {
        // Count the whole ones out, put them back, and see what is left over.
        // Nothing left over is what "multiple" means.
        const q = Math.floor(f.a / f.b);
        return { famId: 'bey.divis', steps: [
          mk('whatTimes', c.whatTimesUnder(f.b, f.a), L.mul(f.b, q), q),
          mk('mul', c.mul(f.b, q), L.mul(f.b, q), f.b * q),
          mk('sub', c.sub(f.a, f.b * q), L.sub(f.a, f.b * q), f.a - f.b * q)] };
      }
      case 'gcf': return { famId: 'bey.gcf', steps: [
        mk('mul', c.biggestInto(f.a, f.b), L.mul(gcd(f.a, f.b), 1), f.ans)] };
      case 'lcm': return { famId: 'bey.lcm', steps: [
        mk('mul', c.smallestBoth(f.a, f.b), L.mul(f.ans, 1), f.ans)] };
      case 'prime': return { famId: 'bey.prime', steps: [] };
      case 'next': return { famId: 'bey.next', steps: [
        mk('mul', c.howManyOver(f.b, f.a), L.mul(f.b, Math.ceil(f.a / f.b)), Math.ceil(f.a / f.b)),
        mk('mul', c.mul(f.b, Math.ceil(f.a / f.b)), L.mul(f.b, Math.ceil(f.a / f.b)), f.ans)] };
      case 'frac': return { famId: 'bey.frac', steps: [
        mk('divSo', c.divSo(f.c, f.b), L.div(f.c, f.b), f.c / f.b),
        mk('mul', c.mul(f.c / f.b, f.a), L.mul(f.c / f.b, f.a), f.ans)] };
      case 'pct': {
        const ten = f.b / 10;
        if (f.a === 10) return { famId: 'bey.pct', steps: [mk('divSo', c.divSo(f.b, 10), L.div(f.b, 10), f.ans)] };
        if (f.a === 50) return { famId: 'bey.pct', steps: [mk('half', c.half(f.b), L.half(f.b), f.ans)] };
        if (f.a === 25) return { famId: 'bey.pct', steps: [
          mk('half', c.half(f.b), L.half(f.b), f.b / 2),
          mk('half', c.half(f.b / 2), L.half(f.b / 2), f.ans)] };
        if (f.a === 5) return { famId: 'bey.pct', steps: [
          mk('divSo', c.divSo(f.b, 10), L.div(f.b, 10), ten),
          mk('half', c.half(ten), L.half(ten), f.ans)] };
        if (f.a === 20) return { famId: 'bey.pct', steps: [
          mk('divSo', c.divSo(f.b, 10), L.div(f.b, 10), ten),
          mk('double', c.double(ten), L.add(ten, ten), f.ans)] };
        return { famId: 'bey.pct', steps: [
          mk('divSo', c.divSo(f.b, 10), L.div(f.b, 10), ten),
          mk('half', c.half(ten), L.half(ten), ten / 2),
          mk('add', c.add(ten, ten / 2), L.add(ten, ten / 2), f.ans)] };
      }
      case 'dec': {
        // One place at a time. A single hop is the card itself, so it has no walkthrough.
        const hops = Math.round(Math.log10(f.b));
        if (hops < 2) return { famId: 'bey.dec', steps: [] };
        const steps = [];
        let v = f.a;
        for (let i = 0; i < hops; i++) {
          const nv = f.form === 'x' ? r6(v * 10) : r6(v / 10);
          steps.push(f.form === 'x' ? mk('mul', c.mul(v, 10), L.mul(v, 10), nv)
                                    : mk('div', c.div(v, 10), L.div(v, 10), nv));
          v = nv;
        }
        return { famId: 'bey.dec', steps: steps };
      }
      case 'ops': {
        // The inside first, then the outside: exactly the order the rule says.
        const A = f.a, B = f.b, C = f.c;
        if (f.form === 1) return { famId: 'bey.ops', steps: [
          mk('mul', c.mul(B, C), L.mul(B, C), B * C), mk('add', c.add(A, B * C), L.add(A, B * C), f.ans)] };
        if (f.form === 2) return { famId: 'bey.ops', steps: [
          mk('add', c.add(A, B), L.add(A, B), A + B), mk('mul', c.mul(A + B, C), L.mul(A + B, C), f.ans)] };
        if (f.form === 3) return { famId: 'bey.ops', steps: [
          mk('div', c.div(B, C), L.div(B, C), B / C), mk('sub', c.sub(A, B / C), L.sub(A, B / C), f.ans)] };
        if (f.form === 4) return { famId: 'bey.ops', steps: [
          mk('mul', c.mul(A, B), L.mul(A, B), A * B), mk('sub', c.sub(A * B, C), L.sub(A * B, C), f.ans)] };
        return { famId: 'bey.ops', steps: [
          mk('add', c.add(B, C), L.add(B, C), B + C), mk('div', c.div(A, B + C), L.div(A, B + C), f.ans)] };
      }
      default: return { famId: 'bey', steps: [] };
    }
  }

  return { topics, topic, topicKey, topicFacts, beltSet, nextTopic, openTopic, openTopics,
           scoutPool, pick, ensure, script, build, gcd, isPrime };
})();
