import { useCallback, useEffect, useRef, useState } from "react";

export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => (
    typeof globalThis.matchMedia === "function"
      && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return undefined;
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
};

export const useTransientNotice = (durationMs = 4_500) => {
  const [notice, setNotice] = useState("");
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  const clear = useCallback(() => {
    if (timerRef.current !== undefined) globalThis.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    setNotice("");
  }, []);

  const show = useCallback((next: string) => {
    if (timerRef.current !== undefined) globalThis.clearTimeout(timerRef.current);
    setNotice(next);
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = undefined;
      setNotice("");
    }, durationMs);
  }, [durationMs]);

  useEffect(() => clear, [clear]);
  return { notice, show, clear };
};
