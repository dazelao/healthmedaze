import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "LINK-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/sheets/[id]/link-code — генерировать код привязки Telegram
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const code = generateCode();
  const exp = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

  await prisma.sheet.update({
    where: { id },
    data: { linkCode: code, linkCodeExp: exp },
  });

  return NextResponse.json({ code });
}

// GET /api/sheets/[id]/link-code — проверить статус привязки
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const sheet = await prisma.sheet.findUnique({
    where: { id },
    select: { telegramId: true },
  });

  return NextResponse.json({ linked: !!sheet?.telegramId });
}
