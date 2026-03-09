"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TelegramSettings from "@/components/TelegramSettings";
import DayView from "@/components/DayView";

interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  timeOfDay: string;
  customTime: string | null;
  isTaken: boolean;
  takenAt: string | null;
}

interface Day {
  id: string;
  dayNumber: number;
  date: string | null;
  medications: Medication[];
}

interface Sheet {
  id: string;
  title: string;
  startDate: string | null;
  createdAt: string;
  hasPassword: boolean;
  telegramLinked: boolean;
  days: Day[];
}

export default function SheetPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [activeDay, setActiveDay] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const loadSheet = async () => {
    const res = await fetch(`/api/sheets/${id}`);
    const data = await res.json();

    if (data.locked) {
      setLocked(true);
      setLoading(false);
      return;
    }

    if (!res.ok) {
      router.push("/");
      return;
    }

    setSheet(data);
    setLoading(false);

    // Открываем сегодняшний день
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIdx = data.days.findIndex((d: Day) => {
      if (!d.date) return false;
      const dayDate = new Date(d.date);
      dayDate.setHours(0, 0, 0, 0);
      return dayDate.getTime() === today.getTime();
    });
    if (todayIdx >= 0) setActiveDay(todayIdx);
  };

  useEffect(() => {
    loadSheet();
  }, [id]);

  const handleUnlock = async () => {
    setUnlockError("");
    const res = await fetch(`/api/sheets/${id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      setLocked(false);
      loadSheet();
    } else {
      const data = await res.json();
      setUnlockError(data.error || "Неверный пароль");
    }
  };

  const toggleMedication = async (medId: string, current: boolean) => {
    // Оптимистичное обновление
    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((day) => ({
          ...day,
          medications: day.medications.map((m) =>
            m.id === medId ? { ...m, isTaken: !current } : m
          ),
        })),
      };
    });

    const res = await fetch(`/api/medications/${medId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTaken: !current }),
    });

    if (!res.ok) {
      // Откатываем
      setSheet((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => ({
            ...day,
            medications: day.medications.map((m) =>
              m.id === medId ? { ...m, isTaken: current } : m
            ),
          })),
        };
      });
    }
  };

  const deleteMedication = async (medId: string) => {
    await fetch(`/api/medications/${medId}`, { method: "DELETE" });
    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((day) => ({
          ...day,
          medications: day.medications.filter((m) => m.id !== medId),
        })),
      };
    });
  };

  const addMedication = async (
    dayId: string,
    med: { name: string; dosage: string; timeOfDay: string; customTime?: string }
  ) => {
    const res = await fetch(`/api/days/${dayId}/medications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(med),
    });
    if (res.ok) {
      await loadSheet();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Загрузка...</div>
      </div>
    );
  }

  // Форма разблокировки
  if (locked) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="font-semibold text-gray-800 text-lg mb-2">
            Лист защищён паролем
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Введите пароль для доступа
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Пароль"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 mb-3 focus:outline-none focus:border-blue-400"
          />
          {unlockError && (
            <p className="text-red-500 text-sm mb-3">{unlockError}</p>
          )}
          <button
            onClick={handleUnlock}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Открыть
          </button>
        </div>
      </div>
    );
  }

  if (!sheet) return null;

  // Считаем общий прогресс
  const allMeds = sheet.days.flatMap((d) => d.medications);
  const takenCount = allMeds.filter((m) => m.isTaken).length;
  const totalCount = allMeds.length;
  const progress = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

  return (
    <div>
      {/* Заголовок */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{sheet.title}</h1>
          {sheet.startDate && (
            <p className="text-gray-500 text-sm mt-1">
              Начало: {new Date(sheet.startDate).toLocaleDateString("ru-RU")} &bull;{" "}
              {sheet.days.length} дней
            </p>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          ⚙️
        </button>
      </div>

      {/* Общий прогресс */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-5">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Общий прогресс</span>
          <span>
            {takenCount} / {totalCount} принято
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-right text-xs text-gray-400 mt-1">{progress}%</p>
      </div>

      {/* Настройки Telegram */}
      {showSettings && (
        <div className="mb-5">
          <TelegramSettings
            sheetId={id}
            telegramLinked={sheet.telegramLinked}
            onLinked={() => {
              setSheet((prev) => prev ? { ...prev, telegramLinked: true } : prev);
              setShowSettings(false);
            }}
          />
        </div>
      )}

      {/* Табы дней */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {sheet.days.map((day, i) => {
          const dayMeds = day.medications;
          const dayTaken = dayMeds.filter((m) => m.isTaken).length;
          const isToday = day.date
            ? (() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const d = new Date(day.date);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
              })()
            : false;

          return (
            <button
              key={day.id}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 flex flex-col items-center px-4 py-2 rounded-xl border transition-all ${
                activeDay === i
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
              }`}
            >
              <span className="text-xs font-medium">
                День {day.dayNumber}
                {isToday && " ✦"}
              </span>
              {day.date && (
                <span className="text-xs opacity-70">
                  {new Date(day.date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              )}
              <span className="text-xs mt-0.5 opacity-80">
                {dayTaken}/{dayMeds.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Активный день */}
      {sheet.days[activeDay] && (
        <DayView
          day={sheet.days[activeDay]}
          onToggle={toggleMedication}
          onDelete={deleteMedication}
          onAdd={addMedication}
        />
      )}
    </div>
  );
}
