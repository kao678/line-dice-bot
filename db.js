// db.js — SQLite Persistent DB (Render)
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Render: ใช้โฟลเดอร์ /var/data สำหรับ persistent disk
const DB_PATH = process.env.DB_PATH || path.join("/var/data", "database.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("❌ DB connect error:", err);
  } else {
    console.log("✅ DB connected:", DB_PATH);
  }
});

// ===== INIT TABLES =====
db.serialize(() => {
  // USERS
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      credit INTEGER DEFAULT 0,
      blocked INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // BETS
  db.run(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      face INTEGER,
      amount INTEGER,
      round INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // RESULTS
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      round INTEGER PRIMARY KEY,
      d1 INTEGER,
      d2 INTEGER,
      d3 INTEGER,
      result INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // REPORT (สรุปต่อรอบ)
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round INTEGER,
      win INTEGER,
      lose INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // SETTINGS
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// ===== HELPERS =====
module.exports = {
  db,

  // ---------- USER ----------
  getUser(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE userId = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          if (!row) {
            db.run(
              `INSERT INTO users (userId) VALUES (?)`,
              [userId],
              () => resolve({ userId, credit: 0, blocked: 0 })
            );
          } else resolve(row);
        }
      );
    });
  },

  updateCredit(userId, amount) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET credit = credit + ? WHERE userId = ?`,
        [amount, userId],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  setBlocked(userId, blocked) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET blocked = ? WHERE userId = ?`,
        [blocked ? 1 : 0, userId],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  // ---------- BET ----------
  addBet({ userId, face, amount, round }) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO bets (userId, face, amount, round) VALUES (?,?,?,?)`,
        [userId, face, amount, round],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  clearBets(round) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM bets WHERE round = ?`,
        [round],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  // ---------- RESULT ----------
  saveResult({ round, d1, d2, d3, result }) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO results (round,d1,d2,d3,result) VALUES (?,?,?,?,?)`,
        [round, d1, d2, d3, result],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  getLastResults(limit = 12) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM results ORDER BY round DESC LIMIT ?`,
        [limit],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  },

  // ---------- SETTINGS ----------
  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`,
        [key, value],
        (err) => (err ? reject(err) : resolve())
      );
    });
  },

  getSetting(key, def = null) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT value FROM settings WHERE key = ?`,
        [key],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.value : def);
        }
      );
    });
  },
};
