/**
 * Карта 120×120 — это 14 400 чисел. Отправлять её JSON-массивом чисел слишком жирно,
 * поэтому пакуем в строку base64: одному числу от 0 до 255 хватает одного символа.
 * Полная карта уходит клиенту один раз при входе, дальше летят только дельты.
 *
 * btoa/atob работают со строками, где один символ — это один байт, поэтому перед
 * кодированием байты превращаем в символы, а после декодирования — обратно.
 */

/** Uint8Array → base64. Работает и в Bun, и в браузере. */
export function encodeBytes(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

/** base64 → Uint8Array. */
export function decodeBytes(encoded: string): Uint8Array {
  const text = atob(encoded);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}
