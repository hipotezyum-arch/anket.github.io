const express = require('express');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// DB setup
const db = new Database('anket.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json());
app.use(express.static('public'));

// --- Survey questions from real data ---
const QUESTIONS = [
  { id: 1,  category: 'Takdir & Değer',     text: 'Takdir edildiğimi hissediyorum' },
  { id: 2,  category: 'Takdir & Değer',     text: 'Hatalar başkalarının yanında söylenmez' },
  { id: 3,  category: 'Adalet & Eşitlik',   text: 'Politika ve prosedürler eşit uygulanır' },
  { id: 4,  category: 'Takdir & Değer',     text: 'Kendimi değerli hissediyorum' },
  { id: 5,  category: 'Adalet & Eşitlik',   text: 'Ödül ve terfiler adildir' },
  { id: 6,  category: 'İş Tatmini',         text: 'İşimden keyif alıyorum' },
  { id: 7,  category: 'Gelişim & Kariyer',  text: 'Bilgi ve beceriler aktarılıyor' },
  { id: 8,  category: 'Gelişim & Kariyer',  text: 'Yükselme imkanı vardır' },
  { id: 9,  category: 'Gelişim & Kariyer',  text: 'Terfiler başarıya göre yapılır' },
  { id: 10, category: 'İş Ortamı',          text: 'Takım çalışması etkilidir' },
  { id: 11, category: 'İletişim',           text: 'Sorunlar rahatça paylaşılır' },
  { id: 12, category: 'Gelişim & Kariyer',  text: 'Çalışan gelişimine yatırım yapılır' },
  { id: 13, category: 'Bağlılık',           text: 'Tekrar bu şirketi seçerim' },
  { id: 14, category: 'Bağlılık',           text: 'Başkalarına tavsiye ederim' },
  { id: 15, category: 'Bağlılık',           text: 'Gelecek açısından güvendeyim' },
  { id: 16, category: 'Yönetim',            text: 'Yöneticim destek olur' },
  { id: 17, category: 'Yönetim',            text: 'Yöneticim uygun üslupla konuşur' },
  { id: 18, category: 'Yönetim',            text: 'Yöneticim eşit davranır' },
  { id: 19, category: 'Fiziksel Ortam',     text: 'Yemek ve yemekhanelerden memnunum' },
  { id: 20, category: 'Fiziksel Ortam',     text: 'Servis hizmetlerinden memnunum' },
];

// Device fingerprint from headers + IP
function getFingerprint(req) {
  const raw = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.ip || '',
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Check if device already submitted
app.get('/api/check', (req, res) => {
  const fp = getFingerprint(req);
  const existing = db.prepare('SELECT id FROM devices WHERE fingerprint = ?').get(fp);
  res.json({ submitted: !!existing });
});

// Submit survey
app.post('/api/submit', (req, res) => {
  const fp = getFingerprint(req);

  const existing = db.prepare('SELECT id FROM devices WHERE fingerprint = ?').get(fp);
  if (existing) {
    return res.status(403).json({ error: 'Bu cihazdan daha önce yanıt verilmiş.' });
  }

  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Geçersiz veri.' });
  }

  const questionIds = Object.keys(answers).map(Number);
  if (questionIds.length !== QUESTIONS.length) {
    return res.status(400).json({ error: 'Tüm sorular cevaplanmalıdır.' });
  }

  for (const [qid, score] of Object.entries(answers)) {
    if (![1,2,3,4,5].includes(Number(score))) {
      return res.status(400).json({ error: 'Geçersiz puan değeri.' });
    }
  }

  const sessionId = uuidv4();
  const insertDevice = db.prepare('INSERT INTO devices (fingerprint) VALUES (?)');
  const insertResponse = db.prepare(
    'INSERT INTO responses (session_id, device_fingerprint, question_id, score) VALUES (?, ?, ?, ?)'
  );

  const submitAll = db.transaction(() => {
    insertDevice.run(fp);
    for (const [qid, score] of Object.entries(answers)) {
      insertResponse.run(sessionId, fp, Number(qid), Number(score));
    }
  });

  submitAll();
  res.json({ success: true });
});

// Admin: simple password check
function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-password'];
  if (auth !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' });
  next();
}

// Admin report API
app.get('/api/report', adminAuth, (req, res) => {
  const totalDevices = db.prepare('SELECT COUNT(*) as n FROM devices').get().n;

  const questionStats = db.prepare(`
    SELECT question_id,
           ROUND(AVG(score), 2) as avg_score,
           COUNT(*) as response_count,
           SUM(CASE WHEN score >= 4 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as positive_pct,
           SUM(CASE WHEN score = 3 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as neutral_pct,
           SUM(CASE WHEN score <= 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as negative_pct
    FROM responses GROUP BY question_id ORDER BY question_id
  `).all();

  // Category aggregates
  const categoryMap = {};
  for (const q of QUESTIONS) {
    if (!categoryMap[q.category]) categoryMap[q.category] = [];
    const stat = questionStats.find(s => s.question_id === q.id);
    if (stat) categoryMap[q.category].push(stat.avg_score);
  }
  const categoryStats = Object.entries(categoryMap).map(([cat, scores]) => ({
    category: cat,
    avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
  })).sort((a, b) => a.avg - b.avg);

  const enriched = questionStats.map(s => {
    const q = QUESTIONS.find(q => q.id === s.question_id);
    const net = s.positive_pct - s.negative_pct;
    return {
      ...s,
      text: q?.text,
      category: q?.category,
      net_score: Math.round(net * 100) / 100,
      positive_pct: Math.round(s.positive_pct * 10) / 10,
      neutral_pct: Math.round(s.neutral_pct * 10) / 10,
      negative_pct: Math.round(s.negative_pct * 10) / 10,
    };
  });

  res.json({
    total_participants: totalDevices,
    questions: enriched,
    categories: categoryStats,
    generated_at: new Date().toISOString(),
  });
});

// CSV export
app.get('/api/export', adminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.session_id, r.question_id, q_text.text, r.score, r.created_at
    FROM responses r
    JOIN (VALUES ${QUESTIONS.map(q => `(${q.id}, '${q.text.replace(/'/g,"''")}', '${q.category}')`).join(',')})
      AS q_text(id, text, category) ON r.question_id = q_text.id
    ORDER BY r.session_id, r.question_id
  `).all();

  let csv = 'Oturum ID,Soru ID,Soru,Puan,Tarih\n';
  for (const r of rows) {
    csv += `"${r.session_id}","${r.question_id}","${r.text}","${r.score}","${r.created_at}"\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="anket_sonuclari.csv"');
  res.send('\uFEFF' + csv);
});

app.listen(PORT, () => {
  console.log(`✅ Anket sunucusu çalışıyor: http://localhost:${PORT}`);
  console.log(`🔑 Admin şifresi: ${ADMIN_PASSWORD}`);
});
