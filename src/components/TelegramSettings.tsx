"use client";

import { useState, useEffect, useRef } from "react";

interface TelegramSettingsProps {
  sheetId: string;
  telegramLinked: boolean;
  onLinked: () => void;
}

export default function TelegramSettings({
  sheetId,
  telegramLinked,
  onLinked,
}: TelegramSettingsProps) {
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    const res = await fetch(`/api/sheets/${sheetId}/link-code`, {
      method: "POST",
    });
    const data = await res.json();
    setCode(data.code);
    setGenerating(false);

    // Начинаем опрашивать статус привязки
    setPolling(true);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/sheets/${sheetId}/link-code`);
      const d = await r.json();
      if (d.linked) {
        stopPolling();
        onLinked();
      }
    }, 3000);

    // Останавливаем через 10 минут (срок жизни кода)
    setTimeout(() => {
      stopPolling();
      setCode(null);
    }, 10 * 60 * 1000);
  };

  if (telegramLinked) {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 p-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-medium text-green-800">Telegram підключено</p>
            <p className="text-sm text-green-600">
              Ви будете отримувати нагадування в @healthmedaze_bot
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">📱</span>
        <div>
          <p className="font-medium text-gray-800">Telegram сповіщення</p>
          <p className="text-sm text-gray-500">Підключіть бота для нагадувань</p>
        </div>
      </div>

      {!code ? (
        <button
          onClick={generateCode}
          disabled={generating}
          className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {generating ? "Генерую код..." : "Підключити Telegram"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-2">Надішліть цей код боту:</p>
            <p className="text-2xl font-mono font-bold text-blue-600 tracking-widest">
              {code}
            </p>
            <p className="text-xs text-gray-400 mt-2">Код дійсний 10 хвилин</p>
          </div>

          <a
            href="https://t.me/healthmedaze_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 transition-colors"
          >
            <span>Відкрити @healthmedaze_bot</span>
            <span className="text-xs">↗</span>
          </a>

          {polling && (
            <p className="text-center text-sm text-gray-500">
              Очікую підтвердження...{" "}
              <span className="inline-block animate-pulse">⏳</span>
            </p>
          )}

          <button
            onClick={generateCode}
            disabled={generating}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Згенерувати новий код
          </button>
        </div>
      )}
    </div>
  );
}
