// 喝水记录的纯文本变换；不执行文件读写。
export const WATER_SECTION = `## 喝水记录\n\n- **每杯容量**：约 820 ml（可调整；历史日记保留当天容量）\n- **喝水打卡**：\n\n<!-- 1 = 一杯，½ = 半杯，¼ = 四分之一杯；留空表示尚未记录。 -->\n\n`;
export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function inspectWater(text) {
  const headings = [...text.matchAll(/^## 喝水记录\s*$/gm)];
  if (!headings.length) return { kind: 'missing-section' };
  if (headings.length !== 1) throw new Error('发现多个喝水记录区，请先手动合并，未修改日记。');
  const start = headings[0].index + headings[0][0].length;
  const rest = text.slice(start);
  const boundary = rest.search(/^#{1,2} /m);
  const end = boundary < 0 ? text.length : start + boundary;
  const section = text.slice(start, end);
  const marks = [...section.matchAll(/^- \*\*喝水打卡\*\*[：:]([^\r\n]*)/gm)];
  if (marks.length !== 1) throw new Error('喝水打卡行缺失或重复，请检查记录格式，未修改日记。');
  const raw = marks[0][1].trim();
  if (!/^[1½¼]*$/.test(raw)) throw new Error('喝水打卡行含有无法识别的内容，仅支持 1、½、¼，请先检查，未修改日记。');
  const quarters = [...raw].reduce((sum, mark) => sum + ({ '1': 4, '½': 2, '¼': 1 }[mark]), 0);
  const capacity = section.match(/^- \*\*每杯容量\*\*[：:]\s*(?:约\s*)?(\d+(?:\.\d+)?)\s*ml\b/im);
  const ml = capacity ? Number(capacity[1]) : null;
  if (!ml || !Number.isFinite(ml)) throw new Error('无法识别每杯容量，请填写正数 ml，未修改日记。');
  return { kind: 'ready', count: quarters / 4, capacity: ml, total: quarters / 4 * ml, lineStart: start + marks[0].index, lineLength: marks[0][0].length };
}
export function recordWater(text, { createSection = false, delta = 1 } = {}) {
  if (![1, 0.5, 0.25, -0.25, -0.5, -1].includes(delta)) throw new Error('无效杯数调整。');
  let state = inspectWater(text);
  if (state.kind === 'missing-section') {
    if (delta < 0) throw new Error('尚无喝水记录，不能扣减。');
    if (!createSection) return { kind: 'missing-section' };
    const at = text.search(/^## 日志\s*$/m);
    text = at >= 0 ? text.slice(0, at) + WATER_SECTION + text.slice(at) : text.trimEnd() + '\n\n' + WATER_SECTION;
    state = inspectWater(text);
  }
  const quarters = state.count * 4 + delta * 4;
  if (quarters < 0) throw new Error('剩余杯数不足，不能扣减至零以下。');
  const marks = '1'.repeat(Math.floor(quarters / 4)) + (quarters % 4 >= 2 ? '½' : '') + (quarters % 2 ? '¼' : '');
  const line = `- **喝水打卡**：${marks}`;
  const next = text.slice(0, state.lineStart) + line + text.slice(state.lineStart + state.lineLength);
  return { kind: 'recorded', text: next, ...inspectWater(next) };
}
export function newDiary(template, date) {
  const noon = new Date(`${date}T12:00:00+08:00`);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(noon);
  // ISO 周数。
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
  let text = template.replaceAll('{{date:YYYY-MM-DD}}', date).replaceAll('{{date:dddd}}', day).replaceAll('{{date:ww}}', String(week).padStart(2, '0')).replaceAll('{{date}}', date);
  if (/\{\{[^}]+\}\}/.test(text)) throw new Error('模板存在无法解析的变量，未创建日记。');
  // 创建日记不等于执行 todo，移除模板中的示例任务和虚拟执行日志。
  text = text.replace(/^- \[ \] (今日主项目动作|今日轻量输出 \/ 保底动作|收件箱零散 todo（如适用）)\r?\n/gm, '')
    .replace(/^- `todo` 已执行（时间：HH:mm）\r?\n/gm, '')
    .replace(/^- 昨日项目进度已同步（如适用，时间：HH:mm）\r?\n/gm, '');
  return text;
}
export function audit(text, operation) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) throw new Error('日记缺少 Frontmatter，未修改日记。');
  const end = text.indexOf('\n---', 4);
  if (end < 0) throw new Error('Frontmatter 不完整，未修改日记。');
  let front = text.slice(0, end);
  for (const [key, value] of Object.entries({ schema_version: '1', last_operation_id: operation, updated_by: 'orbitos-water' })) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    front = re.test(front) ? front.replace(re, `${key}: "${value}"`) : front + `\n${key}: "${value}"`;
  }
  return front + text.slice(end);
}
