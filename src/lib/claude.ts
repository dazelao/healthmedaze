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

export async function parseTreatmentFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg"
): Promise<ParsedTreatmentPlan> {
  const prompt = `Ты медицинский ассистент. Внимательно прочитай фото назначения врача (документ может быть на русском или украинском языке).

ВАЖНО: Извлекай препараты ТОЛЬКО из раздела "Лікування" / "Лечение" / "Назначения". НЕ включай препараты из анамнеза, истории болезни или предыдущих назначений.

Верни ТОЛЬКО JSON без лишнего текста:
{
  "title": "краткое название болезни из диагноза (например: ОРВИ, Ангина)",
  "durationDays": число дней лечения (определи по самому длинному курсу препаратов, если не указано явно — 7),
  "medications": [
    {
      "name": "точное название препарата как написано",
      "dosage": "дозировка и способ приёма (например: 1т, 500мг, 2 дози, 1 дес.л.)",
      "timeOfDay": "morning" | "noon" | "evening" | "custom",
      "customTime": "ЧЧ:ММ только если timeOfDay=custom"
    }
  ]
}

Правила:
- Включи ВСЕ препараты из раздела лечения, даже процедуры (промывание носа, ингаляции и т.д.)
- Если препарат принимается 2р/д — добавь 2 записи (morning + evening)
- Если 3р/д — добавь 3 записи (morning + noon + evening)
- Если 4р/д — добавь 4 записи (morning + noon + evening + custom 21:00)
- Если "при необходимости" / "при закладеності" — добавь 1 запись с timeOfDay=custom
- timeOfDay: morning=утро, noon=обед, evening=вечер, custom=нестандартное время
- Для курсовых (например "3 дня") — учитывай в durationDays
- Верни ТОЛЬКО JSON, никакого другого текста`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude не вернул корректный JSON");
  }

  return JSON.parse(jsonMatch[0]) as ParsedTreatmentPlan;
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
