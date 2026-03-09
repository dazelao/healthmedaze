import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/days/[id]/medications — добавить лекарство в день
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { name, dosage, timeOfDay, customTime } = body;

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const med = await prisma.medication.create({
    data: {
      dayId: id,
      name,
      dosage: dosage || null,
      timeOfDay: timeOfDay || "morning",
      customTime: customTime || null,
    },
  });

  return NextResponse.json(med);
}
