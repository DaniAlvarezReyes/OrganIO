/**
 * Almacenamiento de la sesión en web. El navegador no ofrece un almacén cifrado accesible
 * desde JavaScript: la protección real aquí es impedir XSS (CSP estricta en public/_headers,
 * ningún HTML dinámico) y la corta vida de los tokens (1 h, con rotación del token de refresco).
 */
function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // modo privado estricto u otro bloqueo del navegador
  }
}

export const sessionStorage = {
  async getItem(name: string): Promise<string | null> {
    return store()?.getItem(name) ?? null;
  },
  async setItem(name: string, value: string): Promise<void> {
    store()?.setItem(name, value);
  },
  async removeItem(name: string): Promise<void> {
    store()?.removeItem(name);
  },
};
