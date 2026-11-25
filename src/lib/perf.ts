import { useEffect, useState } from "react";

/**
 * True once the browser has painted the first frame.
 *
 * Charts measure their container synchronously on mount, which blocks the
 * page from painting. Gating them behind this hook lets the numbers and
 * tables appear first and the chart fill in right after.
 */
export function useAfterPaint(): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return painted;
}
