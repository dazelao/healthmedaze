import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSheetUnlocked } from "@/lib/auth";

// GET /api/sheets/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const sheet = await prisma.sheet.findUnique({
    where: { id },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          medications: {
            orderBy: [{ timeOfDay: "asc" }, { name: "asc" }],
          },
        },
      },
    },
  });

  if (!sheet) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Если лист защищён паролем — проверяем куку
  if (sheet.passwordHash) {
    const unlocked = await isSheetUnlocked(id);
    if (!unlocked) {
      return NextResponse.json({ locked: true, id, title: sheet.title });
    }
  }

  // Не отдаём хеш пароля клиенту
  const { passwordHash: _, ...safeSheet } = sheet;
  return NextResponse.json({
    ...safeSheet,
    hasPassword: !!sheet.passwordHash,
    telegramLinked: !!sheet.telegramId,
  });
}

// PATCH /api/sheets/[id] — обновить заголовок или дату
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();

  const sheet = await prisma.sheet.update({
    where: { id },
    data: {
      title: body.title,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
    },
  });

  return NextResponse.json({ id: sheet.id });
}

// DELETE /api/sheets/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  await prisma.sheet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
