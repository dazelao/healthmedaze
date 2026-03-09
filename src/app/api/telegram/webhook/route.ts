import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/telegram/webhook
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const telegramId = String(message.from.id);
    const text = message.text.trim();
    const chatId = message.chat.id;

    // Токен бота для отправки ответов
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ ok: true });

    const sendMessage = async (msg: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: "HTML",
        }),
      });
    };

    // Привязка по коду LINK-XXXXXX
    if (text.startsWith("LINK-")) {
      const sheet = await prisma.sheet.findFirst({
        where: {
          linkCode: text,
          linkCodeExp: { gt: new Date() },
        },
      });

      if (!sheet) {
        await sendMessage(
          "❌ Код не найден или истёк. Сгенерируйте новый код в приложении."
        );
        return NextResponse.json({ ok: true });
      }

      await prisma.sheet.update({
        where: { id: sheet.id },
        data: {
          telegramId,
          linkCode: null,
          linkCodeExp: null,
        },
      });

      await sendMessage(
        `✅ Telegram успешно подключён к листу лечения <b>${sheet.title}</b>!\n\nТеперь я буду напоминать о приёме лекарств. Когда примёте — ответьте <b>/taken</b>`
      );
      return NextResponse.json({ ok: true });
    }

    // /taken — отметить текущий приём как выполненный (во ВСЕХ подключённых листах)
    if (text === "/taken" || text === "/taken@" + process.env.BOT_USERNAME) {
      const sheets = await prisma.sheet.findMany({
        where: { telegramId },
        include: {
          days: {
            include: { medications: true },
            orderBy: { dayNumber: "asc" },
          },
        },
      });

      if (sheets.length === 0) {
        await sendMessage("❌ Лист лечения не найден. Подключите его через приложение.");
        return NextResponse.json({ ok: true });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allNotTaken: { id: string; name: string; dosage: string | null }[] = [];

      for (const sheet of sheets) {
        const todayDay = sheet.days.find((d) => {
          if (!d.date) return false;
          const dayDate = new Date(d.date);
          dayDate.setHours(0, 0, 0, 0);
          return dayDate.getTime() === today.getTime();
        });
        if (!todayDay) continue;
        const pending = todayDay.medications.filter((m) => !m.isTaken);
        allNotTaken.push(...pending);
      }

      if (allNotTaken.length === 0) {
        await sendMessage("✅ Все лекарства на сегодня уже отмечены как принятые!");
        return NextResponse.json({ ok: true });
      }

      await prisma.medication.updateMany({
        where: { id: { in: allNotTaken.map((m) => m.id) } },
        data: { isTaken: true, takenAt: new Date() },
      });

      const names = allNotTaken.map((m) => `• ${m.name}${m.dosage ? ` ${m.dosage}` : ""}`).join("\n");
      await sendMessage(`✅ Отлично! Отмечено как принятое:\n${names}`);
      return NextResponse.json({ ok: true });
    }

    // /status — показать сегодняшнее расписание по всем листам
    if (text === "/status") {
      const sheets = await prisma.sheet.findMany({
        where: { telegramId },
        include: {
          days: {
            include: { medications: true },
            orderBy: { dayNumber: "asc" },
          },
        },
      });

      if (sheets.length === 0) {
        await sendMessage("❌ Лист лечения не подключён.");
        return NextResponse.json({ ok: true });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const timeLabels: Record<string, string> = {
        morning: "🌅 Утро",
        noon: "☀️ Обед",
        evening: "🌙 Вечер",
        custom: "⏰ По времени",
      };

      let fullText = "";

      for (const sheet of sheets) {
        const todayDay = sheet.days.find((d) => {
          if (!d.date) return false;
          const dayDate = new Date(d.date);
          dayDate.setHours(0, 0, 0, 0);
          return dayDate.getTime() === today.getTime();
        });
        if (!todayDay) continue;

        const byTime = todayDay.medications.reduce(
          (acc, m) => {
            if (!acc[m.timeOfDay]) acc[m.timeOfDay] = [];
            acc[m.timeOfDay].push(m);
            return acc;
          },
          {} as Record<string, typeof todayDay.medications>
        );

        fullText += `📋 <b>${sheet.title}</b> — День ${todayDay.dayNumber}\n`;
        for (const [time, meds] of Object.entries(byTime)) {
          fullText += `${timeLabels[time] || time}:\n`;
          for (const m of meds) {
            fullText += `${m.isTaken ? "✅" : "⬜"} ${m.name}${m.dosage ? ` ${m.dosage}` : ""}\n`;
          }
        }
        fullText += "\n";
      }

      await sendMessage(fullText || "📅 Сегодня нет запланированных лекарств.");
      return NextResponse.json({ ok: true });
    }

    // /start — приветствие
    if (text === "/start") {
      await sendMessage(
        "👋 Привет! Я бот для отслеживания приёма лекарств.\n\n" +
          "Чтобы подключить лист лечения:\n" +
          "1. Откройте приложение\n" +
          "2. Зайдите в настройки листа\n" +
          "3. Нажмите «Подключить Telegram»\n" +
          "4. Отправьте мне полученный код (вида LINK-XXXXXX)\n\n" +
          "Команды:\n" +
          "/taken — отметить лекарства как принятые\n" +
          "/status — расписание на сегодня"
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true }); // Всегда возвращаем 200 для Telegram
  }
}
