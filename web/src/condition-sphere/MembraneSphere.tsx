import { useEffect, useMemo, useRef, useState } from "react";
import { createMembraneSphere } from "./createMembraneSphere";
import { membraneOptionsFromCondition } from "./mapping";
import type { MembraneSphereController, MembraneSphereProps } from "./types";
import "./condition-sphere.css";

export function MembraneSphere({
  scores,
  dataCompleteness,
  paused = false,
  className = "",
  ariaLabel = "コンディションの状態を表すメンブレン表示",
  fallbackLabel = "コンディションの視覚化は利用できません",
}: MembraneSphereProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MembraneSphereController | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const renderOptions = useMemo(
    () => membraneOptionsFromCondition({ scores, dataCompleteness }, paused),
    [scores, dataCompleteness, paused],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let mounted = true;
    try {
      controllerRef.current = createMembraneSphere(host, {
        ...renderOptions,
        onUnavailable: () => mounted && setUnavailable(true),
        onAvailable: () => mounted && setUnavailable(false),
      });
    } catch {
      if (mounted) setUnavailable(true);
    }

    return () => {
      mounted = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // The controller is updated by the effect below. Creating it once keeps
    // score changes from replacing the canvas and resetting its time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.update(renderOptions);
  }, [renderOptions]);

  return (
    <div
      className={`condition-sphere ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      data-condition-sphere
      data-score-sleep={scores.sleep ?? "missing"}
      data-score-recovery={scores.recovery ?? "missing"}
      data-score-circulation={scores.circulation ?? "missing"}
      data-score-activity={scores.activity ?? "missing"}
      data-completeness={dataCompleteness ?? Object.values(scores).filter((value) => typeof value === "number").length / 4}
    >
      <div ref={hostRef} className="condition-sphere__canvas-host" aria-hidden="true" />
      <div className="condition-sphere__contour-bloom" aria-hidden="true" />
      {unavailable ? <p className="condition-sphere__fallback" role="status">{fallbackLabel}</p> : null}
    </div>
  );
}
