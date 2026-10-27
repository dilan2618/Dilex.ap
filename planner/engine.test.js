/* Pruebas del motor de reglas de la Agenda. Ejecuta: node planner/engine.test.js */
const assert = require('assert');
const PLANNER_ENGINE = require('./engine.js');
const PE = PLANNER_ENGINE();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { console.error('  FALLA  ' + name + '\n        ' + err.message); process.exitCode = 1; }
}

const DAY = '2026-10-27';
const base = (over = {}) => Object.assign({
  day: DAY, today: DAY, nowMin: null,
  profile: { start: '15:00', end: '23:00', margin: 10 },
  events: [], tasks: [], personalRules: [],
}, over);
const task = (id, text, durMin, extra = {}) => Object.assign({ id, text, durMin, due: DAY, done: false, createdAt: '2026-10-01T00:00:00Z' }, extra);

// Escenario 1: el ejemplo del documento (examen, entreno, agua, amigos)
test('Escenario del examen: todo cabe y el agua va después de la salida', () => {
  const a = PE.analyzeDay(base({
    events: [{ id: 'amigos', title: 'Salir con amigos', area: 'social', date: DAY, start: '20:00', end: '22:00', fixed: true, confirmed: true }],
    tasks: [
      task('estudio', 'Estudiar para el examen', 180, { area: 'estudio', costo: 'critico', importancia: 3, durSrc: 'estimada' }),
      task('entreno', 'Entrenar', 75, { area: 'ejercicio', costo: 'bajo' }),
      task('agua', 'Comprar agua', 20, { area: 'hogar', costo: 'bajo' }),
    ],
  }));
  assert.strictEqual(a.fits, true);
  const at = Object.fromEntries(a.schedule.map(s => [s.id, s.start + '-' + s.end]));
  assert.strictEqual(at.estudio, '15:00-18:00', 'el estudio va primero (costo crítico, R6)');
  assert.strictEqual(at.entreno, '18:10-19:25');
  assert.strictEqual(at.agua, '22:10-22:30', 'la compra pasa a después de los amigos');
  assert.strictEqual(at.amigos, '20:00-22:00', 'el compromiso fijo no se mueve (R3)');
  assert.ok(a.uncertain.some(u => /estimación tuya/.test(u.msg)), 'declara la estimación del estudio');
});

// Escenario 2: no cabe, el motor propone aplazar lo de menor costo
test('Sobrecarga: propone aplazar lo de menor costo y nunca lo social', () => {
  const a = PE.analyzeDay(base({
    profile: { start: '15:00', end: '20:00', margin: 10 },
    events: [{ id: 'amigos', title: 'Salir con amigos', area: 'social', date: DAY, start: '18:00', end: '20:00', fixed: true }],
    tasks: [
      task('estudio', 'Estudiar', 120, { costo: 'critico' }),
      task('agua', 'Comprar agua', 45, { costo: 'bajo' }),
    ],
  }));
  assert.strictEqual(a.fits, false);
  assert.strictEqual(a.conflicts[0].rule[0], 'R1');
  const p = a.proposals.find(x => x.primary);
  assert.ok(p, 'hay propuesta principal');
  assert.strictEqual(p.kind, 'postpone');
  assert.deepStrictEqual(p.changes.filter(c => c.type === 'moveTask').map(c => c.id), ['agua']);
  assert.ok(!p.changes.some(c => c.id === 'amigos'), 'no toca el plan social (R7)');
  assert.ok(p.rules.includes('R10'));
});

// Escenario 3: dos compromisos fijos se cruzan
test('Solape de dos fijos: avisa y no propone moverlos', () => {
  const a = PE.analyzeDay(base({
    events: [
      { id: 'a', title: 'Clase', date: DAY, start: '16:00', end: '18:00', fixed: true },
      { id: 'b', title: 'Turno', date: DAY, start: '17:00', end: '19:00', fixed: true },
    ],
  }));
  const c = a.conflicts.find(x => x.kind === 'overlap-fixed');
  assert.ok(c, 'detecta el solape');
  assert.deepStrictEqual(c.rule, ['R2', 'R3']);
  assert.ok(!a.proposals.some(p => p.changes.some(ch => ch.id === 'a' || ch.id === 'b')));
});

// Escenario 4: solape con uno flexible: lo reubica
test('Solape con uno flexible: propone moverlo a un hueco libre', () => {
  const a = PE.analyzeDay(base({
    events: [
      { id: 'a', title: 'Reunión', date: DAY, start: '16:00', end: '17:00', fixed: true },
      { id: 'b', title: 'Gimnasio', area: 'ejercicio', date: DAY, start: '16:30', end: '17:30', fixed: false },
    ],
  }));
  assert.ok(a.conflicts.some(x => x.kind === 'overlap' && x.movable === 'b'));
  const p = a.proposals.find(x => x.kind === 'relocate');
  assert.ok(p);
  const mv = p.changes.find(c => c.id === 'b');
  assert.ok(PE.toMin(mv.start) >= PE.toMin('17:10') || PE.toMin(mv.end) <= PE.toMin('15:50'), 'queda fuera de la reunión y su margen');
});

// Escenario 5: tarea sin duración (R8)
test('Tarea sin duración: estima 30 min y lo declara', () => {
  const a = PE.analyzeDay(base({ tasks: [task('x', 'Llamar al banco', 0)] }));
  assert.ok(a.rulesUsed.includes('R8'));
  assert.strictEqual(a.schedule.find(s => s.id === 'x').end, '15:30');
});

// Escenario 6: R5 y R4 con fecha límite
test('Fecha límite imposible (R5) y urgente (R4)', () => {
  const inp = base({
    profile: { start: '18:00', end: '20:00', margin: 0 },
    tasks: [
      task('big', 'Informe', 300, { due: '2026-10-28' }),
      task('mid', 'Presentación', 200, { due: '2026-10-28' }),
    ],
  });
  const w = PE.deadlineWarnings(inp);
  assert.strictEqual(w.find(x => x.taskId === 'big').rule, 'R5', '240 min libres < 300');
  assert.strictEqual(w.find(x => x.taskId === 'mid').rule, 'R4', '240 < 200 × 1,5');
});

// Escenario 7: R9 reparte tareas largas
test('Tarea larga con margen de días: propone bloques (R9)', () => {
  const s = PE.splitSuggestions(base({ profile: { start: '09:00', end: '21:00', margin: 10 }, tasks: [task('t', 'Trabajo final', 180, { due: '2026-10-30' })] }));
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].changes.length, 3);
  assert.ok(s[0].changes.every(b => b.date < '2026-10-30'));
});

// Escenario 8: regla personal
test('Regla personal: no programar después de las 21:00', () => {
  const a = PE.analyzeDay(base({ personalRules: [{ id: 'p1', area: 'any', after: '21:00', active: true }] }));
  assert.strictEqual(a.window.end, '21:00');
});

console.log(`\n${passed} pruebas superadas`);
