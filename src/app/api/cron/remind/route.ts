import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cron/remind — вызывается Vercel Cron каждые 15 минут
export async function GET(req: NextRequest) {
  // Защита: только Vercel Cron или наш secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentHour = now.getHours();

  // Определяем текущее timeOfDay
  let currentTimeOfDay: string | null = null;
  if (currentHour >= 7 && currentHour < 11) currentTimeOfDay = "morning";
  else if (currentHour >= 11 && currentHour < 16) currentTimeOfDay = "noon";
  else if (currentHour >= 18 && currentHour < 23) currentTimeOfDay = "evening";

  if (!currentTimeOfDay) {
    return NextResponse.json({ ok: true, skipped: "outside reminder hours" });
  }

  // Находим все листы с привязанным Telegram
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
  if (!botToken) return NextResponse.json({ ok: true, error: "no bot token" });

  for (const sheet of sheets) {
    if (!sheet.telegramId) continue;

    // Найти день на сегодня
    const todayDay = sheet.days.find((d) => {
      if (!d.date) return false;
      const dayDate = new Date(d.date);
      dayDate.setHours(0, 0, 0, 0);
      return dayDate.getTime() === today.getTime();
    });

    if (!todayDay) continue;

    // Непринятые лекарства для текущего времени
    const pendingMeds = todayDay.medications.filter(
      (m) => !m.isTaken && m.timeOfDay === currentTimeOfDay
    );

    if (pendingMeds.length === 0) continue;

    const timeLabel =
      currentTimeOfDay === "morning"
        ? "утренние"
        : currentTimeOfDay === "noon"
          ? "дневные"
          : "вечерние";

    const medList = pendingMeds
      .map((m) => `• ${m.name}${m.dosage ? ` (${m.dosage})` : ""}`)
      .join("\n");

    const message =
      `💊 <b>Напоминание!</b> ${timeLabel.charAt(0).toUpperCase() + timeLabel.slice(1)} лекарства — День ${todayDay.dayNumber}:\n\n` +
      `${medList}\n\n` +
      `Когда примете, напишите <b>/taken</b>`;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: sheet.telegramId,
          text: message,
          parse_mode: "HTML",
        }),
      });
      remindCount++;
    } catch (e) {
      console.error(`Failed to send reminder to ${sheet.telegramId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, remindCount });
}
