import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { getDb, type Db } from './db';
import { appUrl, fail, hash, publicUser, rateLimit, token, uuid } from './core';
import { enqueueMail } from './mail';
const derive = promisify(scrypt);
export const passwordSchema = z
  .string()
  .min(12, 'Usa al menos 12 caracteres para la contraseña.')
  .max(128);
const emailSchema = z.string().trim().toLowerCase().email('Escribe un correo válido.').max(254);
export async function passwordHash(password: string) {
  const salt = token().slice(0, 32);
  return `${salt}:${((await derive(password, salt, 64)) as Buffer).toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export async function sessionUser(request: Request) {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('sergod_session='))
    ?.slice(15);
  if (!raw) return null;
  const db = await getDb();
  const { rows } = await db.query(
    'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [hash(raw)],
  );
  return publicUser(rows[0]);
}
export async function requireUser(request: Request, admin = false) {
  const u = await sessionUser(request);
  if (!u) fail(401, 'Inicia sesión para continuar.');
  if (admin && u.role !== 'admin') fail(403, 'Esta acción requiere acceso de administrador.');
  return u;
}
export async function createSession(userId: string, db?: Db) {
  const raw = token();
  await (db || (await getDb())).query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [hash(raw), userId],
  );
  return raw;
}
export function sessionCookie(raw: string, clear = false) {
  return `sergod_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 2592000}${appUrl().startsWith('https://') ? '; Secure' : ''}`;
}
async function sendToken(tx: Db, user: any, purpose: 'verify' | 'reset') {
  await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
  const raw = token();
  await tx.query('DELETE FROM auth_tokens WHERE user_id=$1 AND purpose=$2', [user.id, purpose]);
  await tx.query(
    "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+($4||' minutes')::interval)",
    [hash(raw), user.id, purpose, purpose === 'verify' ? 1440 : 30],
  );
  const url = `${appUrl()}/cuenta/${purpose === 'verify' ? 'verificar' : 'restablecer'}?token=${raw}`;
  await enqueueMail(
    tx,
    `auth:${hash(raw)}`,
    user.email,
    purpose === 'verify'
      ? 'Verifica tu correo · SERGOD STORE'
      : 'Recupera tu contraseña · SERGOD STORE',
    `${user.name},\n\n${purpose === 'verify' ? 'Verifica tu correo para comprar y reservar productos' : 'Elige una nueva contraseña'}:\n${url}\n\nEste enlace vence en ${purpose === 'verify' ? '24 horas' : '30 minutos'}. Si no lo solicitaste, puedes ignorarlo.`,
  );
}
export async function register(input: unknown) {
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: emailSchema,
      password: passwordSchema,
    })
    .parse(input);
  await rateLimit(`register:${d.email}`, 3, 60);
  const db = await getDb();
  const p = await passwordHash(d.password);
  await db.transaction(async (tx) => {
    const existing = (await tx.query('SELECT id FROM users WHERE email=$1', [d.email])).rows[0];
    if (existing) return;
    const u = { id: uuid(), ...d };
    await tx.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [
      u.id,
      u.email,
      u.name,
      p,
    ]);
    await sendToken(tx, u, 'verify');
  });
  return {
    message:
      'Si el correo puede registrarse, recibirás un enlace para verificarlo. Si ya tienes cuenta, inicia sesión.',
  };
}
export async function login(input: unknown) {
  const d = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).parse(input);
  await rateLimit(`login:${d.email}`, 15, 15);
  return (await getDb()).transaction(async (tx) => {
    const u = (await tx.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [d.email])).rows[0];
    const valid = await passwordMatches(
      d.password,
      u?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!u || !valid) fail(401, 'El correo o la contraseña no coinciden.');
    return { user: publicUser(u), raw: await createSession(u.id, tx) };
  });
}
export async function logout(request: Request) {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('sergod_session='))
    ?.slice(15);
  if (raw) await (await getDb()).query('DELETE FROM sessions WHERE token_hash=$1', [hash(raw)]);
}
export async function forgot(input: unknown) {
  const { email } = z.object({ email: emailSchema }).parse(input);
  await rateLimit(`forgot:${email}`, 3, 60);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const u = (await tx.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    if (u) await sendToken(tx, u, 'reset');
  });
  return {
    message:
      'Si existe una cuenta con ese correo, recibirás un enlace para recuperar la contraseña.',
  };
}
export async function consumeToken(input: unknown, purpose: 'verify' | 'reset') {
  const d = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: purpose === 'reset' ? passwordSchema : z.string().optional(),
    })
    .parse(input);
  const db = await getDb();
  const p = purpose === 'reset' ? await passwordHash(d.password!) : '';
  await db.transaction(async (tx) => {
    const t = (
      await tx.query(
        'SELECT user_id FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()',
        [hash(d.token), purpose],
      )
    ).rows[0];
    if (!t) fail(400, 'Este enlace ya fue usado o venció. Solicita uno nuevo.');
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [t.user_id]);
    const consumed = await tx.query(
      'DELETE FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id',
      [hash(d.token), purpose],
    );
    if (!consumed.rows.length) fail(400, 'Este enlace ya fue usado o venció. Solicita uno nuevo.');
    if (purpose === 'verify')
      await tx.query('UPDATE users SET email_verified=true WHERE id=$1', [t.user_id]);
    else {
      await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [p, t.user_id]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [t.user_id]);
      await tx.query("DELETE FROM auth_tokens WHERE user_id=$1 AND purpose='reset'", [t.user_id]);
    }
  });
  return {
    message:
      purpose === 'verify'
        ? 'Correo verificado. Ya puedes iniciar sesión y comprar.'
        : 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
  };
}
export async function resend(user: any) {
  await rateLimit(`resend:${user.id}`, 3, 60);
  if (!user.email_verified)
    await (await getDb()).transaction((tx) => sendToken(tx, user, 'verify'));
  return { message: 'Enviamos un nuevo enlace de verificación.' };
}
export async function updateAccount(user: any, input: unknown) {
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().max(30).default(''),
      konami_id: z.string().max(50).default(''),
      klu_code: z.string().max(50).default(''),
      address: z.record(z.string().max(40), z.string().max(300)).default({}),
    })
    .parse(input);
  const { rows } = await (
    await getDb()
  ).query(
    'UPDATE users SET name=$2,phone=$3,konami_id=$4,klu_code=$5,address=$6 WHERE id=$1 RETURNING *',
    [user.id, d.name, d.phone, d.konami_id, d.klu_code, JSON.stringify(d.address)],
  );
  return publicUser(rows[0]);
}
