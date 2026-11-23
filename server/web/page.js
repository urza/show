// show: the script of each page. The server adds it to a page; a page has no script of its own.
//
// It colors the code blocks, makes the tabs, counts the answers, and keeps them on the server: it gets the saved
// answers from /p/<id>/state when the page loads, and sends all answers there as one JSON object
// after each change. The agent reads that object from the server.
(() => {
  colorCode();
  tabs();

  const asks = [...document.querySelectorAll('fieldset.ask[data-q]')];
  const COPY_HINT = 'Copy the text at the end of the page into the chat.';

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function button(className, text) {
    const el = make('button', className, text);
    el.type = 'button';
    return el;
  }

  // ---- the status bar ----
  const bar = make('div', 'bar');
  bar.setAttribute('role', 'status');
  const count = make('span', 'count');
  const state = make('span', 'state');
  const inner = make('div', 'in');
  inner.append(count, state);
  bar.append(inner);

  // ---- the end of the page: a comment, the answers as text, and the buttons ----
  const section = make('section', 'answers-text');
  const commentLabel = make('label', 'field');
  const comment = make('textarea');
  commentLabel.append(make('span', 'lab', 'Your comment on the page'), comment);
  // The answers as text are the way to give the answers when the page cannot reach the server.
  const label = make('label', 'field');
  const summary = make('textarea');
  summary.readOnly = true;
  label.append(make('span', 'lab', 'Your answers as text'), summary);
  const copy = button('', 'Copy the answers');
  // An option is recommended when its label contains <span class="tag rec">.
  const recommended = set => [...set.querySelectorAll('label.opt:has(.tag.rec) input')];
  const useRec = button('use-rec', 'Use the recommended answers for the rest');
  const finish = button('finish', 'I finished. Tell the agent.');
  const actions = make('div', 'actions');
  if (asks.some(set => recommended(set).length)) actions.append(useRec);
  // A page without questions has only the comment, so it needs no copy of the answers.
  if (asks.length) actions.append(copy);
  actions.append(finish);
  section.append(commentLabel);
  if (asks.length) section.append(label);
  section.append(actions);

  (document.querySelector('.page') ?? document.body).append(section);
  document.body.prepend(bar);

  function setState(text, kind) {
    state.textContent = text;
    state.className = 'state' + (kind ? ' ' + kind : '');
  }

  // The text of an option is the <b> directly after its <input>, without the tags such as
  // "recommended". A search for the first <b> of the label would find text inside a mockup.
  function labelOf(input) {
    const b = input.nextElementSibling?.matches('b') ? input.nextElementSibling.cloneNode(true) : null;
    if (!b) return input.value;
    for (const tag of b.querySelectorAll('.tag')) tag.remove();
    return b.textContent.replace(/\s+/g, ' ').trim();
  }

  // The answers as data. This is what the agent reads from the server.
  function answers() {
    return asks.map((set, index) => ({
      n: index + 1,
      id: set.dataset.q,
      question: (set.querySelector('legend')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      picks: [...set.querySelectorAll('input:checked')].map(input => ({ value: input.value, label: labelOf(input) })),
      note: set.querySelector('textarea')?.value.trim() ?? '',
      // A question without options has its answer in the text field.
      textOnly: !set.querySelector('input'),
    }));
  }
  const answered = list => list.filter(q => q.picks.length || q.note).length;

  function render() {
    const list = answers();
    const lines = list.map(q => {
      if (q.textOnly) return `${q.id}: ${q.note || '(no answer)'}`;
      return `${q.id}: ${q.picks.map(pick => pick.value).join(', ') || '(no answer)'}${q.note ? ' | note: ' + q.note : ''}`;
    });
    if (comment.value.trim()) lines.push('comment: ' + comment.value.trim());
    count.textContent = list.length ? `${answered(list)} of ${list.length} questions have an answer` : '';
    count.hidden = !list.length;   // an empty count would still take its place in the bar
    summary.value = [document.title, ...lines].join('\n');
  }

  // ---- the server ----
  const url = location.pathname.replace(/\/+$/, '') + '/state';
  let done = false;
  let ready = false;   // true after the saved answers are in the form
  // The questions (and the comment field) that the person changed before the saved answers arrived.
  // The saved answers must not replace them.
  const early = new Set();
  let timer = 0, sending = false, again = false;

  function showDone() {
    finish.textContent = done ? 'The agent can read your answers now.' : 'I finished. Tell the agent.';
    finish.disabled = done;
  }

  async function send() {
    clearTimeout(timer);
    timer = 0;
    if (sending) { again = true; return; }   // one request at a time, so an old state cannot arrive last
    sending = true;
    const list = answers();
    const body = JSON.stringify({
      title: document.title, answered: answered(list), total: list.length, done,
      questions: list.map(({ textOnly, ...q }) => q), comment: comment.value.trim(),
    });
    try {
      // keepalive lets the request finish when the person closes the tab directly after a change.
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      if (!response.ok) throw new Error('the server answered ' + response.status);
      setState('Saved at ' + new Date().toLocaleTimeString(), 'ok');
    } catch (error) {
      setState(`The page did not save the answers (${error.message}). ${COPY_HINT}`, 'bad');
    }
    sending = false;
    if (again) { again = false; send(); }
  }

  function changed(event) {
    render();
    // Before the saved answers are in the form, a save would write an empty form over them.
    // load() saves this change when the answers are there.
    if (!ready) { early.add(event.currentTarget); return; }
    // A change after "I finished" opens the answers again, so the agent does not read a half change as final.
    if (done) { done = false; showDone(); }
    setState('Saving…');
    clearTimeout(timer);
    timer = setTimeout(send, 600);
  }

  for (const set of asks) {
    set.addEventListener('change', changed);
    set.addEventListener('input', changed);
  }
  comment.addEventListener('input', changed);
  useRec.addEventListener('click', () => {
    // Only a question without a selection gets the recommended answer. A question with a note
    // and no selection gets it too, and the note stays. click() sends a change event, so the page saves.
    for (const set of asks) {
      if (!set.querySelector('input:checked')) for (const input of recommended(set)) input.click();
    }
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summary.value); copy.textContent = 'Copied'; }
    catch { summary.focus(); summary.select(); }   // no clipboard permission: the person copies the selection
  });
  finish.addEventListener('click', () => { if (ready) { done = true; showDone(); send(); } });
  addEventListener('pagehide', () => { if (timer) send(); });
  render();
  load();

  async function load() {
    let saved;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('the server answered ' + response.status);
      saved = await response.json();
    } catch (error) {
      setState(`The page cannot reach its server (${error.message}), so it does not save. Load the page again, or copy the text at the end of the page into the chat.`, 'bad');
      return;
    }
    // Put the saved answers back into the form.
    for (const q of saved.questions ?? []) {
      const set = asks.find(ask => ask.dataset.q === q.id);
      // The agent removed this question from the page, or the person answered it already.
      if (!set || early.has(set)) continue;
      const values = new Set((q.picks ?? []).map(pick => pick.value));
      for (const input of set.querySelectorAll('input')) input.checked = values.has(input.value);
      const note = set.querySelector('textarea');
      if (note) note.value = q.note ?? '';
    }
    if (!early.has(comment)) comment.value = saved.comment ?? '';
    done = saved.done === true;
    ready = true;
    showDone();
    render();
    setState(asks.length ? 'The page saves each answer.' : 'The page saves your comment.', 'ok');
    if (early.size) changed();
  }

  // ---- tabs ----
  // <div class="tabs"> shows one of its children at a time. Each child names its tab with data-tab.
  // The script makes the buttons, so the agent writes only the children. The selected tab is not a
  // part of the answers, and the page does not save it.
  function tabs() {
    const SIDE = 'Side by side';
    const panesOf = box => [...box.querySelectorAll(':scope > [data-tab]')];
    const namesOf = box => [...new Set(panesOf(box).map(pane => pane.dataset.tab)), SIDE];
    const boxes = [...document.querySelectorAll('.tabs')].filter(box => panesOf(box).length > 1);
    function tabButton(name, action) {
      const el = button('', name);
      el.addEventListener('click', action);
      return el;
    }
    function show(box, name) {
      const panes = panesOf(box);
      // A box without a child of this name keeps what it shows.
      if (name !== SIDE && !panes.some(pane => pane.dataset.tab === name)) return;
      for (const pane of panes) pane.hidden = name !== SIDE && pane.dataset.tab !== name;
      for (const el of box.querySelectorAll(':scope > .tab-bar > button')) el.setAttribute('aria-pressed', String(el.textContent === name));
      box.classList.toggle('all', name === SIDE);
    }
    for (const box of boxes) {
      const bar = make('div', 'tab-bar');
      bar.append(...namesOf(box).map(name => tabButton(name, () => show(box, name))));
      box.prepend(bar);
      show(box, namesOf(box)[0]);
    }
    // <p class="tabs-all"></p> gets buttons that change all boxes of the page at the same time.
    if (boxes.length) for (const all of document.querySelectorAll('.tabs-all:empty')) {
      all.append('All tabs: ', ...namesOf(boxes[0]).map(name => tabButton(name, () => { for (const box of boxes) show(box, name); })));
    }
  }

  // ---- the colors of code ----
  // Each <pre><code class="language-xx"> block gets <span class="tk-..."> tags around its
  // comments, strings, numbers and keywords. The stylesheet has the colors.
  function colorCode() {
    const KEYWORDS = {
      js: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield',
      cs: 'abstract as async await base bool break case catch class const continue default do else enum false finally for foreach get if in int interface internal is lock long namespace new null out override private protected public readonly record ref return sealed set static string struct switch this throw true try using var virtual void while',
      py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
      sql: 'add alter and as by column create default delete distinct from group having index inner insert into join key left limit not null on or order outer primary references right select set table union update values where',
      sh: 'case cd do done echo elif else esac exit export fi for function if in local return then while',
      json: 'false null true',
      css: '',
      html: '',
    };
    const ALIAS = { javascript: 'js', mjs: 'js', ts: 'js', typescript: 'js', csharp: 'cs', python: 'py', bash: 'sh', shell: 'sh', xml: 'html' };
    const BLOCK_COMMENT = new Set(['js', 'cs', 'css', 'sql']);
    const LINE_COMMENT = { js: String.raw`\/\/`, cs: String.raw`\/\/`, sql: '--', py: String.raw`(?<![\w$&])#`, sh: String.raw`(?<![\w$&])#` };

    // One expression finds the next comment, string, number or word. A comment or a string that
    // starts first wins, so "//" inside a string is not a comment.
    function tokens(lang) {
      if (lang === 'html') return new RegExp(String.raw`(?<c><!--[\s\S]*?-->)|(?<k><\/?[A-Za-z][\w-]*|\/?>)|(?<s>"[^"\n]*"|'[^'\n]*')`, 'g');
      const comments = [];
      if (BLOCK_COMMENT.has(lang)) comments.push(String.raw`\/\*[\s\S]*?\*\/`);
      if (LINE_COMMENT[lang]) comments.push(LINE_COMMENT[lang] + String.raw`[^\n]*`);
      const strings = [String.raw`"(?:\\.|[^"\\\n])*"`, String.raw`'(?:\\.|[^'\\\n])*'`];
      if (lang === 'js') strings.push('`(?:\\\\.|[^`\\\\])*`');
      return new RegExp((comments.length ? `(?<c>${comments.join('|')})|` : '') +
        `(?<s>${strings.join('|')})|` + String.raw`(?<n>\b\d+(?:\.\d+)?\b)|(?<w>[A-Za-z_$][\w$]*)`, 'g');
    }

    for (const block of document.querySelectorAll('pre > code[class*="language-"]')) {
      const name = /\blanguage-([\w-]+)/.exec(block.className)?.[1].toLowerCase() ?? '';
      const lang = ALIAS[name] ?? name;
      // A block with tags inside it has its own marks already. A language without rules stays plain.
      if (!(lang in KEYWORDS) || block.children.length) continue;
      const keywords = new Set(KEYWORDS[lang].split(' '));
      const code = block.textContent;
      const parts = [];
      let last = 0;
      for (const m of code.matchAll(tokens(lang))) {
        const text = m[0];
        const kind = m.groups.c !== undefined ? 'c' : m.groups.s !== undefined ? 's' : m.groups.n !== undefined ? 'n'
          : m.groups.k !== undefined || keywords.has(lang === 'sql' ? text.toLowerCase() : text) ? 'k' : '';
        parts.push(code.slice(last, m.index));
        // textContent puts the code into the page as text, so code can never become markup.
        if (kind) { const span = document.createElement('span'); span.className = 'tk-' + kind; span.textContent = text; parts.push(span); }
        else parts.push(text);
        last = m.index + text.length;
      }
      parts.push(code.slice(last));
      block.replaceChildren(...parts);
    }
  }
})();
