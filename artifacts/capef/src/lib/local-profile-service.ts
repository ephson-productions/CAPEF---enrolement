import { db, type LocalUserProfileRecord } from './repositories/CapefDexieDatabase';

export const MAX_OFFLINE_DURATION_MS = 21 * 24 * 60 * 60 * 1000; // 21 days configurable offline limit

export type VerificationStatus =
  | 'verified-online'
  | 'offline-valid'
  | 'not-reverified-offline'
  | 'expired-readonly';

export interface LocalUserProfile {
  serverId: number;
  clerkUserId: string;
  name: string;
  email: string;
  role: string;
  regionId?: number | null;
  zones?: string[];
  lastOnlineVerification: string;
  pinHash?: string | null;
  pinSalt?: string | null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function getSubtleCrypto(): Crypto['subtle'] {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('[LocalProfileService] WebCrypto subtle is unavailable in this environment.');
}

function getRandomValues(array: Uint8Array): Uint8Array {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto.getRandomValues(array);
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto.getRandomValues(array);
  }
  throw new Error('[LocalProfileService] WebCrypto getRandomValues is unavailable in this environment.');
}

export class LocalProfileService {
  /**
   * Hashes a 4-6 digit numeric PIN using WebCrypto PBKDF2 with SHA-256 and a random salt.
   * Never stores raw PINs or plaintext credentials.
   */
  async hashPin(pin: string, existingSaltHex?: string | null): Promise<{ hashHex: string; saltHex: string }> {
    const subtle = getSubtleCrypto();
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);

    let saltBytes: Uint8Array;
    if (existingSaltHex) {
      saltBytes = hexToBytes(existingSaltHex);
    } else {
      saltBytes = new Uint8Array(16);
      getRandomValues(saltBytes);
    }

    const saltBuffer = new ArrayBuffer(saltBytes.length);
    new Uint8Array(saltBuffer).set(saltBytes);

    const keyMaterial = await subtle.importKey(
      'raw',
      pinBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedBits = await subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashBytes = new Uint8Array(derivedBits);
    return {
      hashHex: bytesToHex(hashBytes),
      saltHex: bytesToHex(saltBytes),
    };
  }

  /**
   * Persists a sanitized local user profile after online verification.
   * Strictly excludes Clerk session tokens, passwords, and raw secrets.
   */
  async saveProfile(
    profile: Omit<LocalUserProfile, 'pinHash' | 'pinSalt'>,
    pin?: string | null
  ): Promise<LocalUserProfileRecord> {
    const existing = await db.profiles.get(profile.clerkUserId);

    let pinHash = existing?.pinHash ?? null;
    let pinSalt = existing?.pinSalt ?? null;

    if (pin && pin.trim().length >= 4) {
      const { hashHex, saltHex } = await this.hashPin(pin.trim());
      pinHash = hashHex;
      pinSalt = saltHex;
    }

    const record: LocalUserProfileRecord = {
      clerkUserId: profile.clerkUserId,
      serverId: profile.serverId,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      regionId: profile.regionId ?? null,
      zones: profile.zones ?? [],
      lastOnlineVerification: profile.lastOnlineVerification || new Date().toISOString(),
      pinHash,
      pinSalt,
    };

    await db.profiles.put(record);

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('capef_last_known_user_id', profile.clerkUserId);
    }

    return record;
  }

  /**
   * Retrieves stored local profile by Clerk User ID.
   */
  async getProfile(clerkUserId: string): Promise<LocalUserProfileRecord | null> {
    if (!clerkUserId) return null;
    try {
      const record = await db.profiles.get(clerkUserId);
      return record ?? null;
    } catch (err) {
      console.error('[LocalProfileService] Error getting local profile:', err);
      return null;
    }
  }

  /**
   * Retrieves the last active user profile from LocalStorage last known user ID.
   */
  async getLastActiveProfile(): Promise<LocalUserProfileRecord | null> {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const lastUserId = window.localStorage.getItem('capef_last_known_user_id');
    if (!lastUserId) return null;
    return this.getProfile(lastUserId);
  }

  /**
   * Verifies candidate PIN against stored WebCrypto PBKDF2 hash.
   */
  async verifyPin(clerkUserId: string, pin: string): Promise<boolean> {
    const profile = await this.getProfile(clerkUserId);
    if (!profile || !profile.pinHash || !profile.pinSalt) {
      return false;
    }

    try {
      const { hashHex } = await this.hashPin(pin.trim(), profile.pinSalt);
      return hashHex === profile.pinHash;
    } catch (err) {
      console.error('[LocalProfileService] Error verifying PIN:', err);
      return false;
    }
  }

  /**
   * Checks if offline duration exceeds MAX_OFFLINE_DURATION_MS (21 days).
   */
  isOfflineExpired(lastOnlineVerification: string): boolean {
    if (!lastOnlineVerification) return true;
    const lastTime = new Date(lastOnlineVerification).getTime();
    if (isNaN(lastTime)) return true;
    return Date.now() - lastTime > MAX_OFFLINE_DURATION_MS;
  }

  /**
   * Computes offline verification status.
   */
  getVerificationStatus(isOnline: boolean, lastOnlineVerification: string): VerificationStatus {
    if (isOnline) {
      return 'verified-online';
    }

    if (this.isOfflineExpired(lastOnlineVerification)) {
      return 'expired-readonly';
    }

    return 'not-reverified-offline';
  }
}

export const localProfileService = new LocalProfileService();
