import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// GET /api/sheets — список всех листов
export async function GET() {
  const sheets = await prisma.sheet.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      days: {
        include: {
          medications: true,
        },
      },
    },
  });

  const sheetsWithProgress = sheets.map((sheet) => {
    const allMeds = sheet.days.flatMap((d) => d.medications);
    const taken = allMeds.filter((m) => m.isTaken).length;
    return {
      id: sheet.id,
      title: sheet.title,
      createdAt: sheet.createdAt,
      startDate: sheet.startDate,
      hasPassword: !!sheet.passwordHash,
      telegramLinked: !!sheet.telegramId,
      totalDays: sheet.days.length,
      totalMeds: allMeds.length,
      takenMeds: taken,
    };
  });

  return NextResponse.json(sheetsWithProgress);
}

// POST /api/sheets — создать лист
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, startDate, password, days } = body;

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const passwordHash = password ? await hashPassword(password) : null;

  const sheet = await prisma.sheet.create({
    data: {
      title,
      startDate: startDate ? new Date(startDate) : null,
      passwordHash,
      days: days
        ? {
            create: days.map(
              (day: {
                dayNumber: number;
                date?: string;
                medications: {
                  name: string;
                  dosage?: string;
                  timeOfDay: string;
                  customTime?: string;
                }[];
              }) => ({
                dayNumber: day.dayNumber,
                date: day.date ? new Date(day.date) : null,
                medications: {
                  create: day.medications.map((med) => ({
                    name: med.name,
                    dosage: med.dosage || null,
                    timeOfDay: med.timeOfDay || "morning",
                    customTime: med.customTime || null,
                  })),
                },
              })
            ),
          }
        : undefined,
    },
  });

  return NextResponse.json({ id: sheet.id });
}
