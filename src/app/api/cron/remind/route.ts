import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function runReminders(forcedTimeOfDay?: string) {
  const now = new Date();
  // Vercel работает в UTC, добавляем +2 для Киева
  const kyivHour = (now.getUTCHours() + 2) % 24;

  let currentTimeOfDay: string | null = forcedTimeOfDay ?? null;

  if (!currentTimeOfDay) {
    if (kyivHour >= 7 && kyivHour < 11) currentTimeOfDay = "morning";
    else if (kyivHour >= 11 && kyivHour < 16) currentTimeOfDay = "noon";
    else if (kyivHour >= 18 && kyivHour < 23) currentTimeOfDay = "evening";
  }

  if (!currentTimeOfDay) {
    return { ok: true, skipped: "outside reminder hours", kyivHour };
  }

  const sheets = await prisma.sheet.findMany({
    where: { telegramId: { not: null } },
    include: {
      days: {
        include: { medications: true },
        orderBy: { dayNumber: "asc" },
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let remindCount = 0;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, error: "no bot token" };

  for (const sheet of sheets) {
    if (!sheet.telegramId) continue;

    const todayDay = sheet.days.find((d) => {
      if (!d.date) return false;
      const dayDate = new Date(d.date);
      dayDate.setHours(0, 0, 0, 0);
      return dayDate.getTime() === today.getTime();
    });

    if (!todayDay) continue;

    // Поточний час у хвилинах (UTC+2)
    const nowUtc = new Date();
    const kyivMin = nowUtc.getUTCMinutes();
    const kyivTotalMin = kyivHour * 60 + kyivMin;

    const pendingMeds = todayDay.medications.filter((m) => {
      if (m.isTaken) return false;
      if (m.timeOfDay === "custom") {
        if (!m.customTime) return false; // без часу — не нагадувати
        const [h, min] = m.customTime.split(":").map(Number);
        const medMin = h * 60 + (min || 0);
        // Включити якщо час настав (±30 хв вікно)
        return medMin >= kyivTotalMin - 30 && medMin <= kyivTotalMin + 30;
      }
      return m.timeOfDay === currentTimeOfDay;
    });

    if (pendingMeds.length === 0) continue;

    const timeLabel =
      currentTimeOfDay === "morning"
        ? "Ранкові"
        : currentTimeOfDay === "noon"
          ? "Денні"
          : "Вечірні";

    const medList = pendingMeds
      .map((m) => `• ${m.name}${m.dosage ? ` (${m.dosage})` : ""}`)
      .join("\n");

    const text =
      `💊 <b>Нагадування!</b> ${timeLabel} ліки — День ${todayDay.dayNumber}:\n\n` +
      `${medList}`;

    const keyboard = [
      ...pendingMeds.map((m) => [{
        text: `✅ ${m.name}`,
        callback_data: `take_${m.id}`,
      }]),
      [{ text: "✓ Прийняти всі", callback_data: "take_all" }],
    ];

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: sheet.telegramId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      }),
    });

    remindCount++;
  }

  return {
    ok: true,
    time: now.toISOString(),
    kyivHour,
    timeOfDay: currentTimeOfDay,
    remindCount,
  };
}

// POST — вызывается с твоего сервера
export async function POST(req: NextRequest) {
  let forcedTimeOfDay: string | undefined;
  try {
    const body = await req.json();
    forcedTimeOfDay = body?.timeOfDay;
  } catch {
    // тело пустое — ок
  }

  const result = await runReminders(forcedTimeOfDay);
  return NextResponse.json(result);
}

// GET — оставлен для обратной совместимости / ручной проверки
export async function GET() {
  const result = await runReminders();
  return NextResponse.json(result);
}
