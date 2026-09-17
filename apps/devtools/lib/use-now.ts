"use client";

import { useEffect, useState } from "react";

/** The current time, ticking every `every` ms; 0 on the server and the first client render so both agree. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}
