// TAPJERR.io — digital receipt rendering & printing
import { esc, money, fmtDateTime } from './utils.js';
import { orderTypeLabel, paymentMethodName, PAYMENT_META } from './orders.js';

export function receiptHTML(o, s) {
  const line = (l, r, cls = '') => `<div class="r-row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  return `<div class="receipt">
    <div class="r-center">
      ${s.receipt?.showLogo && s.logo ? `<img class="r-logo" src="${esc(s.logo)}" alt="">` : ''}
      <div class="r-big">${esc(s.name)}</div>
      ${s.receipt?.showAddress && s.address ? `<div>${esc(s.address)}</div>` : ''}
      ${s.phone ? `<div>Tel: ${esc(s.phone)}</div>` : ''}
      ${s.receipt?.header ? `<div style="margin-top:6px">${esc(s.receipt.header)}</div>` : ''}
    </div>
    <div class="r-sep"></div>
    ${line('Order', `<b>${esc(o.orderNo)}</b>`)}
    ${line('Date', esc(fmtDateTime(o.createdAt)))}
    ${line('Type', esc(orderTypeLabel(o)))}
    ${o.customer?.name ? line('Customer', esc(o.customer.name)) : ''}
    ${o.cashierName ? line('Cashier', esc(o.cashierName)) : ''}
    <div class="r-sep"></div>
    ${o.items
      .map(
        (i) => `${line(`${i.qty} × ${esc(i.name)}`, money(i.price * i.qty))}
        ${i.options?.length ? `<div class="r-sub">${esc(i.options.map((x) => x.name).join(', '))}</div>` : ''}
        ${i.note ? `<div class="r-sub">“${esc(i.note)}”</div>` : ''}`
      )
      .join('')}
    <div class="r-sep"></div>
    ${line('Subtotal', money(o.subtotal))}
    ${o.discount?.amount ? line(`Discount${o.discount.label ? ` (${esc(o.discount.label)})` : ''}`, '-' + money(o.discount.amount)) : ''}
    ${o.serviceCharge ? line(`Service charge (${s.serviceRate}%)`, money(o.serviceCharge)) : ''}
    ${o.tax ? line(`${esc(s.taxLabel)} (${s.taxRate}%)`, money(o.tax)) : ''}
    ${o.rounding ? line('Rounding', money(o.rounding)) : ''}
    ${line('TOTAL', money(o.total), 'r-big')}
    <div class="r-sep"></div>
    ${line('Payment', esc(paymentMethodName(s, o.paymentMethod)))}
    ${line('Status', esc(PAYMENT_META[o.paymentStatus]?.label || o.paymentStatus))}
    ${o.paymentRef ? line('Reference', esc(o.paymentRef)) : ''}
    ${o.cashReceived != null && o.paymentMethod === 'cash' ? line('Cash', money(o.cashReceived)) + line('Change', money(o.change || 0)) : ''}
    <div class="r-sep"></div>
    <div class="r-center">${esc(s.receipt?.footer || '')}</div>
    <div class="r-center" style="margin-top:6px;font-size:11px;color:#777">Powered by TAPJERR.io</div>
  </div>`;
}

export function printReceipt(o, s) {
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) {
    alert('Please allow pop-ups to print receipts.');
    return;
  }
  const css = `body{margin:0;padding:12px;font-family:ui-monospace,Menlo,Consolas,monospace;background:#fff}
    .receipt{font-size:12.5px;max-width:300px;margin:0 auto;color:#111}
    .r-center{text-align:center}.r-row{display:flex;justify-content:space-between;gap:8px}
    .r-sep{border-top:1px dashed #999;margin:8px 0}.r-big{font-size:15px;font-weight:700}
    .r-logo{width:50px;height:50px;object-fit:contain;margin:0 auto 6px;display:block}.r-sub{color:#555;padding-left:10px;font-size:11.5px}
    @page{margin:6mm}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.orderNo)}</title><style>${css}</style></head><body>${receiptHTML(o, s)}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\/script></body></html>`);
  w.document.close();
}
