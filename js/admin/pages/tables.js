// TAPJERR.io — Table management (grid + floor plan, live status, bills)
import { icon } from '../../core/icons.js';
import { esc, money, fmtTime, round2, uid } from '../../core/utils.js';
import { openModal, toast, confirmDialog, emptyState, withBusy, formValues } from '../../core/ui.js';
import { tableState, markPaid, updateStatus, itemCount, isOpen } from '../../core/orders.js';
import { qrSVG, tableUrl } from '../../core/qr.js';
import { statusBadge, payBadge, paymentModal, openOrderDetail } from '../common.js';

const ST = {
  available: { label: 'Available', tone: 'green', color: 'var(--green)' },
  occupied: { label: 'Occupied', tone: 'amber', color: '#e08a1e' },
  reserved: { label: 'Reserved', tone: 'indigo', color: 'var(--indigo)' },
};

export function tableForm(table, sections, onSave) {
  const t = table || { number: '', section: sections[0] || 'Main', seats: 2, shape: 'square' };
  const { el, close } = openModal({
    title: table ? `Edit Table ${table.number}` : 'Add Table',
    size: 'sm',
    body: `<form class="form" data-f>
      <label class="field"><span>Table number</span><input class="input" name="number" required maxlength="6" value="${esc(t.number)}" placeholder="e.g. 09"></label>
      <label class="field"><span>Section</span><input class="input" name="section" list="sections" value="${esc(t.section || '')}" placeholder="Indoor"><datalist id="sections">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <div class="form-grid"><label class="field"><span>Seats</span><input class="input" name="seats" type="number" min="1" max="30" value="${t.seats || 2}"></label>
      <label class="field"><span>Shape</span><select class="select" name="shape"><option value="square" ${t.shape !== 'round' ? 'selected' : ''}>Square</option><option value="round" ${t.shape === 'round' ? 'selected' : ''}>Round</option></select></label></div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>`,
  });
  el.querySelector('[data-ok]').onclick = (e) =>
    withBusy(e.currentTarget, async () => {
      const v = formValues(el.querySelector('[data-f]'));
      const number = v.number.replace(/[^\w-]/g, '');
      if (!number) return toast('Enter a table number (letters/numbers only).', 'error');
      const ok = await onSave({ number, section: v.section || 'Main', seats: Math.max(1, Number(v.seats) || 2), shape: v.shape });
      if (ok !== false) close();
    });
}

export default {
  fullBleed: true,
  render(root, ctx) {
    const { live, store } = ctx;
    const manage = ctx.can('manageTables');
    let selected = ctx.params.get('t') || '';
    let section = 'all';
    let view = localStorage.getItem('tapjerr:tables-view') || 'grid';

    root.innerHTML = `
    <div class="split">
      <section class="split-left sheet" data-left>
        <div class="panel-head"><h2 data-left-title>Tables</h2>
          <div class="row">${manage ? `<button class="btn btn-outline" data-manage>Actions</button>` : ''}<button class="icon-btn" data-close-sheet aria-label="Close">${icon('x', 20)}</button></div></div>
        <div class="panel-body" data-detail></div>
        <div class="panel-foot hidden" data-foot></div>
      </section>
      <section class="split-right">
        <div class="row between wrap mb">
          <div class="tabs" data-sections style="border:0"></div>
          <div class="row">
            <div class="legend-row">${Object.values(ST).map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>
            <div class="seg" data-view><button data-v="grid" title="Grid view">${icon('layout-grid', 18)}</button><button data-v="floor" title="Floor plan">${icon('map', 18)}</button></div>
          </div>
        </div>
        <div class="mini-stats mb" data-summary></div>
        <div data-tables></div>
      </section>
    </div>`;
    const $ = (s) => root.querySelector(s);
    const left = $('[data-left]');

    const sections = () => [...new Set(live.tables.map((t) => t.section || 'Main'))];
    const sorted = () => [...live.tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

    function renderSections() {
      const secs = sections();
      $('[data-sections]').innerHTML = ['all', ...secs].map((s) => `<button class="tab ${section === s ? 'active' : ''}" data-sec="${esc(s)}">${s === 'all' ? 'All' : esc(s)}</button>`).join('');
      root.querySelectorAll('[data-sec]').forEach((b) =>
        b.addEventListener('click', () => {
          section = b.dataset.sec;
          renderSections();
          renderTables();
        })
      );
      root.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === view));
    }

    function renderSummary() {
      const states = live.tables.map((t) => tableState(t, live.orders));
      const c = (s) => states.filter((x) => x.status === s).length;
      const guests = states.reduce((a, x) => a + (x.status === 'occupied' ? x.guests || 0 : 0), 0);
      const open = round2(states.reduce((a, x) => a + x.bill, 0));
      $('[data-summary]').innerHTML = `
        <div class="card mini"><span class="mini-icon tone-green">${icon('armchair', 20)}</span><div><b>${c('available')}</b><span>Available</span></div></div>
        <div class="card mini"><span class="mini-icon tone-amber">${icon('users', 20)}</span><div><b>${c('occupied')}</b><span>Occupied · ${guests} pax</span></div></div>
        <div class="card mini"><span class="mini-icon tone-indigo">${icon('calendar-clock', 20)}</span><div><b>${c('reserved')}</b><span>Reserved</span></div></div>
        <div class="card mini"><span class="mini-icon tone-blue">${icon('receipt', 20)}</span><div><b>${money(open)}</b><span>Open bills</span></div></div>`;
    }

    function renderTables() {
      const box = $('[data-tables]');
      const list = sorted().filter((t) => section === 'all' || (t.section || 'Main') === section);
      if (!live.tables.length) {
        box.innerHTML = `<div class="card">${emptyState({
          iconName: 'armchair',
          title: 'No Tables Yet',
          text: 'Start adding tables to manage dine-in seating and orders with ease.',
          action: manage ? `<button class="btn btn-primary btn-lg" data-add-first>Add Table</button>` : '',
        })}</div>`;
        box.querySelector('[data-add-first]')?.addEventListener('click', addTable);
        return;
      }
      if (view === 'floor') return renderFloor(box, list);
      box.innerHTML = `<div class="table-grid">${list
        .map((t) => {
          const s = tableState(t, live.orders);
          return `<button class="table-card st-${s.status} ${selected === t.id ? 'selected' : ''}" data-t="${esc(t.id)}">
            <div class="row between"><span class="t-num">${esc(t.number)}</span><span class="badge tone-${ST[s.status].tone}">${ST[s.status].label}</span></div>
            <div class="small muted">${esc(t.section || '')} · ${t.seats || 2} seats</div>
            ${s.status === 'occupied' ? `<div class="row between"><span class="small">${icon('users', 14)} ${s.guests || '—'} pax</span><b class="tnum">${money(s.bill)}</b></div>` : ''}
            ${s.status === 'reserved' ? `<div class="small">${icon('calendar-clock', 14)} ${esc(t.reservedFor || 'Reserved')}</div>` : ''}
            <div class="t-meta"><span>${s.openOrders.length ? `${s.openOrders.length} order${s.openOrders.length > 1 ? 's' : ''}` : '&nbsp;'}</span><span>${s.openOrders[0] ? esc(fmtTime(s.openOrders[s.openOrders.length - 1].createdAt)) : ''}</span></div>
          </button>`;
        })
        .join('')}</div>`;
      box.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => select(b.dataset.t)));
    }

    function renderFloor(box, list) {
      box.innerHTML = `<div class="floor" data-floor>${list
        .map((t, i) => {
          const s = tableState(t, live.orders);
          const x = t.x ?? 24 + (i % 6) * 120;
          const y = t.y ?? 24 + Math.floor(i / 6) * 130;
          return `<button class="floor-table st-${s.status} ${t.shape === 'round' ? 'round' : ''}" style="left:${x}px;top:${y}px" data-ft="${esc(t.id)}">${esc(t.number)}<small>${s.status === 'occupied' ? money(s.bill) : `${t.seats || 2} seats`}</small></button>`;
        })
        .join('')}</div><p class="tiny muted mt">${manage ? 'Drag tables to arrange your floor plan. Tap a table to open it.' : 'Tap a table to open it.'}</p>`;
      const floor = box.querySelector('[data-floor]');
      floor.querySelectorAll('[data-ft]').forEach((el) => {
        let start = null;
        let moved = false;
        el.addEventListener('pointerdown', (e) => {
          start = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
          moved = false;
          if (manage) el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', (e) => {
          if (!start || !manage) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            moved = true;
            el.classList.add('dragging');
            const nx = Math.max(0, Math.min(floor.clientWidth - el.offsetWidth, start.l + dx));
            const ny = Math.max(0, Math.min(floor.clientHeight - el.offsetHeight, start.t + dy));
            el.style.left = nx + 'px';
            el.style.top = ny + 'px';
          }
        });
        el.addEventListener('pointerup', async () => {
          el.classList.remove('dragging');
          if (moved && manage) {
            await store.update('tables', el.dataset.ft, { x: Math.round(el.offsetLeft / 8) * 8, y: Math.round(el.offsetTop / 8) * 8 }).catch((e) => toast(e.message, 'error'));
          } else select(el.dataset.ft);
          start = null;
        });
      });
    }

    function select(id) {
      selected = id;
      left.classList.add('open');
      renderTables();
      renderDetail();
    }

    function renderDetail() {
      const box = $('[data-detail]');
      const foot = $('[data-foot]');
      const t = live.tables.find((x) => x.id === selected);
      if (!t) {
        $('[data-left-title]').textContent = 'Tables';
        foot.classList.add('hidden');
        box.innerHTML = emptyState({ iconName: 'armchair', title: 'Select Table to Create Order', text: 'Tap a table to see its orders, guests and bill.' });
        return;
      }
      const s = tableState(t, live.orders);
      $('[data-left-title]').textContent = `Table ${t.number}`;
      box.innerHTML = `
        <div class="row wrap gap-sm mb"><span class="badge tone-${ST[s.status].tone}">${ST[s.status].label}</span><span class="badge">${esc(t.section || 'Main')}</span><span class="badge">${t.seats || 2} seats</span></div>
        ${s.status === 'reserved' && t.reservedFor ? `<div class="demo-banner tone-indigo mb">${icon('calendar-clock', 16)} Reserved: ${esc(t.reservedFor)}</div>` : ''}
        <div class="row between mb"><span class="muted">Guests</span>
          <div class="qty"><button data-g="-1" aria-label="Fewer guests">${icon('minus', 14)}</button><b>${t.guests || 0}</b><button data-g="1" aria-label="More guests">${icon('plus', 14)}</button></div></div>
        <h4 class="mb">Current orders</h4>
        ${
          s.openOrders.length
            ? `<div class="col">${s.openOrders
                .map(
                  (o) => `<button class="card flat" style="text-align:left;padding:14px" data-o="${esc(o.id)}">
                <div class="row between"><b>${esc(o.orderNo)}</b><b class="tnum">${money(o.total)}</b></div>
                <div class="tiny muted">${esc(fmtTime(o.createdAt))} · ${itemCount(o.items)} items · ${o.source === 'qr' ? 'Table QR' : 'POS'}</div>
                <div class="small mt" style="color:var(--text-2)">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</div>
                <div class="row gap-sm mt">${statusBadge(o.status)}${payBadge(o.paymentStatus)}</div></button>`
                )
                .join('')}</div>`
            : `<p class="muted small">No open orders for this table.</p>`
        }
        <div class="col mt">
          <a class="btn btn-soft btn-block" href="#/pos?table=${encodeURIComponent(t.id)}">${icon('plus', 18)} New order for this table</a>
          <div class="row">
            ${s.status !== 'reserved' && s.status !== 'occupied' ? `<button class="btn btn-outline grow" data-reserve>${icon('calendar-clock', 18)} Reserve</button>` : ''}
            ${s.status === 'reserved' ? `<button class="btn btn-outline grow" data-unreserve>${icon('calendar-x', 18)} Cancel reservation</button>` : ''}
            <button class="btn btn-outline grow" data-qr>${icon('qr-code', 18)} QR</button>
            ${manage ? `<button class="btn btn-outline" data-edit title="Edit table">${icon('pencil', 18)}</button>` : ''}
          </div>
        </div>`;
      const unpaid = s.openOrders.filter((o) => o.paymentStatus !== 'paid');
      const due = round2(unpaid.reduce((a, o) => a + o.total, 0));
      foot.classList.remove('hidden');
      foot.innerHTML = `<div class="totals"><div class="row"><span class="muted">Table total</span><span class="tnum">${money(s.bill)}</span></div>
        <div class="row grand"><span>Amount due</span><span class="tnum">${money(due)}</span></div></div>
        <div class="row mt">
          ${s.openOrders.length || t.status === 'occupied' ? `<button class="btn btn-outline btn-lg" data-close-table title="Close table">${icon('door-open', 20)}</button>` : ''}
          <button class="btn btn-primary btn-lg grow" data-pay ${due > 0 ? '' : 'disabled'}>${due > 0 ? `Charge ${money(due)}` : 'Nothing to charge'}</button></div>`;

      box.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => openOrderDetail(b.dataset.o, ctx)));
      box.querySelectorAll('[data-g]').forEach((b) =>
        b.addEventListener('click', () => {
          const g = Math.max(0, Math.min(30, (t.guests || 0) + Number(b.dataset.g)));
          store.update('tables', t.id, { guests: g, ...(g > 0 && t.status === 'available' ? { status: 'occupied' } : {}) });
        })
      );
      box.querySelector('[data-reserve]')?.addEventListener('click', () => reserve(t));
      box.querySelector('[data-unreserve]')?.addEventListener('click', () => store.update('tables', t.id, { status: 'available', reservedFor: '' }).then(() => toast('Reservation cancelled.', 'success')));
      box.querySelector('[data-qr]')?.addEventListener('click', () => showQR(t));
      box.querySelector('[data-edit]')?.addEventListener('click', () => editTable(t));
      foot.querySelector('[data-pay]')?.addEventListener('click', () =>
        paymentModal({
          total: due,
          settings: live.settings,
          title: `Settle Table ${t.number}`,
          onConfirm: async (p) => {
            for (const o of unpaid) {
              // cash given applies to the whole bill; store per-order without change
              await markPaid(o, { method: p.method, ref: p.ref, by: ctx.user.name, settings: live.settings });
            }
            toast(`Table ${t.number} settled: ${money(due)}${p.cashReceived != null ? ` · change ${money(Math.max(0, p.cashReceived - due))}` : ''}`, 'success', { timeout: 6000 });
          },
        })
      );
      foot.querySelector('[data-close-table]')?.addEventListener('click', () => closeTable(t, s));
    }

    async function closeTable(t, s) {
      const unpaid = s.openOrders.filter((o) => o.paymentStatus !== 'paid');
      if (unpaid.length && !(await confirmDialog({ title: 'Close with unpaid orders?', message: `${unpaid.length} order(s) are still unpaid. Close Table ${t.number} anyway?`, confirmText: 'Close table', danger: true }))) return;
      if (!unpaid.length && !(await confirmDialog({ title: `Close Table ${t.number}?`, message: 'Open orders will be marked completed and the table set to available.', confirmText: 'Close table' }))) return;
      for (const o of s.openOrders) {
        if (isOpen(o)) await updateStatus(o, 'completed', ctx.user.name, live.settings);
        await store.update('orders', o.id, { tableClosed: true });
      }
      await store.update('tables', t.id, { status: 'available', guests: 0, reservedFor: '' });
      toast(`Table ${t.number} is now available.`, 'success');
    }

    function reserve(t) {
      const { el, close } = openModal({
        title: `Reserve Table ${t.number}`,
        size: 'sm',
        body: `<form class="form" data-f><label class="field"><span>Name & time</span><input class="input" name="r" required maxlength="80" placeholder="e.g. Aina · 7:30 PM · 4 pax"></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Reserve</button>`,
      });
      el.querySelector('[data-ok]').onclick = async () => {
        const r = el.querySelector('[name=r]').value.trim();
        if (!r) return toast('Enter reservation details.', 'error');
        await store.update('tables', t.id, { status: 'reserved', reservedFor: r });
        toast(`Table ${t.number} reserved.`, 'success');
        close();
      };
    }

    function showQR(t) {
      const url = tableUrl(live.settings, t);
      openModal({
        title: `Table ${t.number} QR`,
        size: 'sm',
        body: `<div class="qr-card"><div class="qr-img" style="width:240px;height:240px">${qrSVG(url, { size: 224 })}</div><a class="qr-url" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
          <a class="btn btn-soft" href="#/qr">${icon('printer', 18)} Print QR codes</a></div>`,
      });
    }

    async function addTable() {
      tableForm(null, sections(), async (v) => {
        if (live.tables.some((t) => t.number === v.number)) return toast('A table with this number already exists.', 'error'), false;
        const id = 'T' + v.number + (live.tables.some((t) => t.id === 'T' + v.number) ? '-' + uid(4) : '');
        await store.set('tables', id, { ...v, status: 'available', guests: 0, reservedFor: '' });
        toast(`Table ${v.number} added.`, 'success');
      });
    }
    function editTable(t) {
      tableForm(t, sections(), async (v) => {
        if (live.tables.some((x) => x.number === v.number && x.id !== t.id)) return toast('Another table already uses this number.', 'error'), false;
        await store.update('tables', t.id, v);
        toast('Table updated.', 'success');
      });
    }

    function manageMenu() {
      const { el, close } = openModal({
        title: 'Manage Tables',
        size: 'md',
        body: `<div class="row between mb"><span class="muted small">${live.tables.length} tables · ${sections().length} sections</span><button class="btn btn-primary btn-sm" data-add>${icon('plus', 16)} Add Table</button></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>Table</th><th>Section</th><th>Seats</th><th></th></tr></thead><tbody>
          ${sorted()
            .map((t) => `<tr><td><b>${esc(t.number)}</b></td><td>${esc(t.section || '')}</td><td>${t.seats || 2}</td><td class="right nowrap"><button class="icon-btn sm" data-e="${esc(t.id)}" aria-label="Edit">${icon('pencil', 16)}</button><button class="icon-btn sm danger" data-d="${esc(t.id)}" aria-label="Delete">${icon('trash-2', 16)}</button></td></tr>`)
            .join('')}</tbody></table></div>`,
      });
      el.querySelector('[data-add]').onclick = () => {
        close();
        addTable();
      };
      el.querySelectorAll('[data-e]').forEach((b) =>
        b.addEventListener('click', () => {
          close();
          editTable(live.tables.find((t) => t.id === b.dataset.e));
        })
      );
      el.querySelectorAll('[data-d]').forEach((b) =>
        b.addEventListener('click', async () => {
          const t = live.tables.find((x) => x.id === b.dataset.d);
          const s = tableState(t, live.orders);
          if (s.openOrders.length) return toast('This table has open orders. Close it first.', 'warning');
          if (!(await confirmDialog({ title: `Delete Table ${t.number}?`, message: 'Its QR code will stop working.', confirmText: 'Delete', danger: true }))) return;
          await store.remove('tables', t.id);
          if (selected === t.id) selected = '';
          toast('Table deleted.', 'success');
          close();
        })
      );
    }

    root.querySelectorAll('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        view = b.dataset.v;
        localStorage.setItem('tapjerr:tables-view', view);
        renderSections();
        renderTables();
      })
    );
    $('[data-manage]')?.addEventListener('click', manageMenu);
    $('[data-close-sheet]').addEventListener('click', () => left.classList.remove('open'));

    const unsub = live.on(['tables', 'orders'], () => {
      renderSections();
      renderSummary();
      renderTables();
      renderDetail();
    });
    return unsub;
  },
};
