import { useCallback, useRef, useState } from "react";

type Props = { onMove: (x: number, y: number) => void };

export function Joystick({ onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      setKnob({ x: dx, y: dy });
      onMove(dx / max, dy / max);
    },
    [onMove],
  );

  const end = useCallback(() => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  return (
    <div
      ref={ref}
      className="relative flex size-36 touch-none items-center justify-center rounded-full border border-hud-border bg-hud/70 backdrop-blur-sm"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="pointer-events-none absolute inset-4 rounded-full border border-hud-border/60" />
      <div
        className="pointer-events-none size-16 rounded-full bg-primary/80 shadow-lg"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
