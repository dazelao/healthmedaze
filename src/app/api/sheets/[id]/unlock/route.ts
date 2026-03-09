import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSheetSession } from "@/lib/auth";

// POST /api/sheets/[id]/unlock
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { password } = await req.json();

  const sheet = await prisma.sheet.findUnique({ where: { id } });
  if (!sheet) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!sheet.passwordHash) {
    return NextResponse.json({ ok: true }); // Нет пароля — всегда открыт
  }

  const valid = await verifyPassword(password, sheet.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  await setSheetSession(id);
  return NextResponse.json({ ok: true });
}
