"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SheetCard {
  id: string;
  title: string;
  createdAt: string;
  startDate: string | null;
  hasPassword: boolean;
  telegramLinked: boolean;
  totalDays: number;
  totalMeds: number;
  takenMeds: number;
}

export default function HomePage() {
  const [sheets, setSheets] = useState<SheetCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sheets")
      .then((r) => r.json())
      .then((data) => {
        setSheets(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">💊</div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          Листов лечения пока нет
        </h1>
        <p className="text-gray-500 mb-6 max-w-sm">
          Создайте первый лист — загрузите фото назначения врача или введите данные вручную
        </p>
        <Link
          href="/sheet/new"
          className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors font-medium"
        >
          Создать лист лечения
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Мои листы лечения</h1>
      <div className="grid gap-4">
        {sheets.map((sheet) => {
          const progress =
            sheet.totalMeds > 0
              ? Math.round((sheet.takenMeds / sheet.totalMeds) * 100)
              : 0;

          return (
            <Link
              key={sheet.id}
              href={`/sheet/${sheet.id}`}
              className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg">
                    {sheet.title}
                    {sheet.hasPassword && (
                      <span className="ml-2 text-xs text-gray-400">🔒</span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {sheet.totalDays} дней &bull;{" "}
                    {new Date(sheet.createdAt).toLocaleDateString("ru-RU")}
                    {sheet.startDate && (
                      <> &bull; Начало: {new Date(sheet.startDate).toLocaleDateString("ru-RU")}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {sheet.telegramLinked && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                      Telegram
                    </span>
                  )}
                </div>
              </div>

              {/* Прогресс бар */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Прогресс</span>
                  <span>
                    {sheet.takenMeds} / {sheet.totalMeds} принято
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">{progress}%</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
