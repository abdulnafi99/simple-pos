// TAPJERR.io — Products & Menu management
import { icon } from '../../core/icons.js';
import { esc, money, uid, debounce, round2 } from '../../core/utils.js';
import { openModal, toast, confirmDialog, emptyState, withBusy, promptDialog } from '../../core/ui.js';
import { productImage } from '../../core/seed.js';
import { pageHead } from '../common.js';

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let cat = 'all';
    let q = '';
    root.innerHTML = `
      ${pageHead('Products & Menu', 'Manage what customers and cashiers see — prices, photos, variations and availability.', `<button class="btn btn-outline" data-cats>${icon('folder-tree', 18)} Categories</button><button class="btn btn-primary" data-add>${icon('plus', 18)} Add product</button>`)}
      <div class="toolbar"><div class="input-icon">${icon('search', 18)}<input class="input" placeholder="Search products" data-q></div><div class="chips" data-chips></div></div>
      <div class="card" style="padding:8px" data-list></div>`;
    const $ = (s) => root.querySelector(s);
    const catName = (id) => live.categories.find((c) => c.id === id)?.name || 'Uncategorised';

    function render() {
      const cats = [...live.categories].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      $('[data-chips]').innerHTML = [{ id: 'all', name: 'All' }, ...cats]
        .map((c) => `<button class="chip ${cat === c.id ? 'active' : ''}" data-c="${esc(c.id)}">${esc(c.name)} <span class="count">${live.products.filter((p) => c.id === 'all' || p.categoryId === c.id).length}</span></button>`)
        .join('');
      root.querySelectorAll('[data-c]').forEach((b) =>
        b.addEventListener('click', () => {
          cat = b.dataset.c;
          render();
        })
      );
      const list = live.products
        .filter((p) => cat === 'all' || p.categoryId === cat)
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .sort((a, b) => catName(a.categoryId).localeCompare(catName(b.categoryId)) || (a.sort || 0) - (b.sort || 0));
      if (!live.products.length) {
        $('[data-list]').innerHTML = emptyState({ iconName: 'coffee', title: 'No Item Yet', text: 'Start adding your first item and run your business today.', action: `<button class="btn btn-primary btn-lg" data-add2>Create Item</button>` });
        $('[data-add2]').onclick = () => edit(null);
        return;
      }
      $('[data-list]').innerHTML = `<div class="table-wrap"><table class="data menu-table"><thead><tr><th></th><th>Product</th><th>Category</th><th class="num">Price</th><th>Options</th><th>Available</th><th>Sold out</th><th></th></tr></thead><tbody>
        ${list
          .map(
            (p) => `<tr>
          <td><img src="${esc(productImage(p))}" alt="" loading="lazy"></td>
          <td><b>${esc(p.name)}</b> ${p.featured ? `<span class="badge tone-indigo">Featured</span>` : ''} ${p.popular ? `<span class="badge tone-amber">Popular</span>` : ''}<div class="tiny muted truncate" style="max-width:280px">${esc(p.description || '')}</div></td>
          <td>${esc(catName(p.categoryId))}</td>
          <td class="num"><b>${money(p.price)}</b></td>
          <td class="small muted">${(p.optionGroups || []).map((g) => esc(g.name)).join(', ') || '—'}</td>
          <td><label class="switch"><input type="checkbox" data-en="${esc(p.id)}" ${p.enabled !== false ? 'checked' : ''}><span class="track"></span></label></td>
          <td><label class="switch"><input type="checkbox" data-so="${esc(p.id)}" ${p.soldOut ? 'checked' : ''}><span class="track" style="${p.soldOut ? 'background:var(--red)' : ''}"></span></label></td>
          <td class="right nowrap"><button class="icon-btn sm" data-e="${esc(p.id)}" aria-label="Edit">${icon('pencil', 16)}</button><button class="icon-btn sm" data-dup="${esc(p.id)}" aria-label="Duplicate">${icon('copy', 16)}</button><button class="icon-btn sm danger" data-d="${esc(p.id)}" aria-label="Delete">${icon('trash-2', 16)}</button></td>
        </tr>`
          )
          .join('')}</tbody></table></div>
        ${list.length ? '' : emptyState({ iconName: 'search-x', title: 'No matching products' })}`;
      root.querySelectorAll('[data-en]').forEach((c) =>
        c.addEventListener('change', async () => {
          await store.update('products', c.dataset.en, { enabled: c.checked });
          toast(c.checked ? 'Product enabled.' : 'Product hidden from menus.', 'success');
        })
      );
      root.querySelectorAll('[data-so]').forEach((c) =>
        c.addEventListener('change', async () => {
          await store.update('products', c.dataset.so, { soldOut: c.checked });
          toast(c.checked ? 'Marked as sold out.' : 'Back in stock.', 'success');
        })
      );
      root.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => edit(live.products.find((p) => p.id === b.dataset.e))));
      root.querySelectorAll('[data-dup]').forEach((b) =>
        b.addEventListener('click', async () => {
          const p = live.products.find((x) => x.id === b.dataset.dup);
          const id = uid(12);
          await store.set('products', id, { ...structuredClone(p), id, name: p.name + ' (copy)', enabled: false, createdAt: Date.now() });
          toast('Product duplicated (hidden until you enable it).', 'success');
        })
      );
      root.querySelectorAll('[data-d]').forEach((b) =>
        b.addEventListener('click', async () => {
          const p = live.products.find((x) => x.id === b.dataset.d);
          if (!(await confirmDialog({ title: `Delete ${p.name}?`, message: 'Past orders keep their item details. This cannot be undone.', confirmText: 'Delete', danger: true }))) return;
          await store.remove('products', p.id);
          toast('Product deleted.', 'success');
        })
      );
    }

    function edit(product) {
      const p = product ? structuredClone(product) : { name: '', description: '', price: '', categoryId: cat !== 'all' ? cat : live.categories[0]?.id || '', image: '', enabled: true, soldOut: false, featured: false, popular: false, optionGroups: [], recipe: [], sort: 0 };
      const cats = [...live.categories].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const { el, close } = openModal({
        title: product ? `Edit ${product.name}` : 'Add product',
        size: 'lg',
        body: `<form class="form" data-f novalidate>
          <div class="img-drop"><img data-img src="${esc(productImage(p))}" alt="">
            <div class="col"><label class="btn btn-outline">${icon('image-up', 18)} Upload photo<input type="file" accept="image/*" hidden data-file></label>
            <button type="button" class="btn btn-ghost btn-sm" data-rmimg ${p.image ? '' : 'hidden'}>Remove photo</button>
            <span class="tiny muted">JPG/PNG, square works best. ${ctx.cloud ? 'Stored in Firebase Storage.' : 'Resized & stored in this browser (Demo Mode).'}</span></div></div>
          <div class="form-grid">
            <label class="field span-2"><span>Product name *</span><input class="input" name="name" required maxlength="60" value="${esc(p.name)}"></label>
            <label class="field"><span>Price (RM) *</span><input class="input" name="price" type="number" step="0.01" min="0" required value="${p.price}"></label>
            <label class="field"><span>Category</span><select class="select" name="categoryId">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ New category…</option></select></label>
            <label class="field span-2"><span>Description</span><textarea class="textarea" name="description" maxlength="240" rows="2">${esc(p.description || '')}</textarea></label>
            <label class="field"><span>Sort order</span><input class="input" name="sort" type="number" value="${p.sort || 0}"></label>
            <div class="field"><span>Display</span><div class="row wrap">
              <label class="check"><input type="checkbox" name="enabled" ${p.enabled !== false ? 'checked' : ''}> Available</label>
              <label class="check"><input type="checkbox" name="soldOut" ${p.soldOut ? 'checked' : ''}> Sold out</label>
              <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Featured</label>
              <label class="check"><input type="checkbox" name="popular" ${p.popular ? 'checked' : ''}> Popular</label></div></div>
          </div>
          <div><div class="row between mb"><b>Variations & add-ons</b><button type="button" class="btn btn-sm btn-soft" data-add-group>${icon('plus', 14)} Add option group</button></div><div class="col" data-groups></div></div>
          ${live.inventory.length ? `<div><div class="row between mb"><b>Recipe (inventory deduction)</b><button type="button" class="btn btn-sm btn-soft" data-add-ing>${icon('plus', 14)} Add ingredient</button></div><div class="col" data-recipe></div><p class="tiny muted">Ingredients are deducted from stock when an order is completed (toggle in Settings).</p></div>` : ''}
        </form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>${icon('check', 18)} Save product</button>`,
      });
      const f = el.querySelector('[data-f]');

      // Image upload
      el.querySelector('[data-file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const img = el.querySelector('[data-img]');
        img.style.opacity = 0.4;
        try {
          p.image = await store.uploadImage(file, 'products');
          img.src = p.image;
          el.querySelector('[data-rmimg]').hidden = false;
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          img.style.opacity = 1;
        }
      });
      el.querySelector('[data-rmimg]').addEventListener('click', (e) => {
        p.image = '';
        el.querySelector('[data-img]').src = productImage({ ...p, name: f.name.value });
        e.target.hidden = true;
      });
      f.categoryId.addEventListener('change', async () => {
        if (f.categoryId.value !== '__new') return;
        const name = await promptDialog({ title: 'New category', label: 'Category name' });
        if (!name) return (f.categoryId.value = p.categoryId || cats[0]?.id || '');
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid(6);
        await store.set('categories', id, { name, sort: live.categories.length + 1 });
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        f.categoryId.insertBefore(opt, f.categoryId.lastElementChild);
        f.categoryId.value = id;
      });

      // Option groups editor
      const groupsBox = el.querySelector('[data-groups]');
      const renderGroups = () => {
        groupsBox.innerHTML = p.optionGroups.length
          ? p.optionGroups
              .map(
                (g, gi) => `<div class="og-editor">
              <div class="row wrap"><input class="input grow" style="height:38px" data-gname="${gi}" value="${esc(g.name)}" placeholder="Group name (e.g. Size)">
                <select class="select" style="height:38px;width:auto" data-gtype="${gi}"><option value="single" ${g.type !== 'multi' ? 'selected' : ''}>Choose one</option><option value="multi" ${g.type === 'multi' ? 'selected' : ''}>Choose many</option></select>
                <label class="check small"><input type="checkbox" data-greq="${gi}" ${g.required ? 'checked' : ''}> Required</label>
                <button type="button" class="icon-btn sm danger" data-gdel="${gi}" aria-label="Remove group">${icon('trash-2', 16)}</button></div>
              ${g.options.map((o, oi) => `<div class="og-opt"><input class="input" data-oname="${gi}:${oi}" value="${esc(o.name)}" placeholder="Option"><input class="input" type="number" step="0.1" data-oprice="${gi}:${oi}" value="${o.price}" placeholder="+RM"><button type="button" class="icon-btn sm" data-odel="${gi}:${oi}" aria-label="Remove option">${icon('x', 16)}</button></div>`).join('')}
              <button type="button" class="btn btn-sm btn-ghost" data-oadd="${gi}">${icon('plus', 14)} Add option</button></div>`
              )
              .join('')
          : `<p class="small muted">No variations. Add groups like Size, Milk, Sweetness or Add-ons.</p>`;
        groupsBox.querySelectorAll('[data-gname]').forEach((i) => i.addEventListener('input', () => (p.optionGroups[i.dataset.gname].name = i.value)));
        groupsBox.querySelectorAll('[data-gtype]').forEach((i) => i.addEventListener('change', () => (p.optionGroups[i.dataset.gtype].type = i.value)));
        groupsBox.querySelectorAll('[data-greq]').forEach((i) => i.addEventListener('change', () => (p.optionGroups[i.dataset.greq].required = i.checked)));
        groupsBox.querySelectorAll('[data-gdel]').forEach((b) =>
          b.addEventListener('click', () => {
            p.optionGroups.splice(Number(b.dataset.gdel), 1);
            renderGroups();
          })
        );
        groupsBox.querySelectorAll('[data-oname]').forEach((i) =>
          i.addEventListener('input', () => {
            const [g, o] = i.dataset.oname.split(':');
            p.optionGroups[g].options[o].name = i.value;
          })
        );
        groupsBox.querySelectorAll('[data-oprice]').forEach((i) =>
          i.addEventListener('input', () => {
            const [g, o] = i.dataset.oprice.split(':');
            p.optionGroups[g].options[o].price = Number(i.value) || 0;
          })
        );
        groupsBox.querySelectorAll('[data-odel]').forEach((b) =>
          b.addEventListener('click', () => {
            const [g, o] = b.dataset.odel.split(':');
            p.optionGroups[g].options.splice(Number(o), 1);
            renderGroups();
          })
        );
        groupsBox.querySelectorAll('[data-oadd]').forEach((b) =>
          b.addEventListener('click', () => {
            p.optionGroups[b.dataset.oadd].options.push({ name: '', price: 0 });
            renderGroups();
          })
        );
      };
      el.querySelector('[data-add-group]').addEventListener('click', () => {
        p.optionGroups.push({ id: uid(6), name: '', type: 'single', required: false, options: [{ name: '', price: 0 }] });
        renderGroups();
      });
      renderGroups();

      // Recipe editor
      const recipeBox = el.querySelector('[data-recipe]');
      const renderRecipe = () => {
        if (!recipeBox) return;
        recipeBox.innerHTML = (p.recipe || []).length
          ? p.recipe
              .map(
                (r, ri) => `<div class="og-opt" style="grid-template-columns:1fr 120px 36px"><select class="select" style="height:38px" data-rinv="${ri}">${live.inventory.map((i) => `<option value="${esc(i.id)}" ${i.id === r.inventoryId ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select>
            <input class="input" type="number" min="0" step="0.1" data-rqty="${ri}" value="${r.qty}"><button type="button" class="icon-btn sm" data-rdel="${ri}" aria-label="Remove">${icon('x', 16)}</button></div>`
              )
              .join('')
          : `<p class="small muted">No ingredients linked.</p>`;
        recipeBox.querySelectorAll('[data-rinv]').forEach((s) => s.addEventListener('change', () => (p.recipe[s.dataset.rinv].inventoryId = s.value)));
        recipeBox.querySelectorAll('[data-rqty]').forEach((s) => s.addEventListener('input', () => (p.recipe[s.dataset.rqty].qty = Number(s.value) || 0)));
        recipeBox.querySelectorAll('[data-rdel]').forEach((b) =>
          b.addEventListener('click', () => {
            p.recipe.splice(Number(b.dataset.rdel), 1);
            renderRecipe();
          })
        );
      };
      el.querySelector('[data-add-ing]')?.addEventListener('click', () => {
        p.recipe = p.recipe || [];
        p.recipe.push({ inventoryId: live.inventory[0].id, qty: 1 });
        renderRecipe();
      });
      renderRecipe();

      el.querySelector('[data-ok]').addEventListener('click', (e) => {
        const name = f.name.value.trim();
        const price = Number(f.price.value);
        f.name.classList.toggle('invalid', !name);
        f.price.classList.toggle('invalid', f.price.value === '' || !(price >= 0));
        if (!name || f.price.value === '' || !(price >= 0)) return toast('Product name and a valid price are required.', 'error');
        const groups = p.optionGroups
          .map((g) => ({ ...g, name: g.name.trim(), options: g.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), price: round2(o.price) })) }))
          .filter((g) => g.name && g.options.length);
        if (groups.length !== p.optionGroups.length) {
          if (p.optionGroups.some((g) => !g.name.trim() || !g.options.some((o) => o.name.trim()))) return toast('Each option group needs a name and at least one option (or remove it).', 'error');
        }
        const data = {
          ...p,
          name,
          price: round2(price),
          description: f.description.value.trim(),
          categoryId: f.categoryId.value === '__new' ? '' : f.categoryId.value,
          sort: Number(f.sort.value) || 0,
          enabled: f.enabled.checked,
          soldOut: f.soldOut.checked,
          featured: f.featured.checked,
          popular: f.popular.checked,
          optionGroups: groups,
          recipe: (p.recipe || []).filter((r) => r.inventoryId && r.qty > 0),
          updatedAt: Date.now(),
        };
        withBusy(e.currentTarget, async () => {
          try {
            if (product) await store.set('products', product.id, data);
            else {
              const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + uid(4).toLowerCase();
              await store.set('products', id, { ...data, createdAt: Date.now() });
            }
            toast(`${name} saved.`, 'success');
            close();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    }

    function categories() {
      const { el } = openModal({ title: 'Categories', size: 'sm', body: '<div data-cl></div>', footer: `<button class="btn btn-primary" data-new>${icon('plus', 16)} Add category</button>` });
      const render = () => {
        const cats = [...live.categories].sort((a, b) => (a.sort || 0) - (b.sort || 0));
        el.querySelector('[data-cl]').innerHTML = cats.length
          ? `<div class="col">${cats
              .map(
                (c, i) => `<div class="row card flat" style="padding:10px 12px"><b class="grow">${esc(c.name)}</b><span class="tiny muted">${live.products.filter((p) => p.categoryId === c.id).length} items</span>
            <button class="icon-btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('arrow-up', 16)}</button>
            <button class="icon-btn sm" data-rn="${esc(c.id)}" aria-label="Rename">${icon('pencil', 16)}</button>
            <button class="icon-btn sm danger" data-del="${esc(c.id)}" aria-label="Delete">${icon('trash-2', 16)}</button></div>`
              )
              .join('')}</div>`
          : emptyState({ iconName: 'folder', title: 'No categories' });
        el.querySelectorAll('[data-up]').forEach((b) =>
          b.addEventListener('click', async () => {
            const i = Number(b.dataset.up);
            const ops = cats.map((c, j) => ({ col: 'categories', id: c.id, type: 'update', data: { sort: j === i ? i - 1 : j === i - 1 ? i : j } }));
            await store.batch(ops);
            render();
          })
        );
        el.querySelectorAll('[data-rn]').forEach((b) =>
          b.addEventListener('click', async () => {
            const c = live.categories.find((x) => x.id === b.dataset.rn);
            const name = await promptDialog({ title: 'Rename category', label: 'Name', value: c.name });
            if (name) {
              await store.update('categories', c.id, { name });
              render();
            }
          })
        );
        el.querySelectorAll('[data-del]').forEach((b) =>
          b.addEventListener('click', async () => {
            const n = live.products.filter((p) => p.categoryId === b.dataset.del).length;
            if (n) return toast(`Move or delete the ${n} product(s) in this category first.`, 'warning');
            if (!(await confirmDialog({ title: 'Delete category?', confirmText: 'Delete', danger: true }))) return;
            await store.remove('categories', b.dataset.del);
            render();
          })
        );
      };
      el.querySelector('[data-new]').addEventListener('click', async () => {
        const name = await promptDialog({ title: 'New category', label: 'Category name' });
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid(6);
        await store.set('categories', live.categories.some((c) => c.id === id) ? id + '-' + uid(3) : id, { name, sort: live.categories.length + 1 });
        toast('Category added.', 'success');
        setTimeout(render, 50);
      });
      render();
    }

    $('[data-add]').onclick = () => edit(null);
    $('[data-cats]').onclick = categories;
    $('[data-q]').addEventListener(
      'input',
      debounce((e) => {
        q = e.target.value.trim().toLowerCase();
        render();
      }, 120)
    );
    const unsub = live.on(['products', 'categories'], render);
    if (ctx.params.get('new')) setTimeout(() => edit(null), 50);
    return unsub;
  },
};
