// Хеширование паролей для локальных профилей.
// Это прототип авторизации без внешних систем: пароль никогда не хранится
// в открытом виде — в базе лежат SHA-256 от соли и пароля.

const ITERATIONS = 1000;

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Многократный SHA-256 с солью — без внешних зависимостей.
 * Повторение нужно, чтобы простой перебор не был мгновенным.
 */
export async function hashPassword(password, salt) {
  let value = `${salt}:${password}`;
  let digest = await sha256(value);

  for (let i = 1; i < ITERATIONS; i += 1) {
    digest = await sha256(`${toHex(digest)}:${salt}`);
  }

  return toHex(digest);
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await hashPassword(password, salt);
  // Сравнение без раннего выхода.
  if (hash.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i += 1) {
    result |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return result === 0;
}