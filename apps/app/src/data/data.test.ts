import { ZodError, z } from 'zod';
import { describe, expect, it } from 'vitest';
import { isSecretKey, readPublicEnv } from './env';
import { toUserError } from './errors';

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

describe('env', () => {
  it('rechaza claves secretas en la app', () => {
    expect(isSecretKey(jwt({ role: 'service_role' }))).toBe(true);
    expect(isSecretKey('sb_secret_abc')).toBe(true);
    expect(isSecretKey(jwt({ role: 'anon' }))).toBe(false);
    expect(isSecretKey('sb_publishable_abc')).toBe(false);
    expect(() => readPublicEnv('http://127.0.0.1:54321', jwt({ role: 'service_role' }))).toThrow(/SECRETA/);
  });
  it('exige configuración y normaliza la URL', () => {
    expect(() => readPublicEnv(undefined, 'k')).toThrow(/Faltan/);
    expect(readPublicEnv('http://127.0.0.1:54321/', 'k').supabaseUrl).toBe('http://127.0.0.1:54321');
  });
});

describe('errores para el usuario', () => {
  it('traduce los códigos de la base de datos', () => {
    expect(toUserError({ code: '22023', message: 'Transición no permitida: done → blocked' }).message).toMatch(/estado no está permitido/);
    expect(toUserError({ code: '42501', message: 'permission denied' }).message).toMatch(/permiso/);
    expect(toUserError({ code: '23514' }).message).toMatch(/límites/);
  });
  it('traduce los de autenticación', () => {
    expect(toUserError({ code: 'otp_expired', message: 'Token has expired or is invalid' }).message).toMatch(/caducado/);
    expect(toUserError({ status: 429, message: 'rate limit' }).retryable).toBe(true);
    expect(toUserError({ message: 'Database error saving new user' }).message).toMatch(/no tiene acceso/);
  });
  it('reconoce la falta de conexión en todos los motores', () => {
    for (const message of ['TypeError: fetch failed', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
      expect(toUserError({ message, code: '' })).toEqual({ message: 'Sin conexión con el servidor. Comprueba tu red.', retryable: true });
    }
  });
  it('usa el mensaje de validación y nunca filtra detalles internos', () => {
    let zerr: unknown;
    try {
      z.string().min(3, 'Muy corto').parse('a');
    } catch (e) {
      zerr = e;
    }
    expect(zerr).toBeInstanceOf(ZodError);
    expect(toUserError(zerr).message).toBe('Muy corto');
    expect(toUserError({ code: 'XX000', message: 'relation private.secret does not exist' }).message).not.toMatch(/private/);
  });
});
