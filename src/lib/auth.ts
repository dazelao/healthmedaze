import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setSheetSession(sheetId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(`sheet_${sheetId}`, "unlocked", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 часа
    path: "/",
  });
}

export async function isSheetUnlocked(sheetId: string): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(`sheet_${sheetId}`)?.value === "unlocked";
}
