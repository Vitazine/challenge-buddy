import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Challenge,
  CreateChallengeInput,
  Session,
} from "../../shared/contracts";
import { api } from "../api";
import { telegram } from "../telegram";
type View =
  | { type: "list" }
  | { type: "create" }
  | { type: "detail"; challenge: Challenge };
export function useChallengeApp() {
  const [view, setView] = useState<View>({ type: "list" });
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<Challenge[]>([]);
  const [session, setSession] = useState<Session>();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutationLock = useRef(false);
  const mutationVersion = useRef(0);
  const loadVersion = useRef(0);
  const main = useRef<HTMLElement>(null);
  const load = useCallback(() => {
    const version = ++loadVersion.current;
    return Promise.all([api.session(), api.list(page, archived)])
      .then(([currentSession, list]) => {
        if (version !== loadVersion.current) return;
        if (page > 1 && list.items.length === 0) {
          setPage(Math.max(1, Math.ceil(list.total / list.pageSize)));
          return;
        }
        setError("");
        setSession(currentSession);
        setItems(list.items);
        setTotal(list.total);
      })
      .catch((cause: unknown) => {
        if (version !== loadVersion.current) return;
        setItems([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить челленджи.",
        );
      })
      .finally(() => {
        if (version === loadVersion.current) setLoading(false);
      });
  }, [page, archived]);
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [view.type, archived]);
  const showList = (nextArchived: boolean) => {
    if (mutationLock.current) return;
    setLoading(true);
    setItems([]);
    setPage(1);
    setArchived(nextArchived);
    setView({ type: "list" });
    setError("");
    setNotice("");
    if (nextArchived === archived && page === 1) void load();
  };
  const back = useCallback(() => {
    if (mutationLock.current) return;
    if (view.type === "list" && archived) {
      setArchived(false);
      setPage(1);
      setItems([]);
      setLoading(true);
    } else {
      setLoading(true);
      setView({ type: "list" });
      void load();
    }
    setError("");
    setNotice("");
  }, [load, view.type, archived]);
  useEffect(() => {
    const button = telegram?.BackButton;
    if (!telegram?.initData || !button) return;
    if (view.type === "list" && !archived) button.hide();
    else button.show();
    button.onClick(back);
    return () => button.offClick(back);
  }, [view.type, archived, back]);
  // Refresh server-derived dates when the app is resumed and around midnight.
  const selectedId = view.type === "detail" ? view.challenge.id : undefined;
  useEffect(() => {
    const refresh = async () => {
      if (document.hidden || mutationLock.current) return;
      try {
        if (selectedId) {
          const version = mutationVersion.current;
          const challenge = await api.get(selectedId);
          if (version !== mutationVersion.current || mutationLock.current) return;
          setView((current) =>
            current.type === "detail" && current.challenge.id === selectedId
              ? { type: "detail", challenge }
              : current,
          );
        } else if (view.type === "list") {
          await load();
        }
      } catch {
        /* A foreground action presents actionable errors. */
      }
    };
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedId, view.type, load]);
  async function mutate(operation: () => Promise<Challenge>, message: string) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    mutationVersion.current += 1;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const challenge = await operation();
      setView({ type: "detail", challenge });
      setNotice(message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить. Попробуй еще раз.",
      );
    } finally {
      mutationLock.current = false;
      setPending(false);
    }
  }
  const create = (input: CreateChallengeInput) =>
    mutate(() => api.create(input), "Челлендж создан. Твой первый шаг вперед!");
  const archive = (id: string) =>
    mutate(async () => {
      const challenge = await api.archive(id);
      setArchived(true);
      setPage(1);
      setItems([]);
      return challenge;
    }, "Челлендж в архиве. История и прогресс сохранены.");
  return {
    archived,
    showList,
    archive,
    view,
    setView,
    items,
    session,
    page,
    setPage,
    total,
    loading,
    setLoading,
    pending,
    error,
    notice,
    setNotice,
    main,
    load,
    back,
    create,
    mutate,
  };
}
