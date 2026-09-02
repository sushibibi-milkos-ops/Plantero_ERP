import bcrypt from 'bcryptjs';

const ROUNDS = 10;

/** bcryptjs, 10 tur */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 4) throw new Error('Parola en az 4 karakter olmalı');
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Operatör tablet PIN'i (4-6 hane) — aynı algoritma */
export const hashPin = (pin: string) => hashPassword(pin);
export const verifyPin = (pin: string, hash: string | null | undefined) => verifyPassword(pin, hash);
