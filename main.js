'use strict';

const { Plugin, ItemView } = require('obsidian');

const VIEW_TYPE = 'notes-calendar-view';
const MAX_DOTS = 5;
const ICON_PREV = '<svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.4813 18.3159L9.81543 12.65L15.4813 6.98413" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.81534 6.98413L15.4812 12.65L9.81534 18.3159" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// count at which the day background reaches full saturation
const SATURATION_CAP = 8;

function dateKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

class CreationCalendarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.selectedKey = null;
    this.mode = 'month'; // 'month' | 'year'
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Notes calendar'; }
  getIcon() { return 'calendar-days'; }

  async onOpen() {
    this.containerEl.children[1].addClass('creation-calendar');
    this.render();
  }

  buildIndex() {
    const index = new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const key = dateKey(file.stat.ctime);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(file);
    }
    return index;
  }

  render() {
    const root = this.containerEl.children[1];
    root.empty();
    const index = this.buildIndex();

    // header with navigation
    const header = root.createDiv({ cls: 'cc-header' });
    const prev = header.createDiv({ cls: 'cc-nav' });
    prev.innerHTML = ICON_PREV;
    const isYear = this.mode === 'year';
    const title = header.createDiv({
      cls: 'cc-title',
      text: isYear
        ? String(this.year)
        : new Date(this.year, this.month).toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
    const next = header.createDiv({ cls: 'cc-nav' });
    next.innerHTML = ICON_NEXT;
    prev.onclick = () => (isYear ? this.shiftYear(-1) : this.shiftMonth(-1));
    next.onclick = () => (isYear ? this.shiftYear(1) : this.shiftMonth(1));
    title.onclick = () => {
      if (isYear) {
        this.year = new Date().getFullYear();
      } else {
        this.mode = 'year';
      }
      this.render();
    };
    title.setAttr('title', isYear ? 'Back to current year' : 'Show year view');

    if (isYear) {
      this.renderYear(root, index);
      return;
    }

    // weekday row
    const grid = root.createDiv({ cls: 'cc-grid' });
    for (const wd of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      grid.createDiv({ cls: 'cc-weekday', text: wd });
    }

    const first = new Date(this.year, this.month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const todayKey = dateKey(Date.now());

    for (let i = 0; i < startOffset; i++) grid.createDiv({ cls: 'cc-day cc-empty' });

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(new Date(this.year, this.month, d).getTime());
      const files = index.get(key) || [];
      const cell = grid.createDiv({ cls: 'cc-day' });
      if (key === todayKey) cell.addClass('cc-today');
      if (key === this.selectedKey) cell.addClass('cc-selected');
      cell.createDiv({ cls: 'cc-daynum', text: String(d) });

      if (files.length > 0) {
        cell.addClass('cc-has-notes');
        const strength = Math.min(files.length / SATURATION_CAP, 1);
        // light accent wash that deepens with note count
        cell.style.setProperty('--cc-strength', String(0.12 + strength * 0.45));
        const dots = cell.createDiv({ cls: 'cc-dots' });
        const n = Math.min(files.length, MAX_DOTS);
        for (let i = 0; i < n; i++) dots.createDiv({ cls: 'cc-dot' });
        cell.setAttr('title', `${files.length} note${files.length === 1 ? '' : 's'} created`);
      }

      cell.onclick = () => {
        this.selectedKey = this.selectedKey === key ? null : key;
        this.render();
      };
    }

    // note list for the selected day
    if (this.selectedKey) {
      const files = index.get(this.selectedKey) || [];
      const panel = root.createDiv({ cls: 'cc-panel' });
      const panelTitle = panel.createDiv({ cls: 'cc-panel-title' });
      panelTitle.createSpan({
        cls: 'cc-panel-date',
        text: new Date(this.selectedKey + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' }),
      });
      panelTitle.createSpan({
        cls: 'cc-panel-count',
        text: `${files.length} note${files.length === 1 ? '' : 's'}`,
      });
      if (files.length === 0) {
        panel.createDiv({ cls: 'cc-panel-empty', text: 'No notes created this day.' });
      }
      for (const file of files.slice().sort((a, b) => a.stat.ctime - b.stat.ctime)) {
        const card = panel.createDiv({ cls: 'cc-note' });
        const head = card.createDiv({ cls: 'cc-note-head' });
        head.createSpan({ cls: 'cc-note-name', text: file.basename });
        head.createSpan({
          cls: 'cc-note-time',
          text: new Date(file.stat.ctime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }),
        });
        const preview = card.createDiv({ cls: 'cc-note-preview' });
        this.fillPreview(file, preview);

        const tags = this.fileTags(file);
        if (tags.length > 0) {
          const tagRow = card.createDiv({ cls: 'cc-note-tags' });
          for (const t of tags.slice(0, 6)) tagRow.createSpan({ cls: 'cc-note-tag', text: t });
        }

        card.setAttr('title', file.path);
        card.onclick = () => this.app.workspace.getLeaf(false).openFile(file);
      }
    }
  }

  renderYear(root, index) {
    // note counts per month for this year
    const counts = new Array(12).fill(0);
    for (const [key, files] of index) {
      const [y, m] = key.split('-').map(Number);
      if (y === this.year) counts[m - 1] += files.length;
    }
    const max = Math.max(...counts, 1);
    const now = new Date();

    const grid = root.createDiv({ cls: 'cc-year-grid' });
    for (let m = 0; m < 12; m++) {
      const cell = grid.createDiv({ cls: 'cc-month' });
      if (this.year === now.getFullYear() && m === now.getMonth()) cell.addClass('cc-today');
      cell.createDiv({
        cls: 'cc-month-name',
        text: new Date(this.year, m).toLocaleString('default', { month: 'short' }),
      });
      if (counts[m] > 0) {
        cell.addClass('cc-has-notes');
        cell.style.setProperty('--cc-strength', String(0.12 + (counts[m] / max) * 0.45));
        cell.createDiv({ cls: 'cc-month-count', text: String(counts[m]) });
      }
      cell.onclick = () => {
        this.month = m;
        this.mode = 'month';
        this.render();
      };
    }
  }

  shiftYear(delta) {
    this.year += delta;
    this.render();
  }

  fileTags(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return [];
    const set = new Set();
    if (cache.tags) for (const t of cache.tags) set.add(t.tag.replace(/^#/, ''));
    const fm = cache.frontmatter && cache.frontmatter.tags;
    if (fm) {
      const arr = Array.isArray(fm) ? fm : String(fm).split(/[,\s]+/);
      for (const t of arr) if (t) set.add(String(t).replace(/^#/, ''));
    }
    return [...set];
  }

  async fillPreview(file, el) {
    const MAX = 140;
    let text = await this.app.vault.cachedRead(file);
    // strip frontmatter
    text = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
    // strip markdown syntax down to plain-ish text
    text = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[\[[^\]]*\]\]/g, ' ')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~`>]/g, '')
      .replace(/^[-+]\s+|^\d+\.\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) {
      el.addClass('cc-note-preview-empty');
      el.setText('Empty note');
      return;
    }
    el.setText(text.length > MAX ? text.slice(0, MAX).trimEnd() + '…' : text);
  }

  shiftMonth(delta) {
    const d = new Date(this.year, this.month + delta, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    this.render();
  }
}

module.exports = class CreationCalendarPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new CreationCalendarView(leaf, this));

    this.addRibbonIcon('calendar-days', 'Open notes calendar', () => this.activateView());
    this.addCommand({
      id: 'open-notes-calendar',
      name: 'Open notes calendar',
      callback: () => this.activateView(),
    });

    const refresh = () => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (leaf.view instanceof CreationCalendarView) leaf.view.render();
      }
    };
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
};
