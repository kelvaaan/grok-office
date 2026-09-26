#!/usr/bin/env node
// Cycles the roster through realistic statuses so the office looks alive.
//   node scripts/demo.mjs            # 3 loops
//   LOOPS=0 node scripts/demo.mjs    # forever
//   BASE_URL=http://127.0.0.1:3200 SPEED=2 node scripts/demo.mjs
const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3200}`;
const LOOPS = Number(process.env.LOOPS ?? 3);
const SPEED = Number(process.env.SPEED || 1); // >1 = faster

const SCRIPTS = {
  sameer: [
    ['working', 'read', 'Reading server.js to trace the SSE reconnect bug'],
    ['working', 'write', 'Refactoring the pathfinding module'],
    ['working', 'command', 'npm test — 42 passing'],
    ['working', 'write', 'Adding retries to the webhook client'],
    ['waiting', null, 'PR #128 is ready — OK to merge?'],
    ['working', 'command', 'git push origin feat/retries'],
    ['idle', null, 'Coffee break ☕'],
    ['working', 'read', 'Reviewing the flaky e2e test logs'],
  ],
  jeremy: [
    ['working', 'read', 'Pulling IBKR positions & balances'],
    ['working', 'read', 'Scanning pre-market movers: NVDA, TSLA, 0700.HK'],
    ['working', 'write', 'Drafting the weekly portfolio review'],
    ['working', 'command', 'Rebalancing model: tech 38% → 33%'],
    ['waiting', null, 'Trim NVDA by 5%? Need your go-ahead'],
    ['working', 'read', 'Checking HSI & CSI 300 futures'],
    ['idle', null, 'Markets closed — stretching legs'],
    ['working', 'write', 'Updating the risk dashboard'],
  ],
  francesca: [
    ['idle', null, 'Settling in'],
    ['working', 'read', 'Reading the onboarding docs'],
    ['working', 'write', 'Summarizing inbox threads'],
    ['waiting', null, 'Which calendar should I use for invites?'],
    ['working', 'write', 'Drafting meeting notes'],
    ['idle', null, 'Grabbing water'],
    ['working', 'command', 'Exporting the report to Drive'],
    ['offline', null, 'Signed off for now'],
  ],
  jared: [
    ['working', 'command', 'Running the nightly data sync'],
    ['working', 'read', 'Triaging new GitHub issues'],
    ['idle', null, 'Playing a round of arcade'],
    ['working', 'write', 'Writing release notes v1.4'],
    ['waiting', null, 'Need a Slack channel name for alerts'],
    ['working', 'command', 'Deploying staging build'],
    ['idle', null, 'Hanging out in the lounge'],
    ['working', 'read', 'Reading competitor launch posts'],
  ],
};

async function post(body) {
  const res = await fetch(`${BASE}/api/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn(`[demo] ${body.id}: HTTP ${res.status} ${await res.text()}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAgent(id, steps) {
  // stagger start so everyone isn't in sync
  await sleep((Math.random() * 4000) / SPEED);
  for (let loop = 0; LOOPS === 0 || loop < LOOPS; loop++) {
    for (const [status, activity, message] of steps) {
      try { await post({ id, status, activity, message }); }
      catch (err) { console.warn(`[demo] cannot reach ${BASE}: ${err.message}`); }
      const base = status === 'idle' ? 14000 : status === 'waiting' ? 12000 : 9000;
      await sleep((base + Math.random() * 9000) / SPEED);
    }
  }
}

let ids;
try {
  const res = await fetch(`${BASE}/api/agents`);
  ids = (await res.json()).agents.map((a) => a.id);
} catch (err) {
  console.error(`[demo] Grok Office is not reachable at ${BASE} (${err.message}). Start it with: node server.js`);
  process.exit(1);
}
console.log(`[demo] animating ${ids.join(', ')} at ${BASE} (LOOPS=${LOOPS || '∞'}, SPEED=${SPEED})`);
const generic = [
  ['working', 'read', 'Reading the task brief'],
  ['working', 'write', 'Writing a draft'],
  ['idle', null, 'Short break'],
  ['working', 'command', 'Running checks'],
  ['waiting', null, 'Waiting for feedback'],
];
await Promise.all(ids.map((id) => runAgent(id, SCRIPTS[id] || generic)));
console.log('[demo] done');
