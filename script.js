const $ = id => document.getElementById(id);
const cv = $('geometryCanvas'), ctx = cv.getContext('2d');
const EPS = 1e-9;
let V = [], closed = false, pieces = [], diags = [], mouse = null;

/* ---------- Geometry helpers ---------- */
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const properCross = (a, b, c, d) =>
  cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
const area2 = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p.x * q.y - q.x * p.y; }, 0);
const inTri = (p, a, b, c) => cross(a, b, p) >= -EPS && cross(b, c, p) >= -EPS && cross(c, a, p) >= -EPS;
const isReflex = i => cross(V[(i + V.length - 1) % V.length], V[i], V[(i + 1) % V.length]) < -EPS;

function canAdd(p, closing = false) {
  const n = V.length;
  if (n === 0) return true;
  if (!closing && V.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 8)) return false;
  for (let i = 0; i < n - 1; i++) {
    if (i === n - 2) continue;            // edge adjacent to the last vertex
    if (closing && i === 0) continue;     // edge adjacent to the first vertex
    if (properCross(V[n - 1], p, V[i], V[i + 1])) return false;
  }
  return true;
}

/* ---------- Ear-clipping triangulation (polygon must be CCW) ---------- */
function triangulate() {
  const idx = V.map((_, i) => i), tris = [];
  while (idx.length > 3) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(V[a], V[b], V[c]) <= EPS) continue;
      if (idx.some(k => k !== a && k !== b && k !== c && inTri(V[k], V[a], V[b], V[c]))) continue;
      tris.push([a, b, c]); idx.splice(i, 1); cut = true;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.slice());
  return tris;
}

/* ---------- Hertel–Mehlhorn: remove diagonals while pieces stay convex ---------- */
const hasEdge = (P, a, b) => { const i = P.indexOf(a); return i >= 0 && P[(i + 1) % P.length] === b; };
const rot = (P, s) => { const i = P.indexOf(s); return P.slice(i).concat(P.slice(0, i)); };
const isConvex = P => P.every((_, i) => cross(V[P[i]], V[P[(i + 1) % P.length]], V[P[(i + 2) % P.length]]) >= -EPS);

function hertelMehlhorn(tris) {
  const n = V.length;
  let P = tris.map(t => t.slice()), D = [];
  const seen = new Set();
  tris.forEach(t => t.forEach((a, k) => {
    const b = t[(k + 1) % 3];
    if (Math.abs(a - b) === 1 || Math.abs(a - b) === n - 1) return; // polygon edge
    const key = Math.min(a, b) + '-' + Math.max(a, b);
    if (!seen.has(key)) { seen.add(key); D.push([Math.min(a, b), Math.max(a, b)]); }
  }));
  const kept = [];
  for (const [a, b] of D) {
    const p = P.find(q => hasEdge(q, a, b)), q = P.find(r => hasEdge(r, b, a));
    if (p && q && p !== q) {
      const m = rot(p, b).concat(rot(q, a).slice(1, -1));
      if (isConvex(m)) { P = P.filter(x => x !== p && x !== q); P.push(m); continue; }
    }
    kept.push([a, b]);
  }
  return { pieces: P, diags: kept };
}

/* ---------- UI actions ---------- */
function setStatus(msg, err = false) { $('status').textContent = msg; $('status').classList.toggle('error', err); }

function closePolygon() {
  if (closed) return;
  if (V.length < 3) return setStatus('You need at least 3 vertices.', true);
  if (!canAdd(V[0], true)) return setStatus('The closing edge would cross the polygon.', true);
  closed = true;
  if (area2(V) < 0) V.reverse();          // enforce counter-clockwise order
  setStatus('Polygon closed. Now click "Decompose".');
}

function decompose() {
  if (!closed) closePolygon();
  if (!closed) return;
  const res = hertelMehlhorn(triangulate());
  pieces = res.pieces; diags = res.diags;
  const r = V.filter((_, i) => isReflex(i)).length, lb = Math.ceil(r / 2) + 1;
  setStatus(pieces.length === lb
    ? `${pieces.length} convex piece(s): provably optimal (matches the lower bound).`
    : `${pieces.length} convex pieces found (the optimum is between ${lb} and ${pieces.length}).`);
}

function reset() { V = []; pieces = []; diags = []; closed = false; setStatus('Start by clicking on the canvas.'); }

function load(name) {
  reset();
  const W = 1000, H = 550;
  if (name === 'L') V = [[250,80],[500,80],[500,280],[800,280],[800,470],[250,470]].map(([x, y]) => ({ x, y }));
  if (name === 'star') for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 90 : 230;
    V.push({ x: W / 2 + rad * Math.cos(a), y: H / 2 + 10 + rad * Math.sin(a) });
  }
  if (name === 'comb') V = [[120,450],[120,100],[250,100],[250,330],[380,330],[380,100],[510,100],[510,330],[640,330],[640,100],[770,100],[770,330],[880,330],[880,450]].map(([x, y]) => ({ x, y }));
  if (!V.length) return;
  closed = true; if (area2(V) < 0) V.reverse();
  decompose();
}

/* ---------- Drawing ---------- */
function grid() {
  ctx.strokeStyle = '#eef0f6'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= cv.width; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); }
  for (let y = 0; y <= cv.height; y += 40) { ctx.moveTo(0, y); ctx.lineTo(cv.width, y); }
  ctx.stroke();
}
const path = P => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height); grid();
  if (V.length) {
    path(V);
    if (closed) { ctx.closePath(); ctx.fillStyle = 'rgba(79,70,229,.08)'; ctx.fill(); }
    ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  }
  pieces.forEach((P, k) => {
    path(P.map(i => V[i])); ctx.closePath();
    ctx.fillStyle = `hsla(${(k * 67 + 230) % 360},75%,60%,.38)`; ctx.fill();
  });
  if (closed && pieces.length) { path(V); ctx.closePath(); ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 2.5;
  diags.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(V[a].x, V[a].y); ctx.lineTo(V[b].x, V[b].y); ctx.stroke(); });
  ctx.setLineDash([]);
  if (!closed && V.length && mouse) {
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(79,70,229,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(V.at(-1).x, V.at(-1).y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); ctx.setLineDash([]);
  }
  V.forEach((v, i) => {
    const refl = closed && isReflex(i);
    ctx.beginPath(); ctx.arc(v.x, v.y, i === 0 && !closed ? 8 : 6, 0, 7);
    ctx.fillStyle = refl ? '#ef4444' : (i === 0 && !closed ? '#10b981' : '#1e1b4b'); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  });
  const r = closed ? V.filter((_, i) => isReflex(i)).length : 0;
  $('sN').textContent = V.length; $('sR').textContent = closed ? r : '–';
  $('sP').textContent = pieces.length || '–'; $('sL').textContent = closed ? Math.ceil(r / 2) + 1 : '–';
  if (closed) ctx.fillStyle = '#6b7280', ctx.font = '13px Inter, sans-serif', ctx.fillText('● reflex vertices in red', 14, cv.height - 14);
}

/* ---------- Events ---------- */
const pos = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height }; };

cv.addEventListener('click', e => {
  if (closed) return;
  const p = pos(e);
  if (V.length >= 3 && Math.hypot(p.x - V[0].x, p.y - V[0].y) < 14) closePolygon();
  else if (canAdd(p)) { V.push(p); setStatus(V.length < 3 ? 'Keep adding vertices.' : 'Click the green vertex (or "Close polygon") to finish.'); }
  else setStatus('That edge would cross the polygon or the point is too close to another vertex.', true);
  draw();
});
cv.addEventListener('mousemove', e => { mouse = pos(e); if (!closed && V.length) draw(); });
$('closeBtn').onclick = () => { closePolygon(); draw(); };
$('decomposeBtn').onclick = () => { if (V.length < 3) setStatus('Draw at least 3 vertices first.', true); else decompose(); draw(); };
$('undoBtn').onclick = () => { if (closed) { closed = false; pieces = []; diags = []; } else V.pop(); setStatus('Last step undone.'); draw(); };
$('clearBtn').onclick = () => { reset(); draw(); };
$('presetSelect').onchange = e => { load(e.target.value); e.target.value = ''; draw(); };

/* Scroll reveal */
const io = new IntersectionObserver(es => es.forEach(x => x.isIntersecting && x.target.classList.add('visible')), { threshold: .08 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

draw();

/* ---------- Step-by-step strips (U-shaped example, read left to right) ---------- */
const U = [[0,0],[300,0],[300,200],[200,200],[200,80],[100,80],[100,200],[0,200]];
const ALL = [[0,5,6,7],[1,2,3,4],[0,1,4,5]], TRI = [[0,5],[5,7],[1,4],[4,2],[1,5]];
// The "keil" strip illustrates discarding redundant solutions.
// Formally, narrowest pairs are defined such that their convex region
// in a small neighborhood of the diagonal does not contain the convex region of any other minimum decomposition.
const STEPS = {
  greene: [
    { f: [[0,1,4,5]], c: '1. Grow a convex piece on a base edge' },
    { f: [[0,1,4,5]], p: [[0,5,6,7],[1,2,3,4]], c: '2. Remove it: two subproblems appear' },
    { f: [[0,1,4,5],[0,5,6,7]], p: [[1,2,3,4]], c: '3. First one is convex: 1 piece' },
    { f: [[0,1,4,5],[0,5,6,7],[1,2,3,4]], c: '4. Second too: 3 pieces' }],
  keil: [
    { d: [[5,0],[5,1],[5,7]], r: [4,5], c: '1. Candidate diagonals at reflex vertex' },
    { d: [[5,0],[5,7]], x: [[5,1]], r: [4,5], c: '2. Narrowest pairs kept, the rest discarded' },
    { f: [[0,5,6,7]], r: [4,5], c: '3. Cut off the left leg: solved' },
    { f: ALL, r: [4,5], c: '4. Same on the right: 3 pieces' }],
  ks: [
    { d: TRI, c: '1. Fix a canonical triangulation' },
    { d: TRI, r: [4,5], c: '2. Mark reflex vertices (red)' },
    { f: ALL, x: [[5,7],[4,2],[1,5]], d: [[0,5],[1,4]], c: '3. Merge triangles while convex' },
    { f: ALL, s: [[0,5],[1,4]], c: '4. Two diagonals kept: 3 pieces' }]
};
const svgPoly = (idx, a) => `<polygon points="${idx.map(i => U[i].join(',')).join(' ')}" ${a}/>`;
const svgLine = (a, b, s) => `<line x1="${U[a][0]}" y1="${U[a][1]}" x2="${U[b][0]}" y2="${U[b][1]}" ${s}/>`;
document.querySelectorAll('.strip').forEach(el => {
  el.innerHTML = STEPS[el.dataset.strip].map(s => {
    let g = (s.f || []).map((p, k) => svgPoly(p, `fill="hsla(${230 + k * 70},75%,60%,.4)"`)).join('');
    g += (s.p || []).map(p => svgPoly(p, 'fill="none" stroke="#ec4899" stroke-width="2" stroke-dasharray="5,4"')).join('');
    g += svgPoly([0,1,2,3,4,5,6,7], 'fill="none" stroke="#1e1b4b" stroke-width="4" stroke-linejoin="round"');
    g += (s.x || []).map(([a, b]) => svgLine(a, b, 'stroke="#9ca3af" stroke-width="3" stroke-dasharray="5,5"')).join('');
    g += (s.d || []).map(([a, b]) => svgLine(a, b, 'stroke="#ec4899" stroke-width="3" stroke-dasharray="7,5"')).join('');
    g += (s.s || []).map(([a, b]) => svgLine(a, b, 'stroke="#ec4899" stroke-width="4"')).join('');
    g += (s.r || []).map(i => `<circle cx="${U[i][0]}" cy="${U[i][1]}" r="8" fill="#ef4444"/>`).join('');
    return `<figure><svg viewBox="-12 -12 324 224">${g}</svg><figcaption>${s.c}</figcaption></figure>`;
  }).join('');
});