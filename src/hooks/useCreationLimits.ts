import { useEffect, useState } from "react";
import type { ChallengeCreationLimits } from "../../shared/contracts";
import { api } from "../api";

type LimitsState =
  | { status: "loading"; timeZone: string }
  | { status: "error"; timeZone: string; message: string }
  | { status: "ready"; timeZone: string; limits: ChallengeCreationLimits };

export function useCreationLimits(timeZone: string) {
  const [state, setState] = useState<LimitsState>({
    status: "loading",
    timeZone,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      // Loading updates run asynchronously; cleanup invalidates earlier requests.
      await Promise.resolve();
      if (!active) return;
      setState({ status: "loading", timeZone });
      try {
        const limits = await api.creationLimits(timeZone);
        if (active) setState({ status: "ready", timeZone, limits });
      } catch (cause) {
        if (active)
          setState({
            status: "error",
            timeZone,
            message:
              cause instanceof Error
                ? cause.message
                : "Не удалось получить допустимую дату старта.",
          });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [timeZone, revision]);
  return {
    state:
      state.timeZone === timeZone
        ? state
        : { status: "loading" as const, timeZone },
    retry: () => {
      setState({ status: "loading", timeZone });
      setRevision((value) => value + 1);
    },
  };
}
