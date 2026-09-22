/**
 * Almacenamiento de la sesión en iOS/Android: cifrado AES-256-GCM.
 * - La clave vive en el llavero del sistema (Keychain / Keystore) y no se copia a otros
 *   dispositivos ni a copias de seguridad (THIS_DEVICE_ONLY).
 * - El texto cifrado va a AsyncStorage; el nombre de la entrada se usa como dato autenticado
 *   (AAD), así que un valor no se puede mover de una entrada a otra sin que falle el descifrado.
 * - Si algo no cuadra (clave perdida, datos corruptos), se borra y el usuario vuelve a entrar.
 * En web se usa sessionStorage.web.ts (Metro elige el fichero por plataforma).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { utf8Decode, utf8Encode } from '../lib/utf8';

const KEY_NAME = 'organio.session-key.v1';
const PREFIX = 'organio.enc.';

let keyPromise: Promise<AESEncryptionKey> | null = null;

function getKey(): Promise<AESEncryptionKey> {
  keyPromise ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY_NAME);
    if (stored) return AESEncryptionKey.import(stored, 'hex');
    const key = await AESEncryptionKey.generate(AESKeySize.AES256);
    await SecureStore.setItemAsync(KEY_NAME, await key.encoded('hex'), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return key;
  })().catch((err: unknown) => {
    keyPromise = null;
    throw err;
  });
  return keyPromise;
}

export const sessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(PREFIX + name);
    if (!raw) return null;
    try {
      const plain = await aesDecryptAsync(AESSealedData.fromCombined(raw), await getKey(), {
        output: 'bytes',
        additionalData: utf8Encode(name),
      });
      return utf8Decode(plain);
    } catch {
      await AsyncStorage.removeItem(PREFIX + name);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const sealed = await aesEncryptAsync(utf8Encode(value), await getKey(), { additionalData: utf8Encode(name) });
    await AsyncStorage.setItem(PREFIX + name, await sealed.combined('base64'));
  },
  async removeItem(name: string): Promise<void> {
    await AsyncStorage.removeItem(PREFIX + name);
  },
};
