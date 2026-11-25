const steps = document.querySelector('#steps');
const evidence = document.querySelector('#evidence');
const inspector = document.querySelector('#inspector');
const stageTitle = document.querySelector('#stage-title');
const next = document.querySelector('#next');
const previous = document.querySelector('#previous');
const printReport = document.querySelector('#print-report');
const invoice = demoCase.invoice;
const receipt = demoCase.transfers.find(transfer => transfer.current);
const relatedTransfers = demoCase.transfers.filter(transfer => transfer.account === receipt.account);
const invoiceFields = [
  { id: 'account', title: 'חשבון לתשלום', original: invoice.original.account, revised: invoice.revised.account },
  { id: 'amount', title: 'סכום לתשלום', original: shekels(invoice.original.amount), revised: shekels(invoice.revised.amount) },
  { id: 'supplier', title: 'שם הספק', original: invoice.original.supplier, revised: invoice.revised.supplier }
];
const timeline = [
  { time: '09:12', title: 'התקבלה הצעת עבודה בוואטסאפ', source: 'צילום 01 · פתיחת השיחה', stage: 0, item: 'link' },
  { time: '10:04', title: 'התבקש תשלום על ציוד לפני קליטה', source: 'צילום 02 · המשך השיחה', stage: 1, item: 'equipment' },
  { time: invoice.original.time, title: 'התקבלה החשבונית המקורית', source: 'מסמך 03 · גרסה מקורית', stage: 2, item: 'account' },
  { time: invoice.revised.time, title: 'התקבלה חשבונית עם חשבון אחר', source: 'מסמך 03 · גרסה מעודכנת', stage: 2, item: 'account' },
  { time: receipt.time, title: `הועברו ${shekels(receipt.amount)} לחשבון המעודכן`, source: `קבלת דמו · ${receipt.id}`, stage: 3, item: receipt.id }
];
const initialSummary = `ביום ${demoCase.date} התקבלה הצעת עבודה בשם ${demoCase.company}. בשיחה התבקש תשלום של ${shekels(receipt.amount)} על ציוד כתנאי לקליטה. שתי גרסאות של חשבונית ${invoice.number} הציגו את אותו ספק ואת אותו סכום, עם חשבונות שונים לתשלום. הקבלה מציגה העברה לחשבון שהופיע בגרסה המעודכנת. מקור הפנייה ואישור הספק לשינוי עדיין דורשים אימות.`;
const state = { stage: 0, selected: null, markers: true, receiptOpen: false, summary: initialSummary };

function shekels(amount) {
  return `${new Intl.NumberFormat('he-IL').format(amount)} ₪`;
}

function sourceStrip(stage) {
  return `<div class="evidence-bar"><span class="document-icon" aria-hidden="true"></span>
    <h3>${stage.source}</h3><span class="source-caption">${stage.caption}</span></div>`;
}

function renderChat(stageIndex) {
  const messages = stageIndex === 0 ? demoCase.messages.slice(0, 3) : demoCase.messages.slice(3);
  const findings = chatFindings[stageIndex];
  evidence.innerHTML = `${sourceStrip(stages[stageIndex])}
    <div class="chat-canvas">
      <div class="chat">
        <div class="chat-top"><span class="avatar" aria-hidden="true">נ</span>
          <div><strong>${demoCase.contact}</strong><small>שיחת וואטסאפ לדוגמה</small></div>
        </div>
        <div class="chat-body">
          ${messages.map(message => {
            const findingIndex = findings.findIndex(finding => finding.id === message.id);
            return `<div class="message ${message.sent ? 'sent' : ''}" data-mark="${message.id}">
              ${findingIndex === -1 ? '' : `<span class="mark-number" aria-hidden="true">${findingIndex + 1}</span>`}
              <div>${message.body}${message.domain ? `<bdi class="message-domain">${message.domain}</bdi>` : ''}</div>
              <time>${message.time}</time>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
    <div class="under-evidence">
      <button type="button" class="text-button" data-action="markers" aria-pressed="${state.markers}">הצגת סימונים</button>
      ${stageIndex === 0 ? `<span>כתובת רשמית בדמו <bdi>${demoCase.officialDomain}</bdi></span>` : ''}
    </div>`;
  renderFindings('סימנים לבדיקה', findings, 'ממצאים לדוגמה');
}

function renderFindings(title, findings, label) {
  inspector.innerHTML = `<div class="inspector-head"><span class="dot" aria-hidden="true"></span>${label}</div>
    <h3>${title}</h3>
    <ul class="finding-list" role="list">
      ${findings.map((finding, index) => `<li>
        <button class="finding" type="button" data-select="${finding.id}" aria-pressed="false" aria-controls="finding-detail">
          <span class="finding-number" aria-hidden="true">${index + 1}</span><span>${finding.title}</span>
        </button>
      </li>`).join('')}
    </ul>
    <p id="finding-detail" class="finding-detail" aria-live="polite"></p>`;
  state.selected ??= findings[0].id;
  setFinding(findings, state.selected);
}

function setFinding(findings, id) {
  const finding = findings.find(item => item.id === id);
  if (!finding) return;
  state.selected = id;
  inspector.querySelectorAll('[data-select]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.select === id));
  });
  evidence.querySelectorAll('[data-mark]').forEach(mark => {
    mark.classList.toggle('highlighted', mark.dataset.mark === id);
  });
  inspector.querySelector('#finding-detail').textContent = finding.detail;
}

function renderInvoices() {
  evidence.innerHTML = `${sourceStrip(stages[2])}
    <div class="invoice-canvas">${['original', 'revised'].map((version, index) => `<article class="invoice">
      <p class="invoice-label">${index === 0 ? 'גרסה מקורית' : 'גרסה מעודכנת'}</p>
      <h4>חשבונית <bdi>${invoice.number}</bdi></h4>
      <p class="invoice-meta"><time>${invoice[version].time}</time> · ${invoice.purpose}</p>
      <dl>${invoiceFields.map(field => `<div data-mark="${field.id}"><dt>${field.title}</dt><dd><bdi>${field[version]}</bdi></dd></div>`).join('')}</dl>
    </article>`).join('')}</div>`;
  renderFindings('השוואת שדות', getInvoiceFindings(), 'השוואה לפי ערך');
}

function getInvoiceFindings() {
  return invoiceFields.map(field => {
    const changed = field.original !== field.revised;
    return {
      id: field.id,
      title: `${field.title} ${changed ? 'השתנה' : 'זהה'}`,
      detail: changed
        ? `בגרסה המקורית הופיע ${field.original}, ובמעודכנת ${field.revised}. כדאי לאמת את השינוי מול הספק דרך פרטי קשר מוכרים.`
        : `הערך בשתי הגרסאות זהה. בשתיהן מופיע ${field.original}.`
    };
  });
}

function renderTransfers() {
  evidence.innerHTML = `${sourceStrip(stages[3])}
    <div class="graph-canvas">
      <div id="receipt-prompt" ${state.receiptOpen ? 'hidden' : ''}>
        <div class="receipt-symbol" aria-hidden="true"><span></span></div>
        <h4>קבלת התשלום</h4>
        <p>בתיק הזה המועמד כבר העביר כסף. פתחו את הקבלה כדי לראות את החשבון שקיבל אותו.</p>
        <button type="button" class="button primary" data-action="receipt">פתחו את קבלת הדמו</button>
      </div>
      <figure id="transfer-graph" ${state.receiptOpen ? '' : 'hidden'}>
        <div class="graph">
          <ul class="graph-origins" role="list">
            ${relatedTransfers.map(transfer => `<li>
                <button type="button" class="graph-node" data-transfer="${transfer.id}" aria-pressed="false" aria-controls="transfer-detail">
                  <span>${transfer.label}</span><strong>${shekels(transfer.amount)}</strong>
                </button><span class="edge" aria-hidden="true"></span>
              </li>`).join('')}
          </ul>
          <div class="graph-destination"><span>חשבון מקבל</span><strong><bdi>${receipt.account}</bdi></strong></div>
        </div>
        <figcaption>${relatedTransfers.length} העברות בנתוני הדמו הגיעו לאותו חשבון. בחרו העברה לפרטים.</figcaption>
      </figure>
    </div>`;
  inspector.innerHTML = `<div class="inspector-head"><span class="dot" aria-hidden="true"></span>בדיקת תשלום</div>
    <h3>פרטי העברה</h3>
    <div id="transfer-detail" class="transfer-detail" aria-live="polite">פרטי העסקה יופיעו לאחר פתיחת הקבלה.</div>`;
  if (state.receiptOpen) selectTransfer(state.selected ?? receipt.id);
}

function selectTransfer(id) {
  const transfer = relatedTransfers.find(item => item.id === id);
  if (!transfer) return;
  state.selected = id;
  evidence.querySelectorAll('[data-transfer]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.transfer === id));
  });
  inspector.querySelector('#transfer-detail').innerHTML = `<dl>
    <div><dt>מקור</dt><dd>${transfer.label}</dd></div>
    <div><dt>אסמכתה</dt><dd><bdi>${transfer.id}</bdi></dd></div>
    <div><dt>תאריך ושעה</dt><dd><bdi>${transfer.date} · ${transfer.time}</bdi></dd></div>
    <div><dt>סכום</dt><dd>${shekels(transfer.amount)}</dd></div>
    <div><dt>חשבון מקבל</dt><dd><bdi>${transfer.account}</bdi></dd></div>
  </dl>`;
}

function renderReport() {
  evidence.innerHTML = `${sourceStrip(stages[4])}
    <div class="report-canvas">
      <p class="timeline-date">${demoCase.date}</p>
      <ol class="timeline" role="list">
        ${timeline.map(event => `<li><time>${event.time}</time><div>
          <strong>${event.title}</strong>
          <button class="text-button" type="button" data-source="${event.stage}" data-item="${event.item}">${event.source}</button>
        </div></li>`).join('')}
      </ol>
    </div>`;
  inspector.innerHTML = `<div class="inspector-head"><span class="dot" aria-hidden="true"></span>דוח תיק לדוגמה</div>
    <h3>סיכום לעריכה</h3>
    <label for="summary">תיאור המקרה</label>
    <textarea id="summary" rows="8" maxlength="3000"></textarea>
    <button type="button" class="button primary print-button" data-action="print">הדפסה או שמירה כ־PDF</button>`;
  inspector.querySelector('#summary').value = state.summary;
}

function preparePrint() {
  printReport.innerHTML = `<p class="print-kicker" lang="en" dir="ltr">Fraud Lens / ${demoCase.id}</p>
    <h1>סיכום תיק לדוגמה</h1><p>כל הפרטים בדוח מבוססים על נתונים מדומים.</p>
    <h2>תיאור המקרה</h2><p id="printed-summary" dir="auto"></p>
    <h2>ציר זמן ומקורות · ${demoCase.date}</h2>
    <ol>${timeline.map(event => `<li><bdi>${event.time}</bdi> · ${event.title}<small>${event.source}</small></li>`).join('')}</ol>`;
  printReport.querySelector('#printed-summary').textContent = state.summary;
}

function showStage(index, { focus = true, selected = null } = {}) {
  const stage = stages[index];
  state.stage = index;
  state.selected = selected;
  document.querySelector('#stage-count').textContent = `שלב ${index + 1} מתוך ${stages.length}`;
  stageTitle.textContent = stage.title ?? stage.label;
  document.querySelector('#stage-intro').textContent = stage.intro;
  document.title = `Fraud Lens · ${stage.title ?? stage.label}`;
  steps.querySelectorAll('button').forEach((button, buttonIndex) => {
    if (index === buttonIndex) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  next.textContent = stage.next ?? 'התחלה מחדש';
  previous.hidden = index === 0;
  evidence.classList.toggle('markers-off', !state.markers);
  if (index < 2) renderChat(index);
  else if (index === 2) renderInvoices();
  else if (index === 3) renderTransfers();
  else renderReport();
  if (focus) {
    stageTitle.focus({ preventScroll: true });
    document.querySelector('#investigation').scrollIntoView({ block: 'start' });
  }
}

steps.innerHTML = stages.map((stage, index) => `<li><button type="button" data-stage="${index}">
  <span class="step-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
  <span>${stage.label}</span></button></li>`).join('');

steps.addEventListener('click', event => {
  const button = event.target.closest('[data-stage]');
  if (button) showStage(Number(button.dataset.stage));
});
document.querySelector('#start').addEventListener('click', () => showStage(0));
previous.addEventListener('click', () => showStage(state.stage - 1));
next.addEventListener('click', () => {
  if (state.stage < stages.length - 1) {
    showStage(state.stage + 1);
    return;
  }
  Object.assign(state, { markers: true, receiptOpen: false, summary: initialSummary });
  showStage(0);
});
evidence.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'markers') {
    state.markers = !state.markers;
    button.setAttribute('aria-pressed', String(state.markers));
    evidence.classList.toggle('markers-off', !state.markers);
  } else if (button.dataset.action === 'receipt') {
    state.receiptOpen = true;
    evidence.querySelector('#receipt-prompt').hidden = true;
    evidence.querySelector('#transfer-graph').hidden = false;
    selectTransfer(receipt.id);
    evidence.querySelector(`[data-transfer="${receipt.id}"]`).focus();
  } else if (button.dataset.transfer) {
    selectTransfer(button.dataset.transfer);
  } else if (button.dataset.source) {
    const stage = Number(button.dataset.source);
    if (stage === 3) state.receiptOpen = true;
    showStage(stage, { selected: button.dataset.item });
  }
});
inspector.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.select) {
    const findings = state.stage === 2 ? getInvoiceFindings() : chatFindings[state.stage];
    setFinding(findings, button.dataset.select);
  } else if (button.dataset.action === 'print') {
    preparePrint();
    window.print();
  }
});
inspector.addEventListener('input', event => {
  if (event.target.id === 'summary') state.summary = event.target.value;
});
window.addEventListener('beforeprint', preparePrint);
showStage(0, { focus: false });
