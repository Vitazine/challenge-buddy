import { useState, type FormEvent } from "react";
import {
  createChallengeSchema,
  type CreateChallengeInput,
} from "../../shared/contracts";
import { formatDate } from "../../shared/dates";
import { useCreationLimits } from "../hooks/useCreationLimits";

const suggestions = [
  "Учиться вайб-кодингу",
  "Читать 20 минут",
  "Гулять каждый день",
];
export function CreateChallenge({
  onCreate,
  pending,
}: {
  onCreate: (input: CreateChallengeInput) => Promise<void>;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(7);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const { state: limitsState, retry } = useCreationLimits(timeZone);
  const limits =
    limitsState.status === "ready" ? limitsState.limits : undefined;
  const [selectedStartDate, setStartDate] = useState<string>();
  const startDate = selectedStartDate ?? limits?.today ?? "";
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !limits) return;
    const parsed = createChallengeSchema.safeParse({
      title,
      duration,
      startDate,
      timeZone,
    });
    if (!parsed.success) {
      setError("Проверь название, дату и длительность от 1 до 30 дней.");
      return;
    }
    if (
      parsed.data.startDate < limits.today ||
      parsed.data.startDate > limits.maxStartDate
    ) {
      setError(
        `Выбери дату с ${formatDate(limits.today)} по ${formatDate(limits.maxStartDate)} включительно.`,
      );
      return;
    }
    setError("");
    await onCreate(parsed.data);
  }
  return (
    <section className="form-section">
      <p className="eyebrow">НОВОЕ НАЧАЛО</p>
      <h1>
        Какой будет
        <br />
        твой следующий шаг?
      </h1>
      <p className="intro">
        Выбери одно небольшое действие, которое хочется повторять каждый день.
      </p>
      <form onSubmit={submit} className="form-card">
        {limitsState.status === "loading" && (
          <p role="status" className="hint">
            Загружаем допустимую дату старта…
          </p>
        )}
        {limitsState.status === "error" && (
          <div role="alert" className="error-text">
            <p>{limitsState.message}</p>
            <button type="button" className="secondary" onClick={retry}>
              Попробовать снова
            </button>
          </div>
        )}
        <fieldset disabled={pending || !limits}>
          <label htmlFor="title">Название челленджа</label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, читать 20 минут"
            required
            maxLength={80}
            autoFocus
          />
          <div className="suggestions" aria-label="Идеи для челленджа">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => setTitle(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p className="field-label">Сколько дней?</p>
          <div className="duration-options">
            {[7, 14, 21, 30].map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={duration === days}
                onClick={() => setDuration(days)}
              >
                {days}
              </button>
            ))}
          </div>
          <div className="form-row">
            <div>
              <label htmlFor="duration">Своя длительность</label>
              <input
                id="duration"
                type="number"
                min={1}
                max={30}
                required
                value={duration || ""}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </div>
            <div>
              <label htmlFor="startDate">Дата старта</label>
              <input
                id="startDate"
                type="date"
                min={limits?.today}
                max={limits?.maxStartDate}
                aria-describedby="start-date-hint"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
          </div>
          <p id="start-date-hint" className="hint">
            {limits &&
              `Дата старта — с ${formatDate(limits.today)} по ${formatDate(limits.maxStartDate)} включительно (сегодня и ближайшие 7 дней).`}
          </p>
          <p className="hint">
            Часовой пояс: {timeZone}. Отметки привязаны к твоему календарному
            дню.
          </p>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary full" type="submit">
            {pending ? "Создаем…" : "Начать челлендж"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </fieldset>
      </form>
      <p className="footnote">
        Маленькая цель, которой ты уделяешь время, лучше большой, которую
        откладываешь.
      </p>
    </section>
  );
}
