window.__ModuleLoader__.load({
  id: 'obsidian-dsh-kit',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const panelId = 'obsidian-dsh-kit';
    const namespace = 'obsidian-dsh-kit';
    const texts = {
      title: 'Obsidian DSH Kit',
    };
    function OrbitIcon({ size = 20 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true,
        style: { display: 'block', flexShrink: 0 },
      }, h('circle', { cx: 12, cy: 12, r: 3 }),
      h('ellipse', { cx: 12, cy: 12, rx: 10, ry: 4.8, transform: 'rotate(-35 12 12)' }));
    }
    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, 'en', texts));
        ctx.effect(() => ctx.locale.register(namespace, 'zh', texts));
        const t = ctx.locale.bind(namespace);
        /* 共用视觉组件：新增功能沿用 Surface / Button / Icon 和下方设计变量。 */
        function Icon({ name = 'drop', size = 22 }) {
          const paths = { drop: 'M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Z', arrow: 'M5 12h14m-6-6 6 6-6 6', back: 'M19 12H5m6-6-6 6 6 6', refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1', plus: 'M12 5v14M5 12h14', check: 'm5 12 4 4L19 6' };
          return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] || paths.drop }));
        }
        function Button({ children, icon, primary, className = '', ...props }) {
          return h('button', { type: 'button', ...props, className: `os-button ${primary ? 'os-button-primary' : ''} ${className}` }, icon ? h(Icon, { name: icon, size: 18 }) : null, children);
        }
        function Surface({ children, className = '', ...props }) {
          return h('div', { ...props, className: `os-surface ${className}` }, children);
        }
        function WaterCard() {
          const [state, setState] = React.useState(null);
          const [busy, setBusy] = React.useState(false);
          const [message, setMessage] = React.useState('');
          const lock = React.useRef(false);
          const request = async (action, body) => {
            const options = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
            let response;
            try { response = await fetch(new URL(`orbitos-water/api/${action}`, document.baseURI), { ...options, signal: AbortSignal.timeout(20000) }); }
            catch (error) {
              if (error.name === 'TimeoutError') throw new Error(body ? '请求超时，写入结果尚不确定；请先刷新核对杯数，不要立即重复打卡。' : '读取超时，请稍后刷新。');
              throw new Error(body ? '连接中断，写入结果尚不确定；请先刷新核对杯数。' : '无法连接喝水服务，请检查 DSH 是否正常运行。');
            }
            if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('喝水服务尚未加载，请重载插件或重启 DSH。');
            const result = await response.json();
            if (!response.ok || result.message) throw new Error(result.message || '请求失败');
            return result;
          };
          const refresh = async () => {
            try { const result = await request('status'); setState(result); return result; }
            catch (error) { setMessage(error.message); return null; }
          };
          React.useEffect(() => { refresh(); }, []);
          const record = async () => {
            if (lock.current) return;
            lock.current = true; setBusy(true); setMessage('');
            try {
              const current = await refresh();
              if (!current) return;
              if (current.kind !== 'ready') {
                const question = current.kind === 'missing-diary' ? `${current.date} 还没有日记。是否按模板创建，并记录一杯水？` : '当天日记没有喝水记录区。是否添加记录区，并记录一杯水？';
                if (!window.confirm(question)) { setMessage('已取消，未写入。'); return; }
              }
              const result = await request('record', { id: crypto.randomUUID(), date: current.date, version: current.version, confirm: current.kind });
              if (result.confirmation || result.conflict) { setMessage('日记已变化，请刷新后重试。'); return; }
              setState(result); setMessage('已记录一杯水。');
            } catch (error) { setMessage(error.message); }
            finally { lock.current = false; setBusy(false); }
          };
          const ready = state?.kind === 'ready';
          return h(Surface, { className: 'os-water' },
            h('div', { className: 'os-water-top' }, h('span', { className: 'os-tag' }, '今日记录'), h('span', { className: 'os-muted' }, state ? `${state.date} · 北京时间` : '正在同步日记…')),
            h('div', { className: 'os-water-main' },
              h('div', { className: 'os-water-visual', 'aria-hidden': true }, h(Icon, { size: 62 }), h('span', null, '一杯一记')),
              h('div', null, h('p', { className: 'os-muted' }, '今日已记录饮水'),
                h('div', { className: 'os-amount' }, ready ? state.total.toLocaleString() : '—', h('span', null, 'ml')),
                h('p', { className: 'os-summary' }, ready ? `${state.count} 杯 · 每杯约 ${state.capacity} ml` : state?.kind === 'missing-diary' ? '当天日记尚未创建' : state?.kind === 'missing-section' ? '尚未添加喝水记录区' : '等待日记状态'))),
            h('div', { className: 'os-actions' },
              h(Button, { primary: true, icon: 'plus', disabled: busy, onClick: record }, busy ? '正在记录…' : '喝了一杯（+1）'),
              h(Button, { icon: 'refresh', disabled: busy, onClick: () => { setMessage(''); refresh(); }, 'aria-label': '刷新日记状态' }, '刷新')),
            message ? h('p', { className: 'os-feedback', role: 'status', 'aria-live': 'polite' }, message) : null,
            h('div', { className: 'os-water-footer' }, h(Icon, { name: 'check', size: 16 }), '直接保存到当天日记 · 未记录不代表未喝水'));
        }
        const styles = `
          .os-app{--os-accent:#147d91;--os-soft:rgba(20,125,145,.09);--os-radius:20px;--os-border:var(--dsw-alias-border-l1,#ddd);--os-muted:var(--dsw-alias-label-secondary,#78818b);height:100%;overflow:auto;box-sizing:border-box;padding:48px 32px;background:var(--dsw-alias-bg-base,#f7f8fa);color:var(--dsw-alias-label-primary,#202b34);font-family:inherit}
          .os-app *{box-sizing:border-box}.os-app p{margin:0;line-height:1.7}.os-inner{max-width:960px;margin:0 auto}.os-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:650;letter-spacing:.02em}.os-brand-mark,.os-icon-tile{display:grid;place-items:center;background:var(--os-soft);color:var(--os-accent);border:1px solid rgba(20,125,145,.12)}.os-brand-mark{width:36px;height:36px;border-radius:11px}.os-heading{margin:40px 0 28px}.os-eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--os-accent);margin-bottom:12px}.os-heading h1{font-size:30px;letter-spacing:-.04em;line-height:1.3;font-weight:650;margin:0 0 10px}.os-muted{color:var(--os-muted);font-size:13px}.os-heading p{color:var(--os-muted);font-size:14px}.os-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:20px}.os-surface{border:1px solid var(--os-border);border-radius:var(--os-radius);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 6px 28px rgba(0,0,0,.025)}
          .os-feature{font:inherit;color:inherit;text-align:left;padding:26px;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s;width:100%}.os-feature:hover{transform:translateY(-3px);border-color:var(--os-accent);box-shadow:0 12px 32px rgba(20,125,145,.09)}.os-feature-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}.os-icon-tile{width:52px;height:52px;border-radius:16px}.os-tag{font-size:11px;font-weight:600;letter-spacing:.03em;background:var(--os-soft);color:var(--os-accent);padding:5px 10px;border-radius:7px}.os-feature h2{font-size:19px;font-weight:650;margin:0 0 8px}.os-feature p{font-size:13px;color:var(--os-muted)}.os-feature-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:28px;padding-top:18px;border-top:1px solid var(--os-border);font-size:12px;color:var(--os-accent)}
          .os-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--os-border);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;padding:12px 18px;border-radius:12px;font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:filter .18s,background .18s}.os-button:hover{background:var(--os-soft)}.os-button-primary{background:var(--os-accent);color:#fff;border-color:var(--os-accent);box-shadow:0 4px 12px rgba(20,125,145,.15)}.os-button-primary:hover{background:var(--os-accent);filter:brightness(1.1)}.os-button:disabled{opacity:.5;cursor:wait}.os-button:focus-visible,.os-feature:focus-visible{outline:3px solid var(--os-accent);outline-offset:4px}.os-back{border:0;background:transparent;padding:0;color:var(--os-muted)}.os-nav{display:flex;align-items:center;gap:16px;margin-top:32px;font-size:13px}.os-nav-divider{color:var(--os-border)}
          .os-water{max-width:720px;padding:28px}.os-water-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.os-water-main{display:flex;align-items:center;gap:38px;padding:42px 12px}.os-water-visual{width:140px;height:160px;border-radius:40px;background:linear-gradient(155deg,var(--os-soft),rgba(20,125,145,.02));border:1px solid rgba(20,125,145,.12);color:var(--os-accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;flex-shrink:0}.os-water-visual span{font-size:11px;letter-spacing:.1em}.os-amount{font-size:60px;line-height:1.3;letter-spacing:-.05em;font-weight:600;font-variant-numeric:tabular-nums}.os-amount span{font-size:18px;letter-spacing:0;margin-left:10px;color:var(--os-muted);font-weight:400}.os-summary{font-size:13px;color:var(--os-muted);margin-top:6px!important}.os-actions{display:flex;gap:12px}.os-actions .os-button-primary{flex:1}.os-feedback{padding:12px 14px;border-radius:10px;background:var(--os-soft);font-size:13px;margin-top:16px!important;overflow-wrap:anywhere}.os-water-footer{margin-top:24px;padding-top:18px;border-top:1px solid var(--os-border);display:flex;align-items:center;gap:8px;color:var(--os-muted);font-size:12px}
          @media(prefers-color-scheme:dark){.os-app{--os-accent:#66c5d4;--os-soft:rgba(102,197,212,.09)}.os-button-primary{color:#102b31}}@media(prefers-reduced-motion:reduce){.os-app *{transition:none!important}}@media(max-width:540px){.os-app{padding:28px 20px}.os-heading{margin:28px 0 22px}.os-heading h1{font-size:26px}.os-water{padding:20px}.os-water-main{gap:20px;padding:32px 0}.os-water-visual{width:85px;height:120px;border-radius:26px}.os-water-visual svg{width:42px}.os-amount{font-size:42px}.os-water-footer{align-items:flex-start}.os-feature{padding:22px}}
        `;
        // 功能注册表驱动首页；后续模块复用同一入口卡片和页面外壳。
        const features = [{ id: 'water', title: '喝水打卡', description: '一杯水，一个 1。把日常的小习惯，留在日记里。', icon: 'drop', tag: '日常记录', caption: '记录饮水 · 同步日记', component: WaterCard }];
        function FeatureCard({ feature, onOpen }) {
          return h('button', { type: 'button', className: 'os-surface os-feature', onClick: onOpen, 'aria-label': `打开${feature.title}` },
            h('div', { className: 'os-feature-top' }, h('span', { className: 'os-icon-tile' }, h(Icon, { name: feature.icon, size: 27 })), h('span', { className: 'os-tag' }, feature.tag)),
            h('h2', null, feature.title), h('p', null, feature.description),
            h('div', { className: 'os-feature-bottom' }, h('span', null, feature.caption), h(Icon, { name: 'arrow', size: 18 })));
        }
        function Page() {
          const [active, setActive] = React.useState(null);
          const feature = features.find(item => item.id === active);
          return h('section', { className: 'os-app', 'aria-label': 'Obsidian DSH Kit' },
            h('style', null, styles),
            h('div', { className: 'os-inner' },
              h('header', { className: 'os-brand' }, h('span', { className: 'os-brand-mark' }, h(OrbitIcon, { size: 22 })), 'Obsidian DSH Kit'),
              feature ? h('nav', { className: 'os-nav', 'aria-label': '功能导航' }, h(Button, { icon: 'back', className: 'os-back', onClick: () => setActive(null) }, '返回功能首页'), h('span', { className: 'os-nav-divider' }, '/'), h('span', null, feature.title)) : null,
              h('div', { className: 'os-heading' }, h('div', { className: 'os-eyebrow' }, feature ? '日常记录' : '个人工作台'), h('h1', { key: active || 'home', tabIndex: -1, ref: node => { if (node) node.focus({ preventScroll: true }); } }, feature ? feature.title : '让日常，井然有序。'), h('p', null, feature ? '每喝完一杯，留下一个简单的记录。' : '轻量的工具，专注于每一件小事。')),
              feature ? h(feature.component) : h('div', { className: 'os-grid' }, features.map(item => h(FeatureCard, { key: item.id, feature: item, onOpen: () => setActive(item.id) })))));
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId }, Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: panelId, order: 20, label: () => t('title'),
        }, OrbitIcon));
      },
    };
  },
});
