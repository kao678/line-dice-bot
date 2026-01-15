// db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// สำหรับ Render แนะนำใช้ /var/data
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.db");

const db = new sqlite3.Database(DB_PATH);

// ===== CREATE TABLE =====
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      credit INTEGER DEFAULT 1000
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round INTEGER,
      d1 INTEGER,
      d2 INTEGER,
      d3 INTEGER,
      sum INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ===== FUNCTIONS =====
module.exports = {
  getUser(userId) {
    return new Promise((resolve) => {
      db.get(
        "SELECT * FROM users WHERE userId = ?",
        [userId],
        (err, row) => {
          if (!row) {
            db.run(
              "INSERT INTO users (userId, credit) VALUES (?, 1000)",
              [userId],
              () => resolve({ userId, credit: 1000 })
            );
          } else {
            resolve(row);
          }
        }
      );
    });
  },

  updateCredit(userId, credit) {
    return new Promise((resolve) => {
      db.run(
        "UPDATE users SET credit = ? WHERE userId = ?",
        [credit, userId],
        resolve
      );
    });
  },

  saveResult(round, d1, d2, d3, sum) {
    return new Promise((resolve) => {
      db.run(
        "INSERT INTO history (round,d1,d2,d3,sum) VALUES (?,?,?,?,?)",
        [round, d1, d2, d3, sum],
        resolve
      );
    });
  },

  getHistory(limit = 10) {
    return new Promise((resolve) => {
      db.all(
        "SELECT * FROM history ORDER BY id DESC LIMIT ?",
        [limit],
        (err, rows) => resolve(rows || [])
      );
    });
  },
};
