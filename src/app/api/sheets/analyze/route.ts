import { NextRequest, NextResponse } from "next/server";
import { parseTreatmentFromImage } from "@/lib/claude";

// POST /api/sheets/analyze — парсинг назначения через Claude Vision
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { imageBase64, mediaType } = body;

  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }

  let plan;
  try {
    plan = await parseTreatmentFromImage(
      imageBase64,
      mediaType || "image/jpeg"
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Parse failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ plan });
}
