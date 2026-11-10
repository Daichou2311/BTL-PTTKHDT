/* Quản lý cửa hàng điện thoại - bản web minh họa (jQuery + localStorage) */
$(function () {
  const KEY = 'phonestore_v1';
  const PERM = {
    stock: ['SALES', 'STOCK', 'TECH', 'MANAGER'], receipt: ['STOCK', 'MANAGER'], sale: ['SALES', 'MANAGER'],
    return: ['MANAGER'], warranty: ['TECH', 'MANAGER'], report: ['MANAGER'], catalog: ['MANAGER']
  };
  const TABS = { stock: 'Tra cứu tồn kho', receipt: 'Nhập hàng', sale: 'Bán hàng', return: 'Trả hàng', warranty: 'Bảo hành', report: 'Báo cáo', catalog: 'Danh mục' };
  const NEXT = { RECEIVED: 'PROCESSING', PROCESSING: 'READY', READY: 'CLOSED' };
  let DB, U = null, rDraft = [], sDraft = [];

  /* ---------- Tiện ích ---------- */
  const vnd = n => Number(n).toLocaleString('vi-VN') + ' ₫';
  const esc = s => $('<i>').text(s == null ? '' : s).html();
  const today = () => $('#bizdate').val();
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const can = k => !!U && PERM[k].includes(U.role);
  const must = (c, m) => { if (!c) throw new Error(m); };
  const byId = (arr, id) => arr.find(x => x.id == id);
  const nid = (d, k) => d.seq[k] = (d.seq[k] || 0) + 1;
  const log = (d, a, ref) => d.audit.push({ user: U.username, action: a, ref, at: new Date().toISOString() });
  const save = () => localStorage.setItem(KEY, JSON.stringify(DB));
  const findUnit = (list, c) => list.find(u => u.barcode === c || u.imei === c);
  const lineOf = (d, b) => {
    for (const s of d.sales) { const l = s.lines.find(x => x.barcode === b); if (l) return { sale: s, line: l }; }
    return {};
  };
  const badge = s => `<span class="badge text-bg-${{ AVAILABLE: 'success', SOLD: 'secondary', QUARANTINED: 'warning' }[s] || 'info'}">${s}</span>`;
  const msg = (t, type = 'success') => $('#msg').html(`<div class="alert alert-${type} py-2">${esc(t)}</div>`);

  function tbl(h, rows) {
    const body = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${h.length}" class="text-muted">Chưa có dữ liệu</td></tr>`;
    return `<div class="table-responsive"><table class="table table-sm table-striped align-middle"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function opts(sel, items) {
    const v = $(sel).val();
    $(sel).html(items.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join(''));
    if (v != null && items.some(i => i[0] == v)) $(sel).val(v);
  }

  /* Giao dịch: làm việc trên bản sao, chỉ ghi khi không lỗi (COMMIT), lỗi thì bỏ hết (ROLLBACK) */
  function tx(fn) {
    const d = JSON.parse(JSON.stringify(DB));
    try { const r = fn(d); DB = d; save(); return r; }
    catch (e) { msg(e.message, 'danger'); return null; }
  }

  /* ---------- Dữ liệu mẫu ---------- */
  function seed() {
    const un = (b, pid, imei, cost) => ({ barcode: b, product_id: pid, receipt_id: 1, imei, cost, status: 'AVAILABLE' });
    const acc = [['sales', 'sales123', 'SALES'], ['stock', 'stock123', 'STOCK'], ['tech', 'tech123', 'TECH'], ['manager', 'manager123', 'MANAGER']];
    const prd = [[1, 'A-128-DEN', 'Điện thoại A 128GB Đen', 'PHONE', 10000000, 365],
                 [2, 'B-256-XANH', 'Điện thoại B 256GB Xanh', 'PHONE', 7000000, 365],
                 [3, 'CAP-TYPEC', 'Cáp sạc Type-C 1m', 'ACCESSORY', 200000, 30]];
    return {
      seq: { receipt: 1, customer: 1, supplier: 1, product: 3 },
      users: acc.map(([username, password, role]) => ({ username, password, role, active: true })),
      products: prd.map(([id, sku, name, kind, price, warranty]) => ({ id, sku, name, kind, price, warranty, active: true })),
      units: [un('A001', 1, '350000000000001', 8000000), un('A002', 1, '350000000000002', 8000000),
              un('B001', 2, '350000000000003', 5500000), un('B002', 2, '350000000000004', 5500000),
              un('C001', 3, null, 100000), un('C002', 3, null, 100000), un('C003', 3, null, 100000)],
      customers: [{ id: 1, name: 'Nguyễn Văn An', phone: '0901234567' }],
      suppliers: [{ id: 1, name: 'Công ty Phân phối ABC' }],
      receipts: [{ id: 1, supplier_id: 1, staff: 'stock', date: new Date().toISOString().slice(0, 10) }],
      sales: [], returns: [], warranties: [], audit: []
    };
  }

  /* ---------- UC01: Đăng nhập, phân quyền ---------- */
  $('#loginForm').on('submit', e => {
    e.preventDefault();
    const u = DB.users.find(x => x.username === $('#lu').val().trim() && x.password === $('#lp').val());
    if (!u || !u.active) return $('#loginErr').removeClass('d-none');
    U = u;
    $('#loginErr').addClass('d-none'); $('#login').addClass('d-none'); $('#app').removeClass('d-none');
    $('#who').text(u.username + ' (' + u.role + ')');
    buildTabs(); renderAll();
  });
  $('#logout').click(() => {
    U = null; rDraft = []; sDraft = [];
    $('#app').addClass('d-none'); $('#login').removeClass('d-none'); $('#lp').val('');
  });
  $('#reset').click(() => {
    if (!confirm('Khôi phục dữ liệu mẫu? Mọi thay đổi sẽ mất.')) return;
    DB = seed(); save(); rDraft = []; sDraft = []; renderAll(); msg('Đã khôi phục dữ liệu mẫu', 'info');
  });

  function buildTabs() {
    const ks = Object.keys(TABS).filter(can);
    $('#tabs').html(ks.map(k => `<li class="nav-item"><button class="nav-link" data-tab="${k}">${TABS[k]}</button></li>`).join(''));
    show(ks[0]);
  }
  function show(k) {
    $('#tabs .nav-link').removeClass('active').filter(`[data-tab=${k}]`).addClass('active');
    $('.pane').addClass('d-none'); $('#p-' + k).removeClass('d-none'); $('#msg').empty();
  }
  $('#tabs').on('click', '.nav-link', function () { show($(this).data('tab')); });

  /* ---------- UC02, UC03: Tồn kho và danh mục ---------- */
  function renderStock() {
    const q = ($('#q').val() || '').toLowerCase();
    const cnt = id => DB.units.filter(u => u.product_id == id && u.status === 'AVAILABLE').length;
    $('#stockProducts').html(tbl(['SKU', 'Tên cấu hình', 'Loại', 'Giá bán', 'Còn bán', 'Tình trạng', ''],
      DB.products.map(p => [esc(p.sku), esc(p.name), p.kind, vnd(p.price), cnt(p.id), p.active ? 'Đang kinh doanh' : 'Ngừng kinh doanh',
        can('catalog') ? `<button class="btn btn-sm btn-outline-primary price" data-id="${p.id}">Đổi giá</button> <button class="btn btn-sm btn-outline-secondary toggle" data-id="${p.id}">${p.active ? 'Ngừng KD' : 'Bán lại'}</button>` : ''])));
    const rows = DB.units.filter(u => {
      const p = byId(DB.products, u.product_id);
      return !q || [u.barcode, u.imei, p.sku, p.name].join(' ').toLowerCase().includes(q);
    });
    $('#stockUnits').html(tbl(['Barcode', 'IMEI', 'Sản phẩm', 'Giá nhập', 'Trạng thái'],
      rows.map(u => [u.barcode, u.imei || '-', esc(byId(DB.products, u.product_id).name), vnd(u.cost), badge(u.status)])));
  }
  $('#q').on('input', renderStock);
  $('#stockProducts').on('click', '.price', function () {
    const s = prompt('Giá bán mới (VND):'); if (s === null) return;
    const id = $(this).data('id'), v = Number(s);
    if (tx(d => { must(can('catalog'), 'Không đủ quyền'); must(Number.isInteger(v) && v > 0, 'Giá bán phải là số nguyên > 0'); byId(d.products, id).price = v; log(d, 'PRICE', 'P' + id); return 1; })) { msg('Đã đổi giá'); renderAll(); }
  }).on('click', '.toggle', function () {
    const id = $(this).data('id');
    if (tx(d => { must(can('catalog'), 'Không đủ quyền'); const p = byId(d.products, id); p.active = !p.active; log(d, 'TOGGLE', 'P' + id); return 1; })) renderAll();
  });

  /* ---------- UC05: Nhập hàng ---------- */
  function renderReceipt() {
    opts('#rSup', DB.suppliers.map(s => [s.id, s.name]));
    opts('#rProd', DB.products.filter(p => p.active).map(p => [p.id, p.sku + ' - ' + p.name]));
    $('#rList').html(tbl(['Barcode', 'IMEI', 'Sản phẩm', 'Giá nhập'],
      rDraft.map(i => [esc(i.barcode), esc(i.imei) || '-', esc(byId(DB.products, i.product_id).name), vnd(i.cost)])));
  }
  $('#rAdd').click(() => {
    const code = $('#rCode').val().trim();
    if (!code || !$('#rProd').val()) return msg('Nhập barcode và chọn sản phẩm', 'danger');
    rDraft.push({ barcode: code, product_id: +$('#rProd').val(), imei: $('#rImei').val().trim(), cost: Number($('#rCost').val()) });
    $('#rCode,#rImei,#rCost').val(''); renderReceipt();
  });
  $('#rClear').click(() => { rDraft = []; renderReceipt(); });
  $('#rConfirm').click(() => {
    const r = tx(d => {
      must(can('receipt'), 'Không đủ quyền nhập hàng');
      must(rDraft.length, 'Phiếu nhập chưa có đơn vị nào');
      const sup = byId(d.suppliers, $('#rSup').val()); must(sup, 'Nhà cung cấp không hợp lệ');
      const id = nid(d, 'receipt'); let total = 0;
      rDraft.forEach(i => {
        const p = byId(d.products, i.product_id);
        must(p && p.active, `Sản phẩm của ${i.barcode} đã ngừng kinh doanh`);
        must(!d.units.some(u => u.barcode === i.barcode), `Barcode ${i.barcode} đã tồn tại`);
        if (p.kind === 'PHONE') {
          must(/^[0-9]{15}$/.test(i.imei), `IMEI của ${i.barcode} phải đủ 15 chữ số`);
          must(!d.units.some(u => u.imei === i.imei), `IMEI ${i.imei} bị trùng`);
        } else must(!i.imei, `Phụ kiện ${i.barcode} không có IMEI`);
        must(Number.isInteger(i.cost) && i.cost >= 0, `Giá nhập của ${i.barcode} không hợp lệ`);
        d.units.push({ barcode: i.barcode, product_id: p.id, receipt_id: id, imei: i.imei || null, cost: i.cost, status: 'AVAILABLE' });
        total += i.cost;
      });
      d.receipts.push({ id, supplier_id: sup.id, staff: U.username, date: today() });
      log(d, 'RECEIVE', 'R' + id);
      return { id, n: rDraft.length, total };
    });
    if (r) { rDraft = []; msg(`Phiếu nhập PN${r.id}: ${r.n} đơn vị, tổng giá nhập ${vnd(r.total)}`); renderAll(); }
  });

  /* ---------- UC06: Bán hàng tiền mặt ---------- */
  function renderSale() {
    opts('#sCust', [['', 'Khách lẻ'], ...DB.customers.map(c => [c.id, c.name + ' - ' + c.phone])]);
    let tot = 0;
    const rows = sDraft.map((i, k) => {
      tot += i.quoted - i.discount;
      return [esc(i.barcode), esc(i.name), vnd(i.quoted), vnd(i.discount), vnd(i.quoted - i.discount),
        `<button class="btn btn-sm btn-outline-danger sdel" data-k="${k}">Xóa</button>`];
    });
    $('#sList').html(tbl(['Barcode', 'Sản phẩm', 'Giá báo', 'Giảm giá', 'Thành tiền', ''], rows));
    $('#sTotal').text('Tổng: ' + vnd(tot));
  }
  $('#sAdd').click(() => {
    const u = findUnit(DB.units, $('#sCode').val().trim()), disc = Number($('#sDisc').val() || 0);
    try {
      must(u, 'Không tìm thấy đơn vị hàng');
      const p = byId(DB.products, u.product_id);
      must(u.status === 'AVAILABLE', `Đơn vị hàng không sẵn sàng bán (${u.status})`);
      must(p.active, 'Sản phẩm đã ngừng kinh doanh');
      must(!sDraft.some(i => i.barcode === u.barcode), 'Đơn vị này đã có trong giỏ');
      must(Number.isInteger(disc) && disc >= 0 && disc <= p.price, 'Giảm giá phải là số nguyên từ 0 đến giá bán');
      sDraft.push({ barcode: u.barcode, name: p.name, quoted: p.price, discount: disc });
    } catch (e) { return msg(e.message, 'danger'); }
    $('#sCode,#sDisc').val(''); renderSale();
  });
  $('#sList').on('click', '.sdel', function () { sDraft.splice($(this).data('k'), 1); renderSale(); });
  $('#sClear').click(() => { sDraft = []; renderSale(); });
  $('#sPay').click(() => {
    const r = tx(d => {
      must(can('sale'), 'Không đủ quyền bán hàng');
      must(sDraft.length, 'Giỏ hàng trống');
      const cid = $('#sCust').val(), cust = cid ? byId(d.customers, cid) : null;
      must(!cid || cust, 'Khách hàng không tồn tại');
      const sid = nid(d, 'sale'), lines = []; let amount = 0;
      sDraft.forEach(i => {
        const u = d.units.find(x => x.barcode === i.barcode), p = u && byId(d.products, u.product_id);
        must(u && u.status === 'AVAILABLE', `${i.barcode} không còn sẵn sàng`);
        must(p.active, `${p.name} đã ngừng kinh doanh`);
        must(p.price === i.quoted, `Giá của ${i.barcode} đã đổi (${vnd(i.quoted)} → ${vnd(p.price)}). Hãy xóa và thêm lại dòng`);
        u.status = 'SOLD'; amount += p.price - i.discount;
        lines.push({ line_id: nid(d, 'line'), barcode: u.barcode, product_id: p.id, sku: p.sku, name: p.name, price: p.price, discount: i.discount, warranty: p.warranty });
      });
      const tendered = Number($('#sCash').val());
      must(Number.isInteger(tendered) && tendered >= amount, 'Tiền khách đưa không đủ');
      d.sales.push({ id: sid, cashier: U.username, customer_id: cust ? cust.id : null, date: today(), status: 'PAID', lines, payment: { amount, tendered, change: tendered - amount } });
      log(d, 'CHECKOUT', 'S' + sid);
      return { sid, amount, change: tendered - amount };
    });
    if (r) { sDraft = []; $('#sCash').val(''); msg(`Hóa đơn HD${r.sid}: thực thu ${vnd(r.amount)}, tiền thừa ${vnd(r.change)}`); renderAll(); }
  });

  /* ---------- UC07: Trả hàng hoàn tiền ---------- */
  $('#retGo').click(() => {
    const r = tx(d => {
      must(can('return'), 'Chỉ Quản lý được hoàn tiền');
      const u = findUnit(d.units, $('#retCode').val().trim()); must(u, 'Không tìm thấy đơn vị hàng');
      const { sale, line } = lineOf(d, u.barcode); must(line, 'Không có dòng bán gốc');
      const reason = $('#retReason').val().trim(); must(reason, 'Bắt buộc nhập lý do');
      must($('#retOk').is(':checked'), 'Quản lý chưa xác nhận tình trạng vật lý');
      must(!d.returns.some(x => x.line_id === line.line_id), 'Dòng bán này đã được trả');
      const dd = days(sale.date, today());
      must(dd >= 0 && dd <= 7, `Quá hạn trả hàng (${dd} ngày, tối đa 7 ngày)`);
      must(!d.warranties.some(w => w.line_id === line.line_id && w.status !== 'CLOSED'), 'Đang có phiếu bảo hành chưa đóng');
      must(u.status === 'SOLD', 'Đơn vị hàng không ở trạng thái SOLD');
      u.status = 'QUARANTINED';
      const refund = line.price - line.discount;
      d.returns.push({ id: nid(d, 'ret'), line_id: line.line_id, barcode: u.barcode, manager: U.username, date: today(), reason, refund });
      log(d, 'REFUND', 'L' + line.line_id);
      return { refund };
    });
    if (r) { $('#retCode,#retReason').val(''); $('#retOk').prop('checked', false); msg(`Đã hoàn ${vnd(r.refund)}. Hàng chuyển sang QUARANTINED`); renderAll(); }
  });

  /* ---------- UC08, UC09: Bảo hành ---------- */
  function renderWarranty() {
    $('#wList').html(tbl(['Phiếu', 'Barcode', 'Mô tả lỗi', 'Ngày nhận', 'Trạng thái', 'Ghi chú', ''],
      DB.warranties.map(t => ['BH' + t.id, esc(t.barcode), esc(t.description), t.opened_on, badge(t.status), t.notes.map(esc).join('<br>') || '-',
        NEXT[t.status] ? `<button class="btn btn-sm btn-outline-primary adv" data-id="${t.id}">Chuyển ${NEXT[t.status]}</button>` : ''])));
  }
  $('#wOpen').click(() => {
    const r = tx(d => {
      must(can('warranty'), 'Không đủ quyền');
      const u = findUnit(d.units, $('#wCode').val().trim()); must(u, 'Không tìm thấy đơn vị hàng');
      const { sale, line } = lineOf(d, u.barcode); must(line, 'Không có dòng bán gốc');
      const desc = $('#wDesc').val().trim(); must(desc, 'Nhập mô tả lỗi');
      must($('#wOk').is(':checked'), 'Kỹ thuật chưa xác nhận lỗi thuộc phạm vi bảo hành');
      must(!d.returns.some(x => x.line_id === line.line_id), 'Hàng đã trả, không bảo hành');
      const dd = days(sale.date, today());
      must(line.warranty > 0 && dd >= 0 && dd <= line.warranty, `Hết hạn bảo hành (${dd} ngày, tối đa ${line.warranty} ngày)`);
      must(!d.warranties.some(w => w.line_id === line.line_id && w.status !== 'CLOSED'), 'Đã có phiếu bảo hành đang mở');
      const id = nid(d, 'ticket');
      d.warranties.push({ id, line_id: line.line_id, barcode: u.barcode, opened_by: U.username, opened_on: today(), status: 'RECEIVED', description: desc, notes: [], closed_on: null });
      log(d, 'OPEN_WARRANTY', 'T' + id);
      return { id };
    });
    if (r) { $('#wCode,#wDesc').val(''); $('#wOk').prop('checked', false); msg(`Đã tạo phiếu bảo hành BH${r.id} (RECEIVED)`); renderAll(); }
  });
  $('#wList').on('click', '.adv', function () {
    const note = prompt('Ghi chú xử lý/bàn giao (bắt buộc):'); if (note === null) return;
    const id = $(this).data('id');
    if (tx(d => {
      must(can('warranty'), 'Không đủ quyền');
      const t = byId(d.warranties, id); must(t, 'Phiếu không tồn tại');
      const nx = NEXT[t.status]; must(nx, 'Phiếu đã đóng');
      must(note.trim(), 'Ghi chú không được rỗng');
      t.status = nx; t.notes.push(nx + ': ' + note.trim());
      if (nx === 'CLOSED') t.closed_on = today();
      log(d, 'WARRANTY_' + nx, 'T' + id);
      return 1;
    })) { msg('Đã chuyển trạng thái phiếu bảo hành'); renderAll(); }
  });

  /* ---------- UC10: Báo cáo ---------- */
  function renderReport() {
    const a = $('#rpFrom').val() || '0000-01-01', b = $('#rpTo').val() || '9999-12-31', inR = x => x >= a && x <= b;
    const S = DB.sales.filter(s => inR(s.date)), R = DB.returns.filter(r => inR(r.date));
    const thu = S.reduce((t, s) => t + s.payment.amount, 0), hoan = R.reduce((t, r) => t + r.refund, 0);
    const card = (t, v) => `<div class="col-md-4"><div class="border rounded p-3 bg-white"><div class="text-muted">${t}</div><div class="stat">${vnd(v)}</div></div></div>`;
    const n = (p, s) => DB.units.filter(u => u.product_id == p.id && u.status === s).length;
    $('#rpBox').html(
      `<div class="row g-2 mb-3">${card('Thu bán', thu)}${card('Tiền hoàn', hoan)}${card('Thu ròng', thu - hoan)}</div>`
      + '<h6>Tồn kho hiện tại (không lọc theo ngày)</h6>'
      + tbl(['Sản phẩm', 'Có thể bán', 'Đã bán', 'Cách ly'], DB.products.map(p => [esc(p.name), n(p, 'AVAILABLE'), n(p, 'SOLD'), n(p, 'QUARANTINED')]))
      + '<h6>Hóa đơn</h6>'
      + tbl(['Mã', 'Ngày', 'Thu ngân', 'Khách', 'Số dòng', 'Thực thu', 'Tiền thừa'],
        S.map(s => ['HD' + s.id, s.date, esc(s.cashier), esc((byId(DB.customers, s.customer_id) || { name: 'Khách lẻ' }).name), s.lines.length, vnd(s.payment.amount), vnd(s.payment.change)]))
      + '<h6>Phiếu trả hàng</h6>'
      + tbl(['Mã', 'Ngày', 'Barcode', 'Lý do', 'Hoàn tiền'], R.map(r => ['TH' + r.id, r.date, esc(r.barcode), esc(r.reason), vnd(r.refund)])));
  }
  $('#rpFrom,#rpTo').on('change', renderReport);

  /* ---------- Danh mục, khách hàng, nhà cung cấp ---------- */
  function renderCatalog() {
    $('#cList').html('<h6>Khách hàng</h6>' + tbl(['Họ tên', 'Số điện thoại'], DB.customers.map(c => [esc(c.name), esc(c.phone)]))
      + '<h6>Nhà cung cấp</h6>' + tbl(['Mã', 'Tên'], DB.suppliers.map(s => [s.id, esc(s.name)])));
  }
  const submit = (form, fn, ok) => $(form).on('submit', function (e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(this));
    if (tx(d => { must(can('catalog'), 'Không đủ quyền'); fn(d, f); return 1; })) { this.reset(); msg(ok); renderAll(); }
  });
  submit('#fProd', (d, f) => {
    const sku = f.sku.trim(), name = f.name.trim(), price = Number(f.price), w = Number(f.warranty);
    must(sku && name, 'Nhập SKU và tên cấu hình');
    must(!d.products.some(p => p.sku === sku), 'SKU đã tồn tại');
    must(Number.isInteger(price) && price > 0, 'Giá bán phải là số nguyên > 0');
    must(Number.isInteger(w) && w >= 0, 'Số ngày bảo hành không hợp lệ');
    d.products.push({ id: nid(d, 'product'), sku, name, kind: f.kind, price, warranty: w, active: true });
  }, 'Đã thêm sản phẩm');
  submit('#fCust', (d, f) => {
    const phone = f.phone.trim(), c = d.customers.find(x => x.phone === phone);
    if (c) c.name = f.name.trim(); /* trùng liên hệ: cập nhật cùng hồ sơ */
    else d.customers.push({ id: nid(d, 'customer'), name: f.name.trim(), phone });
  }, 'Đã lưu khách hàng');
  submit('#fSup', (d, f) => d.suppliers.push({ id: nid(d, 'supplier'), name: f.name.trim() }), 'Đã thêm nhà cung cấp');

  function renderAll() { renderStock(); renderReceipt(); renderSale(); renderWarranty(); renderReport(); renderCatalog(); }

  /* ---------- Khởi động ---------- */
  DB = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
  save();
  $('#bizdate').val(new Date().toISOString().slice(0, 10));
});
