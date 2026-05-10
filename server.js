const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const SCAN_DIR = path.join(DATA_DIR, 'scans');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const PLAN_FILE = path.join(DATA_DIR, 'schichten.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

[DATA_DIR, UPLOAD_DIR, SCAN_DIR, HISTORY_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// --- Helpers ---
function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const jan1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - jan1) / 86400000 - 3 + ((jan1.getDay() + 6) % 7)) / 7);
}

function load() {
  try { return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')); } catch {
    return { mitarbeiter: [], schichten: {}, notizen: {}, einstellungen: { firma: 'Tankstelle' } };
  }
}

function save(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(PLAN_FILE, JSON.stringify(data, null, 2));
}

function pushHistory(data) {
  let history = [];
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {}
  history.push({ ts: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(data)) });
  if (history.length > 20) history = history.slice(-20);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
}

// --- API: Data ---
app.get('/api/data', (_req, res) => res.json(load()));

app.post('/api/data', (req, res) => {
  try {
    const data = req.body;
    pushHistory(data);
    save(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: History / Undo ---
app.get('/api/history', (_req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))); } catch { res.json([]); }
});

// --- API: OCR Scan ---
app.post('/api/scan', upload.single('bild'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('deu');
    const { data } = await worker.recognize(req.file.path);
    await worker.terminate();

    // Save scan image
    const ext = path.extname(req.file.originalname) || '.jpg';
    const scanName = `scan_${Date.now()}${ext}`;
    fs.renameSync(req.file.path, path.join(SCAN_DIR, scanName));

    const text = data.text;
    const parsed = parseOCR(text);
    res.json({ text, parsed, bild: scanName });
  } catch (e) {
    console.error('OCR error:', e);
    res.status(500).json({ error: e.message });
  }
});

function parseOCR(text) {
  const result = { mitarbeiter: [], schichten: {} };
  if (!text) return result;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tage = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  const tageLang = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const tageKurz = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const shifts = {
    'f': '06-14', 'früh': '06-14', 'frueh': '06-14', 'morgen': '06-14',
    's': '14-22', 'spät': '14-22', 'spaet': '14-22', 'abend': '14-22',
    'n': '22-06', 'nacht': '22-06', 'm': '10-18', 'mittel': '10-18',
    'frei': 'Frei', 'u': 'Urlaub', 'urlaub': 'Urlaub', 'k': 'Krank', 'krank': 'Krank'
  };
  const kw = getWeekNumber(new Date());

  for (const line of lines) {
    // "Name HH-HH" or "Name HH:HH"
    const timeMatch = line.match(/([A-Za-zÄÖÜäöüß\s]{2,30})\s*[:]?\s*(\d{1,2})[.:\-](\d{1,2})/i);
    if (timeMatch) {
      const name = timeMatch[1].trim();
      const von = timeMatch[2].padStart(2, '0');
      const bis = timeMatch[3].padStart(2, '0');
      const shift = `${von}-${bis}`;
      if (!result.mitarbeiter.includes(name)) result.mitarbeiter.push(name);
      let dayIdx = 0;
      for (let i = 0; i < tage.length; i++) {
        if (line.toLowerCase().includes(tage[i]) || line.toLowerCase().includes(tageLang[i])) { dayIdx = i; break; }
      }
      result.schichten[`KW${kw}-${tageKurz[dayIdx]}-${name}`] = shift;
      continue;
    }
    // "Name F/S/N"
    const shortMatch = line.match(/([A-Za-zÄÖÜäöüß]{2,30})\s+([FNMSUKfnmsuk])/);
    if (shortMatch) {
      const name = shortMatch[1].trim();
      const code = shortMatch[2].toLowerCase();
      if (!result.mitarbeiter.includes(name)) result.mitarbeiter.push(name);
      const shift = shifts[code] || '06-14';
      let dayIdx = 0;
      for (let i = 0; i < tage.length; i++) {
        if (line.toLowerCase().includes(tage[i]) || line.toLowerCase().includes(tageLang[i])) { dayIdx = i; break; }
      }
      result.schichten[`KW${kw}-${tageKurz[dayIdx]}-${name}`] = shift;
    }
  }
  return result;
}

// --- API: PDF Export ---
app.post('/api/pdf', (req, res) => {
  try {
    const { mitarbeiter, tage, schichten, notizen, kw, datumStr, firma } = req.body;
    const doc = new PDFDocument({ size: 'A4', margins: { top: 35, right: 20, bottom: 45, left: 20 } });
    const fname = `Schichtplan-${kw.replace(/\s/g, '')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    doc.pipe(res);

    const DARK = '#0f1923';
    const ACCENT_COLORS = {
      '06-14': { bg: '#fef3c7', fg: '#92400e' },
      '14-22': { bg: '#fee2e2', fg: '#991b1b' },
      '22-06': { bg: '#e0e7ff', fg: '#3730a3' },
      '10-18': { bg: '#d1fae5', fg: '#065f46' },
      'Frei': { bg: '#f1f5f9', fg: '#64748b' },
      'Urlaub': { bg: '#cffafe', fg: '#155e75' },
      'Krank': { bg: '#ffe4e6', fg: '#9f1239' }
    };

    // Header
    doc.rect(0, 0, doc.page.width, 85).fill('#102a3c');
    doc.fill('#fff').fontSize(22).font('Helvetica-Bold').text('SCHICHTPLAN', 0, 18, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(firma || 'Tankstelle', 0, 44, { align: 'center' });
    doc.fontSize(8).fill('#94a3b8').text(`${kw}  •  ${datumStr}`, 0, 58, { align: 'center' });

    const cols = 8;
    const colW = (doc.page.width - 40) / cols;
    const rowH = 26;
    const headerH = 32;
    let y = 95;
    const x0 = 20;

    // Table header
    doc.rect(x0, y, colW, headerH).fill(DARK);
    doc.fill('#fff').fontSize(9).font('Helvetica-Bold').text('MA', x0 + 4, y + 10, { width: colW - 8 });
    tage.forEach((t, i) => {
      doc.rect(x0 + (i + 1) * colW, y, colW, headerH).fill(DARK);
      doc.fill('#fff').fontSize(9).font('Helvetica-Bold').text(t.tag, x0 + (i + 1) * colW, y + 3, { width: colW, align: 'center' });
      doc.fontSize(7).font('Helvetica').text(t.datum, x0 + (i + 1) * colW, y + 17, { width: colW, align: 'center' });
    });
    y += headerH;

    mitarbeiter.forEach((m, mi) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 35; }
      const bg = mi % 2 ? '#f8fafc' : '#fff';
      doc.rect(x0, y, colW, rowH).fill('#e2e8f0');
      doc.fill(DARK).fontSize(9).font('Helvetica-Bold').text(m, x0 + 5, y + 7, { width: colW - 10 });

      tage.forEach((t, ti) => {
        const key = `${kw}-${t.tag}-${m}`;
        const shift = schichten[key] || '';
        const note = notizen[key] || '';
        const cx = x0 + (ti + 1) * colW;
        const sc = ACCENT_COLORS[shift];

        doc.rect(cx, y, colW, rowH).fill(sc ? sc.bg : bg);
        doc.rect(cx, y, colW, rowH).stroke('#cbd5e1');

        if (shift && shift !== '—') {
          doc.fill(sc ? sc.fg : DARK).fontSize(8.5).font('Helvetica-Bold')
             .text(shift, cx + 1, y + 3, { width: colW - 2, align: 'center' });
          if (note) {
            doc.fontSize(6.5).font('Helvetica').fill('#94a3b8')
               .text(note, cx + 1, y + 16, { width: colW - 2, align: 'center' });
          }
        } else if (note) {
          doc.fontSize(7).font('Helvetica').fill('#94a3b8')
             .text(note, cx + 1, y + 8, { width: colW - 2, align: 'center' });
        }
      });
      y += rowH;
    });

    doc.fontSize(7).fill('#94a3b8')
       .text(`Erstellt am ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
             x0, doc.page.height - 35);
    doc.end();
  } catch (e) {
    console.error('PDF error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`\n⛽ Schichtplan App v2 — http://localhost:${PORT}\n`));
