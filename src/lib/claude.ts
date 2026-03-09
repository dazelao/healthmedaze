import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ParsedMedication {
  name: string;
  dosage: string;
  timeOfDay: "morning" | "noon" | "evening" | "custom";
  customTime?: string;
}

export interface ParsedTreatmentPlan {
  title: string;
  durationDays: number;
  medications: ParsedMedication[];
}

export async function parseTreatmentText(
  ocrText: string
): Promise<ParsedTreatmentPlan> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Ты помощник по анализу медицинских назначений врача.
Тебе дан текст, извлечённый из фотографии назначения врача (OCR).
Извлеки из него план лечения и верни строго в JSON формате без лишнего текста.

Текст назначения:
${ocrText}

Верни JSON в следующем формате:
{
  "title": "короткое название (например: Лечение ОРВИ, Антибиотикотерапия)",
  "durationDays": число дней лечения (если не указано явно, определи по курсу),
  "medications": [
    {
      "name": "название препарата",
      "dosage": "дозировка (например: 500мг, 1 таблетка)",
      "timeOfDay": "morning" | "noon" | "evening" | "custom",
      "customTime": "ЧЧ:ММ если timeOfDay=custom, иначе не включай это поле"
    }
  ]
}

Правила:
- Если лекарство принимается несколько раз в день — добавь его несколько раз с разным timeOfDay
- timeOfDay: morning=утро, noon=обед/день, evening=вечер/ночь
- Если время нестандартное — используй custom и укажи customTime
- Если количество дней не указано, поставь 7
- Верни ТОЛЬКО JSON, никакого другого текста`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Вытаскиваем JSON из ответа
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude не вернул корректный JSON");
  }

  return JSON.parse(jsonMatch[0]) as ParsedTreatmentPlan;
}
