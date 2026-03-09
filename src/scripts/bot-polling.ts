/**
 * Запускается только в DEV режиме вместо webhook
 * npx ts-node src/scripts/bot-polling.ts
 * или через: npm run bot:dev
 */
import "dotenv/config";
import { Telegraf } from "telegraf";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

bot.start(async (ctx) => {
  await ctx.reply(
    "👋 Привет! Я бот для отслеживания приёма лекарств.\n\n" +
      "Чтобы подключить лист лечения:\n" +
      "1. Откройте приложение\n" +
      "2. Зайдите в настройки листа (⚙️)\n" +
      "3. Нажмите «Подключить Telegram»\n" +
      "4. Отправьте мне полученный код (вида LINK-XXXXXX)\n\n" +
      "Команды:\n" +
      "/taken — отметить лекарства как принятые\n" +
      "/status — расписание на сегодня"
  );
});

bot.command("taken", async (ctx) => {
  const telegramId = String(ctx.from.id);

  const sheet = await prisma.sheet.findFirst({
    where: { telegramId },
    include: {
      days: { include: { medications: true }, orderBy: { dayNumber: "asc" } },
    },
  });

  if (!sheet) {
    return ctx.reply("❌ Лист лечения не подключён. Отправьте код LINK-XXXXXX");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayDay = sheet.days.find((d) => {
    if (!d.date) return false;
    const dayDate = new Date(d.date);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate.getTime() === today.getTime();
  });

  if (!todayDay) return ctx.reply("📅 Сегодня нет запланированных лекарств.");

  const notTaken = todayDay.medications.filter((m) => !m.isTaken);
  if (notTaken.length === 0) {
    return ctx.reply("✅ Все лекарства на сегодня уже отмечены как принятые!");
  }

  await prisma.medication.updateMany({
    where: { id: { in: notTaken.map((m) => m.id) } },
    data: { isTaken: true, takenAt: new Date() },
  });

  const names = notTaken
    .map((m) => `• ${m.name}${m.dosage ? ` ${m.dosage}` : ""}`)
    .join("\n");
  return ctx.reply(`✅ Отлично! Отмечено как принятое:\n${names}`);
});

bot.command("status", async (ctx) => {
  const telegramId = String(ctx.from.id);
  const sheet = await prisma.sheet.findFirst({
    where: { telegramId },
    include: {
      days: { include: { medications: true }, orderBy: { dayNumber: "asc" } },
    },
  });

  if (!sheet) return ctx.reply("❌ Лист лечения не подключён.");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayDay = sheet.days.find((d) => {
    if (!d.date) return false;
    const dayDate = new Date(d.date);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate.getTime() === today.getTime();
  });

  if (!todayDay) return ctx.reply("📅 Сегодня нет запланированных лекарств.");

  const timeLabels: Record<string, string> = {
    morning: "🌅 Утро",
    noon: "☀️ Обед",
    evening: "🌙 Вечер",
    custom: "⏰ По времени",
  };

  const byTime = todayDay.medications.reduce(
    (acc, m) => {
      if (!acc[m.timeOfDay]) acc[m.timeOfDay] = [];
      acc[m.timeOfDay].push(m);
      return acc;
    },
    {} as Record<string, typeof todayDay.medications>
  );

  let text = `📋 <b>${sheet.title}</b> — День ${todayDay.dayNumber}\n\n`;
  for (const [time, meds] of Object.entries(byTime)) {
    text += `${timeLabels[time] || time}:\n`;
    for (const m of meds) {
      text += `${m.isTaken ? "✅" : "⬜"} ${m.name}${m.dosage ? ` ${m.dosage}` : ""}\n`;
    }
    text += "\n";
  }

  return ctx.reply(text, { parse_mode: "HTML" });
});

// Обработка кода LINK-XXXXXX
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const telegramId = String(ctx.from.id);

  if (!text.startsWith("LINK-")) return;

  const sheet = await prisma.sheet.findFirst({
    where: {
      linkCode: text,
      linkCodeExp: { gt: new Date() },
    },
  });

  if (!sheet) {
    return ctx.reply("❌ Код не найден или истёк. Сгенерируйте новый код в приложении.");
  }

  await prisma.sheet.update({
    where: { id: sheet.id },
    data: { telegramId, linkCode: null, linkCodeExp: null },
  });

  return ctx.reply(
    `✅ Telegram успешно подключён к листу <b>${sheet.title}</b>!\n\nТеперь я буду напоминать о приёме лекарств. Когда примёте — ответьте /taken`,
    { parse_mode: "HTML" }
  );
});

bot.launch().then(() => {
  console.log("🤖 Bot polling started (dev mode)");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
