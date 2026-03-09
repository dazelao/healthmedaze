"use client";

import { useState } from "react";

interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  timeOfDay: string;
  customTime: string | null;
  isTaken: boolean;
}

interface Day {
  id: string;
  dayNumber: number;
  date: string | null;
  medications: Medication[];
}

interface DayViewProps {
  day: Day;
  onToggle: (medId: string, current: boolean) => void;
  onDelete: (medId: string) => void;
  onAdd: (dayId: string, med: { name: string; dosage: string; timeOfDay: string; customTime?: string }) => void;
}

const TIME_GROUPS: { key: string; label: string; icon: string }[] = [
  { key: "morning", label: "Утро", icon: "🌅" },
  { key: "noon", label: "Обед", icon: "☀️" },
  { key: "evening", label: "Вечер", icon: "🌙" },
  { key: "custom", label: "По времени", icon: "⏰" },
];

export default function DayView({ day, onToggle, onDelete, onAdd }: DayViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMed, setNewMed] = useState({
    name: "",
    dosage: "",
    timeOfDay: "morning",
    customTime: "",
  });

  const grouped = TIME_GROUPS.map((g) => ({
    ...g,
    meds: day.medications.filter((m) => m.timeOfDay === g.key),
  })).filter((g) => g.meds.length > 0);

  const allMeds = day.medications;
  const taken = allMeds.filter((m) => m.isTaken).length;
  const progress = allMeds.length > 0 ? Math.round((taken / allMeds.length) * 100) : 0;

  const handleAdd = async () => {
    if (!newMed.name.trim()) return;
    await onAdd(day.id, {
      name: newMed.name.trim(),
      dosage: newMed.dosage.trim(),
      timeOfDay: newMed.timeOfDay,
      customTime: newMed.timeOfDay === "custom" ? newMed.customTime : undefined,
    });
    setNewMed({ name: "", dosage: "", timeOfDay: "morning", customTime: "" });
    setShowAddForm(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Заголовок дня */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">День {day.dayNumber}</h2>
            {day.date && (
              <p className="text-sm text-gray-500">
                {new Date(day.date).toLocaleDateString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              {taken} / {allMeds.length}
            </p>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Список лекарств */}
      <div className="divide-y divide-gray-50">
        {grouped.length === 0 && (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Нет лекарств. Добавьте ниже.
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.key}>
            <div className="px-5 py-2 bg-gray-50">
              <p className="text-xs font-medium text-gray-500">
                {group.icon} {group.label}
              </p>
            </div>
            {group.meds.map((med) => (
              <div
                key={med.id}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                  med.isTaken ? "bg-green-50" : "hover:bg-gray-50"
                }`}
              >
                {/* Чекбокс */}
                <button
                  onClick={() => onToggle(med.id, med.isTaken)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    med.isTaken
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-gray-300 hover:border-green-400"
                  }`}
                >
                  {med.isTaken && <span className="text-xs">✓</span>}
                </button>

                {/* Название */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium text-sm ${
                      med.isTaken ? "text-gray-400 line-through" : "text-gray-800"
                    }`}
                  >
                    {med.name}
                  </p>
                  {med.dosage && (
                    <p className="text-xs text-gray-400">{med.dosage}</p>
                  )}
                  {med.timeOfDay === "custom" && med.customTime && (
                    <p className="text-xs text-gray-400">⏰ {med.customTime}</p>
                  )}
                </div>

                {/* Удалить */}
                <button
                  onClick={() => onDelete(med.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Форма добавления */}
      {showAddForm ? (
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newMed.name}
              onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
              placeholder="Название"
              autoFocus
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <input
              type="text"
              value={newMed.dosage}
              onChange={(e) => setNewMed({ ...newMed, dosage: e.target.value })}
              placeholder="Дозировка"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <select
              value={newMed.timeOfDay}
              onChange={(e) => setNewMed({ ...newMed, timeOfDay: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="morning">Утро</option>
              <option value="noon">Обед</option>
              <option value="evening">Вечер</option>
              <option value="custom">По времени</option>
            </select>
            {newMed.timeOfDay === "custom" && (
              <input
                type="time"
                value={newMed.customTime}
                onChange={(e) => setNewMed({ ...newMed, customTime: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Добавить
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 text-sm text-gray-500 hover:text-blue-600 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-300 transition-colors"
          >
            + Добавить лекарство
          </button>
        </div>
      )}
    </div>
  );
}
