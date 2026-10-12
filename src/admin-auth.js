import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function temporaryPassword() { const raw = randomBytes(8); return Array.from(raw, b => alphabet[b % alphabet.length]).join(''); }
function derive(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
export function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${derive(password, salt)}`; }
function match(password, hash) { const [salt, expected] = String(hash || '').split(':'); if (!salt || !expected) return false; const a = Buffer.from(derive(password, salt), 'hex'), b = Buffer.from(expected, 'hex'); return a.length === b.length && timingSafeEqual(a, b); }
export function assertNewPassword(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) throw Error('New password must be 12-128 characters with uppercase, lowercase and a digit'); }
export function makeAccount(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_users (username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  let initial = null;
  if (!db.prepare('SELECT username FROM admin_users LIMIT 1').get()) {
    initial = temporaryPassword(); db.prepare('INSERT INTO admin_users VALUES (?,?,1,?)').run('admin', hashPassword(initial), Date.now());
  }
  const clean = () => db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').run(Date.now());
  function login(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256) return null;
    const user = db.prepare('SELECT * FROM admin_users WHERE username=?').get(username);
    if (!user || !match(password, user.password_hash)) return null;
    clean(); const token = `cm_admin_${randomBytes(32).toString('base64url')}`;
    db.prepare('INSERT INTO admin_sessions VALUES (?,?,?)').run(hashToken(token), user.username, Date.now() + 8 * 3600000);
    return { token, username: user.username, mustChangePassword: !!user.must_change, expiresIn: 28800 };
  }
  function hashToken(token) { return (typeof token === 'string' && token.length <= 256) ? createHash('sha256').update(token).digest('hex') : ''; }
  function verify(token) {    
if (typeof token !== 'string' || !token.startsWith('cm_admin_') || token.length > 200) return null;
    const row = db.prepare('SELECT s.username,u.must_change FROM admin_sessions s JOIN admin_users u ON s.username=u.username WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token), Date.now()); return row ? { username: row.username, mustChangePassword: !!row.must_change, legacy: false } : null;
  }
  function change(username, oldPassword, newPassword) {    
assertNewPassword(newPassword); const user = db.prepare('SELECT * FROM admin_users WHERE username=?').get(username); if (!user || !match(oldPassword, user.password_hash)) throw Error('Current password is incorrect');
    if (oldPassword === newPassword) throw Error('New password must be different');
    db.prepare('UPDATE admin_users SET password_hash=?,must_change=0,updated_at=? WHERE username=?').run(hashPassword(newPassword), Date.now(), username);
    db.prepare('DELETE FROM admin_sessions WHERE username=?').run(username); return { changed: true };
  }
  function reset() { const temporary = temporaryPassword(); db.prepare('UPDATE admin_users SET password_hash=?,must_change=1,updated_at=? WHERE username=?').run(hashPassword(temporary), Date.now(), 'admin'); db.prepare('DELETE FROM admin_sessions').run(); return temporary; }
  function logout(token) { if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hashToken(token)); }
  return { initial, login, verify, change, logout, reset };
}
