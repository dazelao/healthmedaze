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
          "❌ Код не знайдено або він застарів. Згенеруйте новий код у додатку."
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
        `✅ Telegram успішно підключено до листа лікування <b>${sheet.title}</b>!\n\nТепер я буду нагадувати про прийом ліків. Коли приймете — відповідайте <b>/taken</b>`
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
        await sendMessage("❌ Лист лікування не знайдено. Підключіть його через додаток.");
        return NextResponse.json({ ok: true });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Визначити поточний часовий слот (UTC+2, Київ)
      const kyivHour = (new Date().getUTCHours() + 2) % 24;
      let currentTimeOfDay: string;
      if (kyivHour >= 7 && kyivHour < 11) currentTimeOfDay = "morning";
      else if (kyivHour >= 11 && kyivHour < 16) currentTimeOfDay = "noon";
      else if (kyivHour >= 18 && kyivHour < 23) currentTimeOfDay = "evening";
      else currentTimeOfDay = "any"; // поза вікнами — відмічати всі

      const allNotTaken: { id: string; name: string; dosage: string | null }[] = [];

      for (const sheet of sheets) {
        const todayDay = sheet.days.find((d) => {
          if (!d.date) return false;
          const dayDate = new Date(d.date);
          dayDate.setHours(0, 0, 0, 0);
          return dayDate.getTime() === today.getTime();
        });
        if (!todayDay) continue;
        const pending = todayDay.medications.filter(
          (m) => !m.isTaken && (currentTimeOfDay === "any" || m.timeOfDay === currentTimeOfDay)
        );
        allNotTaken.push(...pending);
      }

      if (allNotTaken.length === 0) {
        await sendMessage("✅ Всі ліки на сьогодні вже відмічені як прийняті!");
        return NextResponse.json({ ok: true });
      }

      await prisma.medication.updateMany({
        where: { id: { in: allNotTaken.map((m) => m.id) } },
        data: { isTaken: true, takenAt: new Date() },
      });

      const names = allNotTaken.map((m) => `• ${m.name}${m.dosage ? ` ${m.dosage}` : ""}`).join("\n");
      await sendMessage(`✅ Чудово! Відмічено як прийняте:\n${names}`);
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
        await sendMessage("❌ Лист лікування не підключено.");
        return NextResponse.json({ ok: true });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const timeLabels: Record<string, string> = {
        morning: "🌅 Ранок",
        noon: "☀️ Обід",
        evening: "🌙 Вечір",
        custom: "⏰ За часом",
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

      await sendMessage(fullText || "📅 Сьогодні немає запланованих ліків.");
      return NextResponse.json({ ok: true });
    }

    // /start — приветствие
    if (text === "/start") {
      await sendMessage(
        "👋 Привіт! Я бот для відстеження прийому ліків.\n\n" +
          "Щоб підключити лист лікування:\n" +
          "1. Відкрийте додаток\n" +
          "2. Зайдіть у налаштування листа\n" +
          "3. Натисніть «Підключити Telegram»\n" +
          "4. Надішліть мені отриманий код (вигляду LINK-XXXXXX)\n\n" +
          "Команди:\n" +
          "/taken — відмітити ліки як прийняті\n" +
          "/status — розклад на сьогодні"
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true }); // Всегда возвращаем 200 для Telegram
  }
}
