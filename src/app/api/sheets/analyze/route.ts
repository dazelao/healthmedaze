import { NextRequest, NextResponse } from "next/server";
import { extractTextFromImage } from "@/lib/ocr";
import { parseTreatmentText } from "@/lib/claude";

// POST /api/sheets/analyze — OCR + парсинг назначения
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { imageBase64 } = body;

  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }

  // Шаг 1: OCR — извлекаем текст из фото
  let ocrText: string;
  try {
    ocrText = await extractTextFromImage(imageBase64);
  } catch (e) {
    return NextResponse.json(
      { error: `OCR failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }

  if (!ocrText.trim()) {
    return NextResponse.json(
      { error: "Текст на фото не распознан" },
      { status: 422 }
    );
  }

  // Шаг 2: Claude — парсим структуру лечения
  let plan;
  try {
    plan = await parseTreatmentText(ocrText);
  } catch (e) {
    return NextResponse.json(
      { error: `Parse failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ocrText, plan });
}
