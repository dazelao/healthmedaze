import { Telegraf } from "telegraf";

let botInstance: Telegraf | null = null;

export function getBot(): Telegraf {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
    botInstance = new Telegraf(token);
  }
  return botInstance;
}

export async function sendTelegramMessage(
  telegramId: string,
  text: string
): Promise<void> {
  const bot = getBot();
  await bot.telegram.sendMessage(telegramId, text, { parse_mode: "HTML" });
}
