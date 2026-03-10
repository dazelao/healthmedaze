import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/telegram/webhook
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ ok: true });

    // Допоміжні функції Telegram API
    const answerCallbackQuery = async (callbackQueryId: string, text: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
      });
    };

    const editMessageText = async (chatId: number, messageId: number, text: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
      });
    };

    const editMessageReplyMarkup = async (chatId: number, messageId: number, keyboard: { text: string; callback_data: string }[][]) => {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }),
      });
    };

    // Обробка натискання inline кнопки
    const callbackQuery = update.callback_query;
    if (callbackQuery) {
      const cbData = callbackQuery.data as string;
      const cbChatId = callbackQuery.message.chat.id;
      const cbMessageId = callbackQuery.message.message_id;
      const cbTelegramId = String(callbackQuery.from.id);

      if (cbData === "take_all") {
        // Читаємо IDs прямо з кнопок повідомлення — тільки те що показано
        const cbKeyboard = callbackQuery.message.reply_markup?.inline_keyboard as
          { text: string; callback_data: string }[][] | undefined;

        const medIds = (cbKeyboard ?? [])
          .flat()
          .filter((btn) => btn.callback_data.startsWith("take_"))
          .map((btn) => btn.callback_data.slice(5));

        if (medIds.length > 0) {
          await prisma.medication.updateMany({
            where: { id: { in: medIds } },
            data: { isTaken: true, takenAt: new Date() },
          });
        }
        await answerCallbackQuery(callbackQuery.id, "✅ Всі прийнято!");
        await editMessageText(cbChatId, cbMessageId, "✅ Всі ліки прийнято!");

      } else if (cbData?.startsWith("take_")) {
        const medId = cbData.slice(5);
        const med = await prisma.medication.findUnique({ where: { id: medId } });
        if (med && !med.isTaken) {
          await prisma.medication.update({ where: { id: medId }, data: { isTaken: true, takenAt: new Date() } });
        }
        await answerCallbackQuery(callbackQuery.id, `✅ ${med?.name ?? "Відмічено"}!`);

        // Прибрати кнопку з клавіатури
        const currentKeyboard = callbackQuery.message.reply_markup?.inline_keyboard as { text: string; callback_data: string }[][] | undefined;
        const remaining = (currentKeyboard ?? [])
          .flat()
          .filter((btn) => btn.callback_data !== cbData && btn.callback_data !== "take_all");

        if (remaining.length === 0) {
          await editMessageText(cbChatId, cbMessageId, "✅ Всі ліки прийнято!");
        } else {
          const newKeyboard = [
            ...remaining.map((btn) => [btn]),
            [{ text: "✓ Прийняти всі", callback_data: "take_all" }],
          ];
          await editMessageReplyMarkup(cbChatId, cbMessageId, newKeyboard);
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const telegramId = String(message.from.id);
    const text = message.text.trim();
    const chatId = message.chat.id;

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

      const nowUtc = new Date();
      const kyivHour = (nowUtc.getUTCHours() + 2) % 24;
      const kyivTotalMin = kyivHour * 60 + nowUtc.getUTCMinutes();

      const allNotTaken: { id: string; name: string; dosage: string | null }[] = [];

      for (const sheet of sheets) {
        const todayDay = sheet.days.find((d) => {
          if (!d.date) return false;
          const dayDate = new Date(d.date);
          dayDate.setHours(0, 0, 0, 0);
          return dayDate.getTime() === today.getTime();
        });
        if (!todayDay) continue;
        // All slots whose start time has passed
        const passedSlots: string[] = [];
        if (kyivHour >= 7) passedSlots.push("morning");
        if (kyivHour >= 11) passedSlots.push("noon");
        if (kyivHour >= 18) passedSlots.push("evening");

        const pending = todayDay.medications.filter((m) => {
          if (m.isTaken) return false;
          if (m.timeOfDay === "custom") {
            if (!m.customTime) return false;
            const [h, min] = m.customTime.split(":").map(Number);
            const medMin = h * 60 + (min || 0);
            // custom — час вже настав
            return medMin <= kyivTotalMin;
          }
          return passedSlots.length > 0
            ? passedSlots.includes(m.timeOfDay)
            : true; // до 7 ранку — всі
        });
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
