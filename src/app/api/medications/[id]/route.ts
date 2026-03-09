import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/medications/[id] — обновить (отметить принятым)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();

  const med = await prisma.medication.update({
    where: { id },
    data: {
      ...(body.isTaken !== undefined && { isTaken: body.isTaken, takenAt: body.isTaken ? new Date() : null }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.dosage !== undefined && { dosage: body.dosage }),
      ...(body.timeOfDay !== undefined && { timeOfDay: body.timeOfDay }),
      ...(body.customTime !== undefined && { customTime: body.customTime }),
    },
  });

  return NextResponse.json(med);
}

// DELETE /api/medications/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  await prisma.medication.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
