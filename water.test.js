import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const fixtureRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'obsidian-dsh-kit-')));
await mkdir(path.join(fixtureRoot, '10_日记'));
after(() => rm(fixtureRoot, { recursive: true, force: true }));
import { today, inspectWater, recordWater, newDiary, audit, WATER_SECTION } from './water.js';
import { apply } from './index.js';
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
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { definition = value; } } } });
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
  assert.ok(!nodes.some(node => node.type === 'button' && node.children.includes('喝了一杯（+1）')));
  cards[0].props.onClick();
  nodes.length = 0; hookIndex = 0; Page();
  assert.ok(nodes.some(node => node.type === 'button' && node.children.includes('喝了一杯（+1）')));
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
