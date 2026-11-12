// TAPJERR.io — QR Ordering: table QR codes, takeaway QR, live self-order feed
import { icon } from '../../core/icons.js';
import { esc, money, downloadFile, timeAgo } from '../../core/utils.js';
import { toast, emptyState } from '../../core/ui.js';
import { qrSVG, tableUrl, takeawayUrl, baseUrl } from '../../core/qr.js';
import { pageHead, orderRow, openOrderDetail } from '../common.js';
import { tableForm } from './tables.js';

function printSheet(cards, settings) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print QR codes.', 'warning');
  const css = `*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:#0b1250}
  .sheet{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm;padding:10mm}
  .card{border:2px solid #142a9c;border-radius:8mm;padding:8mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
  .brand{font-weight:800;font-size:20pt;margin:0}.tag{font-size:10pt;color:#555;margin:2mm 0 4mm}
  .qr svg{width:60mm;height:60mm}.num{font-size:28pt;font-weight:800;margin:3mm 0 0}.cta{font-size:12pt;font-weight:600;margin:2mm 0}
  .url{font-size:7.5pt;color:#777;word-break:break-all}.foot{font-size:7pt;color:#999;margin-top:3mm}
  @page{size:A4;margin:0}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(settings.name)} — QR codes</title><style>${css}</style></head><body><div class="sheet">${cards
    .map(
      (c) => `<div class="card"><p class="brand">${esc(settings.name)}</p><p class="tag">${esc(settings.tagline || 'Scan, order, enjoy')}</p>
      <div class="qr">${qrSVG(c.url, { size: 240 })}</div><p class="num">${esc(c.title)}</p><p class="cta">Scan to view menu &amp; order</p><p class="url">${esc(c.url)}</p><p class="foot">Powered by TAPJERR.io</p></div>`
    )
    .join('')}</div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    root.innerHTML = `
      ${pageHead('QR Ordering', 'Each table has its own QR code. Customers scan, browse and order — no account needed.', `<button class="btn btn-outline" data-add>${icon('plus', 18)} Add Table</button><button class="btn btn-primary" data-print-all>${icon('printer', 18)} Print all QR</button>`)}
      <div class="stat-grid mb">
        <div class="card span-8">
          <div class="card-head"><h3>Ordering channels</h3><a class="small" href="#/settings?tab=ordering">Settings</a></div>
          <div class="col" data-channels></div>
        </div>
        <div class="card span-4 qr-card" data-takeaway></div>
      </div>
      <div class="card mb">
        <div class="card-head"><h3>Table QR codes</h3><span class="small muted" data-count></span></div>
        <div data-grid></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Live self-orders</h3><a href="#/orders?tab=qr" class="small">All QR orders</a></div>
        <div data-feed></div>
      </div>`;
    const $ = (s) => root.querySelector(s);

    function renderChannels() {
      const s = live.settings;
      $('[data-channels]').innerHTML = `
        <label class="row between"><span><b>Dine-in table QR ordering</b><br><span class="small muted">Customers at a table scan to order; orders are tagged with the table number.</span></span>
          <span class="switch"><input type="checkbox" data-toggle="dineInQrEnabled" ${s.dineInQrEnabled ? 'checked' : ''}><span class="track"></span></span></label>
        <hr class="divider" style="margin:4px 0">
        <label class="row between"><span><b>Online takeaway / tapau</b><br><span class="small muted">Customers order ahead and pick up — name, phone and pickup time required.</span></span>
          <span class="switch"><input type="checkbox" data-toggle="takeawayEnabled" ${s.takeawayEnabled ? 'checked' : ''}><span class="track"></span></span></label>
        <hr class="divider" style="margin:4px 0">
        <div class="row between wrap"><span><b>QR base URL</b><br><span class="small muted mono">${esc(baseUrl(s))}</span></span><a class="btn btn-sm btn-outline" href="#/settings?tab=ordering">Change</a></div>
        ${!s.baseUrl && /localhost|127\.0\.0\.1/.test(location.hostname) ? `<div class="demo-banner">${icon('triangle-alert', 16)} You're on localhost — phones can't open these links. Set your public domain (e.g. tapjerr.io) as the base URL before printing.</div>` : ''}`;
      root.querySelectorAll('[data-toggle]').forEach((c) =>
        c.addEventListener('change', async () => {
          await store.set('settings', 'store', { [c.dataset.toggle]: c.checked }, { merge: true });
          toast('Ordering settings updated.', 'success');
        })
      );
      const url = takeawayUrl(s);
      $('[data-takeaway]').innerHTML = `<h3>Takeaway QR</h3><div class="qr-img">${qrSVG(url, { size: 144 })}</div><a class="qr-url" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
        <div class="row"><button class="btn btn-sm btn-outline" data-dl-take>${icon('download', 16)} SVG</button><button class="btn btn-sm btn-soft" data-print-take>${icon('printer', 16)} Print</button></div>`;
      $('[data-dl-take]').onclick = () => downloadFile('selagi-takeaway-qr.svg', qrSVG(url, { size: 600 }), 'image/svg+xml');
      $('[data-print-take]').onclick = () => printSheet([{ title: 'Takeaway', url }], s);
    }

    function renderGrid() {
      const tables = [...live.tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      $('[data-count]').textContent = `${tables.length} tables`;
      if (!tables.length) {
        $('[data-grid]').innerHTML = emptyState({ iconName: 'qr-code', title: 'No Table Yet', text: 'Start adding your table and manage seating & ordering easily.', action: `<button class="btn btn-primary btn-lg" data-add2>Add Table</button>` });
        $('[data-add2]').onclick = addTable;
        return;
      }
      $('[data-grid]').innerHTML = `<div class="qr-grid">${tables
        .map((t) => {
          const url = tableUrl(live.settings, t);
          return `<div class="card flat qr-card"><div class="row between" style="width:100%"><b style="font-size:20px">Table ${esc(t.number)}</b><span class="badge">${esc(t.section || '')}</span></div>
            <div class="qr-img">${qrSVG(url, { size: 144 })}</div>
            <a class="qr-url" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
            <div class="row"><button class="btn btn-sm btn-outline" data-dl="${esc(t.id)}">${icon('download', 16)} SVG</button><button class="btn btn-sm btn-outline" data-copy="${esc(url)}">${icon('copy', 16)} Link</button><button class="btn btn-sm btn-soft" data-p="${esc(t.id)}">${icon('printer', 16)}</button></div></div>`;
        })
        .join('')}</div>`;
      root.querySelectorAll('[data-dl]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = live.tables.find((x) => x.id === b.dataset.dl);
          downloadFile(`table-${t.number}-qr.svg`, qrSVG(tableUrl(live.settings, t), { size: 600 }), 'image/svg+xml');
        })
      );
      root.querySelectorAll('[data-copy]').forEach((b) =>
        b.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(b.dataset.copy);
            toast('Link copied.', 'success');
          } catch {
            toast(b.dataset.copy, 'info');
          }
        })
      );
      root.querySelectorAll('[data-p]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = live.tables.find((x) => x.id === b.dataset.p);
          printSheet([{ title: `Table ${t.number}`, url: tableUrl(live.settings, t) }], live.settings);
        })
      );
    }

    function renderFeed() {
      const list = live.orders.filter((o) => o.source !== 'pos').slice(0, 8);
      $('[data-feed]').innerHTML = list.length
        ? `<div class="order-list">${list.map((o) => orderRow(o)).join('')}</div>`
        : emptyState({ iconName: 'smartphone', title: 'No self-orders yet', text: 'Orders placed by customers via table QR or online takeaway appear here instantly.' });
      root.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => openOrderDetail(b.dataset.order, ctx)));
    }

    function addTable() {
      const sections = [...new Set(live.tables.map((t) => t.section || 'Main'))];
      tableForm(null, sections, async (v) => {
        if (live.tables.some((t) => t.number === v.number)) return toast('A table with this number already exists.', 'error'), false;
        await store.set('tables', 'T' + v.number, { ...v, status: 'available', guests: 0, reservedFor: '' });
        toast(`Table ${v.number} added with its own QR code.`, 'success');
      });
    }

    $('[data-add]').onclick = addTable;
    $('[data-print-all]').onclick = () => {
      const tables = [...live.tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      if (!tables.length) return toast('Add tables first.', 'warning');
      printSheet(
        tables.map((t) => ({ title: `Table ${t.number}`, url: tableUrl(live.settings, t) })),
        live.settings
      );
    };

    const unsubs = [live.on('settings', renderChannels), live.on(['tables', 'settings'], renderGrid), live.on('orders', renderFeed)];
    return () => unsubs.forEach((u) => u());
  },
};

export { timeAgo, money };
