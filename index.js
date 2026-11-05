import { readFile, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { today, inspectWater, recordWater, newDiary, audit } from './water.js';

export const inject = ['webServer', 'connection'];
const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN || 'obsidian';
const run = promisify(execFile);
const hash = text => createHash('sha256').update(text).digest('hex');
const json = (res, status, value) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
};
/** 调用本机 Obsidian CLI 求值；返回值按行首 `=>` 截取。 */
async function obsidianEval(code, timeout) {
  const { stdout } = await run(OBSIDIAN_BIN, ['eval', `code=${code}`], { timeout, maxBuffer: 1024 * 1024 });
  return stdout.replace(/^=>\s?/, '').trim();
}
export function apply(ctx, config = {}) {
  const settings = {
    vaultRoot: config.vaultRoot,
    diaryDir: config.diaryDir ?? '10_日记',
    templatePath: config.templatePath ?? '99_系统/模板/Daily_Note.md',
    operationSuffix: config.operationSuffix ?? 'water',
  };
  // 默认从正在运行的 Obsidian 读取仓库根路径；失败时清空缓存，下次请求重试。
  let resolvedRoot;
  const vaultRoot = async () => {
    if (settings.vaultRoot) return settings.vaultRoot;
    if (resolvedRoot === undefined) {
      resolvedRoot = obsidianEval('app.vault.adapter.getBasePath()', 10000).then(value => {
        if (!value.startsWith(path.sep)) throw new Error('无法获取 Obsidian 仓库路径，请在插件配置中指定 vaultRoot。');
        return value;
      }).catch(error => { resolvedRoot = undefined; throw error; });
    }
    return resolvedRoot;
  };
  // 目标固定在当前 Obsidian 仓库内，拒绝符号链接；客户端不能指定路径或代码。
  async function safe(root, relative) {
    if (path.isAbsolute(relative) || relative.includes('..')) throw new Error('非法路径。');
    const absolute = path.join(root, relative);
    if (await realpath(path.dirname(absolute)) !== path.dirname(absolute)) throw new Error('目录含符号链接，拒绝访问。');
    try { if (!(await lstat(absolute)).isFile()) throw new Error('目标不是普通文件。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return absolute;
  }
  async function snapshot() {
    const root = await vaultRoot();
    const date = today();
    const relative = `${settings.diaryDir}/${date}.md`;
    const absolute = await safe(root, relative);
    let text;
    try { text = await readFile(absolute, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const state = text === undefined ? { kind: 'missing-diary' } : inspectWater(text);
    const { lineStart, lineLength, ...publicState } = state;
    return { date, path: relative, version: text === undefined ? null : hash(text), ...publicState, text };
  }
  let queue = Promise.resolve();
  const completed = new Map();
  for (const action of ['status', 'record']) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: `/orbitos-water/api/${action}`,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection !== undefined) { res.statusCode = rejection; res.end(); return; }
      if (req.method !== (action === 'status' ? 'GET' : 'POST')) { res.statusCode = 405; res.end(); return; }
      try {
        if (action === 'status') { const { text, ...state } = await snapshot(); json(res, 200, state); return; }
        if (String(req.headers['content-type']).split(';')[0] !== 'application/json') { json(res, 415, { message: '需要 JSON 请求。' }); return; }
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw new Error('请求过大。'); }
        const input = JSON.parse(body);
        if (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.id)) throw new Error('无效请求标识。');
        const execute = async () => {
          if (completed.has(input.id)) return completed.get(input.id);
          const current = await snapshot();
          if (input.date !== current.date || input.version !== current.version) return { conflict: true, message: '日期或日记内容已变化，请刷新后重试。' };
          if (current.kind !== 'ready' && input.confirm !== current.kind) return { confirmation: current.kind };
          let text = current.text;
          if (text === undefined) {
            const root = await vaultRoot();
            const template = await readFile(await safe(root, settings.templatePath), 'utf8');
            text = newDiary(template, current.date);
          }
          const updated = recordWater(text, { createSection: true });
          const operation = `${current.date.replaceAll('-', '')}-${Date.now()}-${settings.operationSuffix}`;
          const next = audit(updated.text, operation);
          // Obsidian 的 process 在实际提交时再次比较原文，避免覆盖同时编辑的内容。
          const code = `(async()=>{if(app.vault.adapter.getBasePath()!==${JSON.stringify(await vaultRoot())})throw Error('Obsidian 当前仓库不匹配');const p=${JSON.stringify(current.path)};const f=app.vault.getAbstractFileByPath(p);const expected=${JSON.stringify(current.text ?? null)};const next=${JSON.stringify(next)};if(expected===null){if(f)throw Error('日记已由其他操作创建，请刷新');await app.vault.create(p,next)}else{if(!f)throw Error('日记已被移除，请刷新');await app.vault.process(f,s=>{if(s!==expected)throw Error('日记已修改，请刷新');return next})}return 'orbitos-water-ok'})()`;
          let marker;
          try { marker = await obsidianEval(code, 20000); }
          catch (error) { throw new Error(`Obsidian 写入未确认：${String(error.message).slice(0, 300)}`); }
          if (marker !== 'orbitos-water-ok') throw new Error('Obsidian 未确认写入，请刷新核对后再操作。');
          const { text: ignored, ...state } = await snapshot();
          const result = { ...state, recorded: true };
          completed.set(input.id, result);
          if (completed.size > 500) completed.delete(completed.keys().next().value);
          return result;
        };
        const pending = queue.then(execute);
        queue = pending.catch(() => {});
        json(res, 200, await pending);
      } catch (error) { json(res, 400, { message: error.message || '记录失败，请刷新后核对。' }); }
    },
  }));
}
