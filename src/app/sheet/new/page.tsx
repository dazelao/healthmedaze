"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface ParsedMed {
  name: string;
  dosage: string;
  timeOfDay: "morning" | "noon" | "evening" | "custom";
  customTime?: string;
}

interface ParsedPlan {
  title: string;
  durationDays: number;
  medications: ParsedMed[];
}

const TIME_LABELS: Record<string, string> = {
  morning: "Утро",
  noon: "Обед",
  evening: "Вечер",
  custom: "По времени",
};

export default function NewSheetPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "review" | "saving">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Форма
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [password, setPassword] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [medications, setMedications] = useState<ParsedMed[]>([]);
const [previewUrl, setPreviewUrl] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setPreviewUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!previewUrl) return;
    setLoading(true);
    setError("");

    try {
      const [header, base64] = previewUrl.split(",");
      const mediaType = header.match(/:(.*?);/)?.[1] || "image/jpeg";

      const res = await fetch("/api/sheets/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка анализа");

      const plan: ParsedPlan = data.plan;
      setTitle(plan.title || "Лечение");
      setDurationDays(plan.durationDays || 7);
      setMedications(plan.medications || []);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipPhoto = () => {
    setTitle("Новый лист лечения");
    setMedications([]);
    setStep("review");
  };

  const addMedication = () => {
    setMedications((prev) => [
      ...prev,
      { name: "", dosage: "", timeOfDay: "morning" },
    ]);
  };

  const removeMedication = (i: number) => {
    setMedications((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateMedication = (i: number, field: string, value: string) => {
    setMedications((prev) =>
      prev.map((m, idx) =>
        idx === i ? { ...m, [field]: value } : m
      )
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Укажите название листа");
      return;
    }

    setStep("saving");
    setError("");

    // Строим дни
    const start = new Date(startDate);
    const days = Array.from({ length: durationDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return {
        dayNumber: i + 1,
        date: date.toISOString(),
        medications: medications.filter((m) => m.name.trim()),
      };
    });

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          password: password || undefined,
          days,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");

      router.push(`/sheet/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setStep("review");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Новый лист лечения
      </h1>

      {/* Шаг 1: загрузка фото */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              Загрузите фото назначения
            </h2>

            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Предпросмотр"
                  className="max-h-64 mx-auto rounded-lg object-contain"
                />
              ) : (
                <div>
                  <div className="text-4xl mb-3">📷</div>
                  <p className="text-gray-500">
                    Нажмите чтобы выбрать фото назначения врача
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    JPG, PNG, HEIC до 10 МБ
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {previewUrl && (
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Анализирую..." : "Распознать назначение"}
              </button>
            )}

            {error && (
              <p className="mt-3 text-red-600 text-sm">{error}</p>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={handleSkipPhoto}
              className="text-gray-500 hover:text-gray-700 text-sm underline"
            >
              Пропустить — заполню вручную
            </button>
          </div>
        </div>
      )}

      {/* Шаг 2: редактирование */}
      {(step === "review" || step === "saving") && (
        <div className="space-y-5">
          {/* Название */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название листа
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-400"
              placeholder="Например: Лечение ОРВИ"
            />
          </div>

          {/* Дата и дни */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата начала
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Длительность (дней)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Лекарства */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Лекарства</h2>
              <p className="text-xs text-gray-500">
                Эти лекарства будут добавлены ко каждому дню
              </p>
            </div>


            <div className="space-y-3">
              {medications.map((med, i) => (
                <div
                  key={i}
                  className="flex gap-2 items-start bg-gray-50 rounded-xl p-3"
                >
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={med.name}
                      onChange={(e) => updateMedication(i, "name", e.target.value)}
                      placeholder="Название"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      value={med.dosage}
                      onChange={(e) => updateMedication(i, "dosage", e.target.value)}
                      placeholder="Дозировка"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <select
                      value={med.timeOfDay}
                      onChange={(e) => updateMedication(i, "timeOfDay", e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    >
                      {Object.entries(TIME_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {med.timeOfDay === "custom" && (
                      <input
                        type="time"
                        value={med.customTime || ""}
                        onChange={(e) => updateMedication(i, "customTime", e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => removeMedication(i)}
                    className="text-red-400 hover:text-red-600 mt-1 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addMedication}
              className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-xl py-2 text-gray-500 hover:border-blue-400 hover:text-blue-500 text-sm transition-colors"
            >
              + Добавить лекарство
            </button>
          </div>

          {/* Пароль */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Пароль (необязательно)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Оставьте пустым для открытого доступа"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-400"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={step === "saving"}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {step === "saving" ? "Сохраняю..." : "Создать лист лечения"}
          </button>
        </div>
      )}
    </div>
  );
}
