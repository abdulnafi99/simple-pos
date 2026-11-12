// TAPJERR.io — Staff management & role-based permissions
import { icon } from '../../core/icons.js';
import { esc, initials, fmtDate, validEmail } from '../../core/utils.js';
import { openModal, toast, confirmDialog, withBusy, emptyState } from '../../core/ui.js';
import { ROLES, PAGE_ACCESS } from '../../core/permissions.js';
import { pageHead } from '../common.js';
import { PAGES } from '../app.js';

export default {
  render(root, ctx) {
    const { live, store, user } = ctx;
    const isSuper = ctx.role === 'super_admin';
    root.innerHTML = `
      ${pageHead('Staff', 'Create accounts and control what each role can access.', `<button class="btn btn-primary" data-add>${icon('user-plus', 18)} Add staff</button>`)}
      <div class="card mb" style="padding:8px" data-list></div>
      <div class="card"><div class="card-head"><h3>Role permissions</h3><span class="small muted">Enforced in the app and by Firestore security rules</span></div><div data-matrix></div></div>`;
    const $ = (s) => root.querySelector(s);
    const canEdit = (s) => s.id !== user.id && (isSuper || s.role !== 'super_admin');
    const roleOptions = (cur) => Object.entries(ROLES).filter(([k]) => isSuper || k !== 'super_admin').map(([k, r]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(r.label)}</option>`).join('');

    function render() {
      const list = [...live.staff].sort((a, b) => Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role) || a.name.localeCompare(b.name));
      $('[data-list]').innerHTML = list.length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>
          ${list
            .map(
              (s) => `<tr><td><div class="row"><span class="avatar">${esc(initials(s.name))}</span><b>${esc(s.name)}</b>${s.id === user.id ? '<span class="badge">You</span>' : ''}${s.demoAccount ? '<span class="badge tone-amber">Demo</span>' : ''}</div></td>
            <td class="small">${esc(s.email)}</td><td><span class="badge tone-${ROLES[s.role]?.tone || 'gray'}">${esc(ROLES[s.role]?.label || s.role)}</span></td>
            <td>${s.active !== false ? '<span class="badge tone-green">Active</span>' : '<span class="badge tone-gray">Deactivated</span>'}</td><td class="small muted">${esc(fmtDate(s.createdAt))}</td>
            <td class="right nowrap">${canEdit(s) ? `<button class="btn btn-sm btn-outline" data-e="${esc(s.id)}">${icon('pencil', 14)} Edit</button>` : ''}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : emptyState({ iconName: 'users', title: 'No staff yet' });
      root.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => edit(live.staff.find((s) => s.id === b.dataset.e))));

      const roles = Object.keys(ROLES);
      $('[data-matrix]').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Module</th>${roles.map((r) => `<th class="center">${esc(ROLES[r].label)}</th>`).join('')}</tr></thead><tbody>
        ${PAGES.map((p) => `<tr><td>${icon(p.icon, 16)} ${esc(p.label)}</td>${roles.map((r) => `<td class="center">${PAGE_ACCESS[p.id].includes(r) ? `<span style="color:var(--green)">${icon('check', 18)}</span>` : `<span class="faint">${icon('minus', 18)}</span>`}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="grid-cards mt">${roles.map((r) => `<div class="card flat"><span class="badge tone-${ROLES[r].tone}">${esc(ROLES[r].label)}</span><p class="small muted mt">${esc(ROLES[r].desc)}</p></div>`).join('')}</div>`;
    }

    function add() {
      const { el, close } = openModal({
        title: 'Add staff account',
        size: 'md',
        body: `<form class="form-grid" data-f novalidate>
          <label class="field span-2"><span>Full name *</span><input class="input" name="name" required maxlength="60"></label>
          <label class="field span-2"><span>Email (login) *</span><input class="input" name="email" type="email" required autocomplete="off"></label>
          <label class="field"><span>Temporary password *</span><input class="input" name="password" type="text" minlength="6" required autocomplete="new-password" placeholder="min. 6 characters"></label>
          <label class="field"><span>Role</span><select class="select" name="role">${roleOptions('cashier')}</select></label>
          <p class="tiny muted span-2">${ctx.cloud ? 'A Firebase Authentication account is created. Share the temporary password securely and ask them to change it via "Forgot password".' : 'Demo Mode: the account is stored in this browser only.'}</p></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Create account</button>`,
      });
      el.querySelector('[data-ok]').onclick = (e) => {
        const f = el.querySelector('[data-f]');
        const name = f.name.value.trim();
        const email = f.email.value.trim().toLowerCase();
        const pw = f.password.value;
        f.name.classList.toggle('invalid', !name);
        f.email.classList.toggle('invalid', !validEmail(email));
        f.password.classList.toggle('invalid', pw.length < 6);
        if (!name || !validEmail(email) || pw.length < 6) return toast('Fill in name, a valid email and a password of 6+ characters.', 'error');
        if (f.role.value === 'super_admin' && !isSuper) return toast('Only a Super Admin can create Super Admins.', 'error');
        withBusy(e.currentTarget, async () => {
          try {
            await store.auth.createAccount(email, pw, { name, role: f.role.value, createdBy: user.id });
            toast(`${name} can now sign in as ${ROLES[f.role.value].label}.`, 'success', { title: 'Staff account created' });
            close();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      };
    }

    function edit(s) {
      const { el, close } = openModal({
        title: `Edit ${s.name}`,
        size: 'md',
        body: `<form class="form-grid" data-f>
          <label class="field span-2"><span>Full name</span><input class="input" name="name" value="${esc(s.name)}" maxlength="60"></label>
          <label class="field"><span>Role</span><select class="select" name="role">${roleOptions(s.role)}</select></label>
          <label class="field"><span>Status</span><select class="select" name="active"><option value="1" ${s.active !== false ? 'selected' : ''}>Active</option><option value="0" ${s.active === false ? 'selected' : ''}>Deactivated</option></select></label>
          <div class="span-2"><div class="label mb">Password</div>
            ${ctx.cloud ? `<button type="button" class="btn btn-outline btn-sm" data-reset>${icon('mail', 14)} Send password reset email</button>` : `<div class="row"><input class="input grow" data-newpw placeholder="New password (min 6)"><button type="button" class="btn btn-outline" data-setpw>Set</button></div>`}</div></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save changes</button>`,
      });
      el.querySelector('[data-reset]')?.addEventListener('click', async () => {
        try {
          await store.auth.sendReset(s.email);
          toast(`Reset email sent to ${s.email}.`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      el.querySelector('[data-setpw]')?.addEventListener('click', async () => {
        const pw = el.querySelector('[data-newpw]').value;
        if (pw.length < 6) return toast('Password must be at least 6 characters.', 'error');
        try {
          await store.auth.changePassword(s.email, pw);
          toast('Password updated.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      el.querySelector('[data-ok]').onclick = async () => {
        const f = el.querySelector('[data-f]');
        const active = f.active.value === '1';
        if (!active && !(await confirmDialog({ title: `Deactivate ${s.name}?`, message: 'They will be signed out and unable to access the dashboard.', confirmText: 'Deactivate', danger: true }))) return;
        await store.update('staff', s.id, { name: f.name.value.trim() || s.name, role: f.role.value, active });
        toast('Staff updated.', 'success');
        close();
      };
    }

    $('[data-add]').onclick = add;
    return live.on('staff', render);
  },
};
