import type { Challenge } from "../../shared/contracts";
import { ChallengeCard } from "./ChallengeCard";
interface DashboardProps {
  archived: boolean;
  onArchive: () => void;
  items: Challenge[];
  total: number;
  page: number;
  loading: boolean;
  error: string;
  ready: boolean;
  onCreate: () => void;
  onOpen: (challenge: Challenge) => void;
  onPage: (page: number) => void;
}
export function Dashboard({
  archived,
  onArchive,
  items,
  total,
  page,
  loading,
  error,
  ready,
  onCreate,
  onOpen,
  onPage,
}: DashboardProps) {
  const todayCount = items.filter((item) =>
    item.checkIns.includes(item.today),
  ).length;
  return (
    <>
      {archived ? (
        <section>
          <p className="eyebrow">ТВОЯ ИСТОРИЯ</p>
          <h1>Архив челленджей</h1>
          <p className="intro">
            История и прогресс сохранены. Отметки в архиве менять нельзя.
          </p>
        </section>
      ) : (
        <section className="welcome">
          <div>
            <p className="eyebrow">ПРОГРЕСС НАЧИНАЕТСЯ С ТЕБЯ</p>
            <h1>
              Большие перемены.
              <br />
              <span>Маленькими шагами.</span>
            </h1>
            <p className="intro">
              Выбери свой челлендж. Приходи каждый день.
              <br />
              Замечай, как далеко ты уже прошел.
            </p>
            <button className="primary" onClick={onCreate} disabled={!ready}>
              + Новый челлендж
            </button>
          </div>
          <div className="rhythm-art" aria-hidden="true">
            <div className="art-caption">ДЕНЬ ЗА ДНЕМ</div>
            <div className="art-path">
              <i>✓</i>
              <i>✓</i>
              <i>↗</i>
              <i>4</i>
              <i>5</i>
              <i>6</i>
              <i>7</i>
            </div>
            <p>
              Не идеально.
              <br />
              <strong>Зато вперед.</strong>
            </p>
            <span className="art-spark">✳</span>
          </div>
        </section>
      )}
      <section className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ТО, ЧТО ВАЖНО ТЕБЕ</p>
            <h2>
              {archived ? "В архиве" : "Мои челленджи"}{" "}
              <span className="count">{total}</span>
            </h2>
          </div>
          {!archived && (
            <button className="secondary" onClick={onArchive} disabled={!ready}>
              Архив
            </button>
          )}
          {!archived && items.length > 0 && (
            <span className="muted">
              Сегодня отмечено: {todayCount}
              {total > 20 ? " на странице" : ""}
            </span>
          )}
        </div>
        {loading ? (
          <div
            className="skeleton"
            aria-label="Загружаем челленджи"
            aria-busy="true"
          />
        ) : items.length ? (
          <ul className="challenge-list">
            {items.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                onOpen={() => onOpen(challenge)}
              />
            ))}
          </ul>
        ) : (
          !error && (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                ↗
              </span>
              <div>
                <h3>
                  {archived ? "Архив пока пуст" : "Здесь начнется твоя история"}
                </h3>
                <p>
                  {archived
                    ? "Здесь появятся челленджи, которые ты отправишь в архив."
                    : "Семь дней чтения, прогулок или нового навыка. Начни с того, что давно хотелось попробовать."}
                </p>
              </div>
              {!archived && (
                <button
                  className="text-button"
                  onClick={onCreate}
                  disabled={!ready}
                >
                  Создать первый челлендж →
                </button>
              )}
            </div>
          )
        )}
        {total > 20 && (
          <nav className="pagination" aria-label="Страницы челленджей">
            <button
              className="secondary"
              disabled={page === 1 || loading}
              onClick={() => onPage(page - 1)}
            >
              ← Назад
            </button>
            <span>
              {page} / {Math.ceil(total / 20)}
            </span>
            <button
              className="secondary"
              disabled={page * 20 >= total || loading}
              onClick={() => onPage(page + 1)}
            >
              Далее →
            </button>
          </nav>
        )}
      </section>
    </>
  );
}
