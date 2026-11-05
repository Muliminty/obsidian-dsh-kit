import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const fixtureRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'obsidian-dsh-kit-')));
await mkdir(path.join(fixtureRoot, '10_日记'));
after(() => rm(fixtureRoot, { recursive: true, force: true }));
import { today, inspectWater, recordWater, newDiary, audit, WATER_SECTION } from './water.js';
import { apply, verifyWrite } from './index.js';
import { Readable } from 'node:stream';
import vm from 'node:vm';
test('OrbitOS 首页单卡入口、子页面与返回导航', async () => {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  let definition;
  const nodes = [];
  let active = null;
  let hookIndex = 0;
  let Page;
  const React = {
    createElement(type, props, ...children) {
      if (typeof type === 'function') return type({ ...props, children: children.length === 1 ? children[0] : children });
      const node = { type, props, children }; nodes.push(node); return node;
    },
    useState: initial => hookIndex++ === 0 ? [active, value => { active = value; }] : [initial, () => {}], useRef: value => ({ current: value }),
    useEffect() {}, useSyncExternalStore() {},
  };
  const requests = [];
  let failWrite = false;
  vm.runInNewContext(source, {
    window: { confirm: () => true, __ModuleLoader__: { load: value => { definition = value; } } },
    URL, document: { baseURI: 'http://localhost/' }, AbortSignal,
    crypto: { randomUUID: () => 'test-client-12345' },
    fetch: async (url, options) => {
      if (options.body) { requests.push(JSON.parse(options.body)); if (failWrite) throw Error('connection lost'); }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ kind: 'ready', count: 4, date: '2026-11-05', version: 'test', total: 3280, capacity: 820 }) };
    },
  });
  let entry;
  const ctx = {
    effect: f => f(),
    locale: { register() {}, bind: () => key => key === 'title' ? 'Obsidian DSH Kit' : key },
    slots: { inject: (slot, f) => f(), register: (options, component) => { if (options.id) entry = options; else { Page = component; component(); } } },
  };
  definition.factory(() => React).apply(ctx);
  assert.equal(entry.label(), 'Obsidian DSH Kit');
  const cards = nodes.filter(node => node.type === 'button' && node.props.className.includes('os-feature'));
  assert.equal(cards.length, 1);
  assert.ok(!nodes.some(node => node.type === 'button' && node.children.includes('喝了一杯')));
  cards[0].props.onClick();
  nodes.length = 0; hookIndex = 0; Page();
  assert.ok(nodes.some(node => node.type === 'button' && node.children.includes('喝了一杯')));
  for (const [label, delta] of [['喝了一杯', 1], ['喝了半杯', 0.5], ['减少半杯', -0.5], ['减少一杯', -1]]) {
    const button = nodes.find(node => node.type === 'button' && node.children.includes(label));
    assert.ok(button, label);
    await button.props.onClick();
    assert.equal(requests.at(-1).delta, delta);
  }
  assert.ok(nodes.some(node => node.type === 'details'));
  const add = nodes.find(node => node.type === 'button' && node.children.includes('喝了一杯'));
  failWrite = true;
  await add.props.onClick();
  const attempts = requests.length;
  await add.props.onClick();
  assert.equal(requests.length, attempts, '结果不确定时不得再次提交');
  await nodes.find(node => node.type === 'button' && node.children.includes('核对日记')).props.onClick();
  failWrite = false;
  await add.props.onClick();
  assert.equal(requests.length, attempts + 1, '核对成功后恢复操作');
  const back = nodes.find(node => node.type === 'button' && node.children.includes('返回功能首页'));
  back.props.onClick();
  assert.equal(active, null);
});
function host(rejection) {
  const routes = [];
  apply({ connection: { requestRejection: () => rejection }, effect: f => f(), webServer: { register: route => { routes.push(route); return () => {}; } } }, { vaultRoot: fixtureRoot });
  return async (action, method, body) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method; req.headers = { 'content-type': 'application/json' };
    let result;
    const res = { setHeader() {}, end(value) { result = { status: this.statusCode, body: value ? JSON.parse(value) : null }; } };
    await routes.find(route => route.path.endsWith(action)).handler(req, res);
    return result;
  };
}
test('所有路由先做鉴权，拒绝不产生读取/写入', async () => {
  const call = host(403);
  assert.equal((await call('status', 'GET')).status, 403);
  assert.equal((await call('record', 'POST', {})).status, 403);
});
test('路由方法与过期版本校验不修改日记', async () => {
  const call = host();
  assert.equal((await call('record', 'GET')).status, 405);
  const result = await call('record', 'POST', { id: 'test-readonly-12345', date: '2000-01-01', version: null });
  assert.equal(result.body.conflict, true);
});
const diary = `---\ndate: 2026-11-05\n---\n# 日记\n\n${WATER_SECTION}## 日志\n\n保留原文\n`;
test('北京时间跨日', () => {
  assert.equal(today(new Date('2026-11-04T16:00:00Z')), '2026-11-05');
  assert.equal(today(new Date('2026-11-04T15:59:59Z')), '2026-11-04');
});
test('空记录与逐杯累加，其他正文不变', () => {
  assert.equal(inspectWater(diary).count, 0);
  let text = diary;
  for (let i = 1; i <= 4; i++) { text = recordWater(text).text; assert.equal(inspectWater(text).count, i); }
  assert.equal(inspectWater(text).total, 3280);
  assert.equal(text.replace('**喝水打卡**：1111', '**喝水打卡**：'), diary);
});
test('分数杯增减、归并、容量计算及其他正文保护', () => {
  let text = diary;
  for (const [delta, count] of [[1, 1], [0.5, 1.5], [0.25, 1.75], [-0.25, 1.5], [-0.5, 1], [-1, 0]]) {
    const result = recordWater(text, { delta });
    assert.equal(result.count, count);
    assert.equal(result.total, count * 820);
    text = result.text;
    assert.equal(text.replace(/(\*\*喝水打卡\*\*：)[^\r\n]*/, '$1'), diary);
  }
  assert.equal(text, diary);
  const fraction = recordWater(recordWater(diary, { delta: 0.5 }).text, { delta: 0.25 });
  assert.ok(fraction.text.includes('**喝水打卡**：½¼'));
  assert.equal(fraction.total, 615);
  assert.equal(recordWater(fraction.text, { delta: 0.25 }).count, 1);
});
test('拒绝不足扣减、无记录扣减与非法增量', () => {
  for (const delta of [-1, -0.5, -0.25]) assert.throws(() => recordWater(diary, { delta }), /不足/);
  assert.throws(() => recordWater('## 日志\n', { delta: -0.25, createSection: true }), /不能扣减/);
  for (const delta of [0, 0.1, 2, '0.5', null, NaN, Infinity]) assert.throws(() => recordWater(diary, { delta }), /无效/);
  assert.equal(recordWater(recordWater(diary, { delta: 0.25 }).text, { delta: -0.25 }).count, 0);
});
test('接口拒绝非法增量，缺失记录扣减不触发创建', async () => {
  const call = host();
  for (const delta of [0, 0.1, 2, '0.5', null]) {
    const result = await call('record', 'POST', { id: 'test-invalid-12345', delta });
    assert.equal(result.status, 400);
  }
  const state = (await call('status', 'GET')).body;
  const result = await call('record', 'POST', { id: 'test-minus-12345', delta: -0.25, date: state.date, version: state.version });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /不能扣减/);
});
test('读取调整后的当天容量', () => {
  const value = recordWater(diary.replace('820 ml', '600 ml'));
  assert.equal(value.total, 600);
});
test('无区块不擅自添加，确认后添加', () => {
  const text = '---\ndate: 2026-11-05\n---\n# 日记\n\n## 日志\n\n原文';
  assert.equal(recordWater(text).kind, 'missing-section');
  const next = recordWater(text, { createSection: true });
  assert.equal(next.count, 1);
  assert.ok(next.text.endsWith('## 日志\n\n原文'));
});
test('拒绝重复区块/异常打卡/异常容量', () => {
  assert.throws(() => inspectWater(diary + WATER_SECTION));
  assert.throws(() => inspectWater(diary.replace('**喝水打卡**：', '**喝水打卡**：abc')));
  assert.throws(() => inspectWater(diary.replace('820 ml', '0 ml')));
});
const template = `---\ndate: {{date:YYYY-MM-DD}}\nday: {{date:dddd}}\nweek: {{date:ww}}\n---\n# {{date}}\n\n## 今日待办\n\n- [ ] 今日主项目动作\n- [ ] 今日轻量输出 / 保底动作\n- [ ] 收件箱零散 todo（如适用）\n\n${WATER_SECTION}## 日志\n\n- \`todo\` 已执行（时间：HH:mm）\n- 昨日项目进度已同步（如适用，时间：HH:mm）\n`;
test('模板创建不虚报执行，不残留变量', () => {
  const text = newDiary(template, '2026-11-05');
  assert.ok(text.includes('day: Thursday'));
  assert.ok(text.includes('week: 45'));
  assert.ok(!text.includes('{{'));
  assert.ok(!text.includes('`todo` 已执行'));
  assert.equal(inspectWater(text).count, 0);
});
test('审计只更新 Frontmatter', () => {
  const text = audit(diary, 'test-water');
  assert.ok(text.includes('last_operation_id: "test-water"'));
  assert.ok(text.endsWith(diary.slice(diary.indexOf('\n---', 4))));
  assert.throws(() => audit('普通文本', 'test'));
});

test('写入结果以完整读回为准，不依赖回执文字', async () => {
  await verifyWrite(async () => 'unexpected output', async () => 'expected', 'expected');
  await verifyWrite(async () => { throw Error('timeout after commit'); }, async () => 'expected', 'expected');
  await assert.rejects(verifyWrite(async () => 'orbitos-water-ok', async () => 'old', 'expected'), /尚不确定/);
  await assert.rejects(verifyWrite(async () => { throw Error('failed'); }, async () => { throw Error('unreadable'); }, 'expected'), /尚不确定/);
});
