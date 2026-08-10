import { useEffect, useRef } from "react";

type SignalNode = {
  x: number;
  y: number;
  phase: number;
  radius: number;
};

const NODE_COUNT = 46;

function createNodes(): SignalNode[] {
  return Array.from({ length: NODE_COUNT }, (_, index) => ({
    x: ((index * 47) % 101) / 100,
    y: ((index * 73 + 19) % 103) / 102,
    phase: index * 0.61,
    radius: 0.7 + (index % 4) * 0.32,
  }));
}

export function ArmageddonSignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasCandidate = canvasRef.current;
    if (!canvasCandidate) return;
    const contextCandidate = canvasCandidate.getContext("2d");
    const surfaceCandidate = canvasCandidate.closest<HTMLElement>(".armageddon-hero");
    if (!contextCandidate || !surfaceCandidate) return;
    const canvas = canvasCandidate;
    const context = contextCandidate;
    const surface = surfaceCandidate;

    const nodes = createNodes();
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0.62, y: 0.44, intensity: 0 };
    let width = 1;
    let height = 1;
    let frame = 0;
    let inViewport = true;
    let documentVisible = !document.hidden;

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      render(reducedQuery.matches ? 2.4 : performance.now() / 1000);
    }

    function render(time: number) {
      context.clearRect(0, 0, width, height);

      const horizon = height * 0.47;
      const amplitude = Math.max(12, height * 0.035);
      for (let row = 0; row < 11; row += 1) {
        const depth = row / 10;
        const baseline = horizon + depth * height * 0.42;
        context.beginPath();
        for (let step = 0; step <= 52; step += 1) {
          const progress = step / 52;
          const distance = Math.abs(progress - pointer.x);
          const pointerLift = Math.max(0, 1 - distance * 4.8) * pointer.intensity * amplitude * 1.8;
          const wave = Math.sin(progress * 13 + row * 0.7 + time * 0.34) * amplitude * (0.35 + depth * 0.75);
          const secondary = Math.sin(progress * 29 - row * 0.42 - time * 0.19) * amplitude * 0.22;
          const y = baseline + wave + secondary - pointerLift;
          if (step === 0) context.moveTo(progress * width, y);
          else context.lineTo(progress * width, y);
        }
        context.strokeStyle = `rgba(185, 255, 75, ${0.035 + depth * 0.105})`;
        context.lineWidth = depth > 0.8 ? 1.15 : 0.7;
        context.stroke();
      }

      const positions = nodes.map((node) => {
        const driftX = Math.sin(time * 0.16 + node.phase) * 8;
        const driftY = Math.cos(time * 0.13 + node.phase * 1.3) * 7;
        const baseX = node.x * width + driftX;
        const baseY = node.y * height + driftY;
        const dx = baseX - pointer.x * width;
        const dy = baseY - pointer.y * height;
        const distance = Math.hypot(dx, dy);
        const push = Math.max(0, 1 - distance / 210) * pointer.intensity * 24;
        const angle = Math.atan2(dy, dx);
        return {
          x: baseX + Math.cos(angle) * push,
          y: baseY + Math.sin(angle) * push,
          radius: node.radius,
        };
      });

      for (let left = 0; left < positions.length; left += 1) {
        for (let right = left + 1; right < positions.length; right += 1) {
          const dx = positions[left].x - positions[right].x;
          const dy = positions[left].y - positions[right].y;
          const distance = Math.hypot(dx, dy);
          if (distance > 118) continue;
          context.beginPath();
          context.moveTo(positions[left].x, positions[left].y);
          context.lineTo(positions[right].x, positions[right].y);
          context.strokeStyle = `rgba(126, 231, 255, ${(1 - distance / 118) * 0.12})`;
          context.lineWidth = 0.6;
          context.stroke();
        }
      }

      positions.forEach((node, index) => {
        const pulse = 0.72 + Math.sin(time * 1.1 + index) * 0.22;
        context.beginPath();
        context.arc(node.x, node.y, node.radius + pulse, 0, Math.PI * 2);
        context.fillStyle = index % 6 === 0 ? "rgba(185, 255, 75, .82)" : "rgba(126, 231, 255, .42)";
        context.fill();
      });

      if (pointer.intensity > 0.02) {
        context.beginPath();
        context.arc(pointer.x * width, pointer.y * height, 34 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
        context.strokeStyle = `rgba(185, 255, 75, ${pointer.intensity * 0.32})`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    function tick(timestamp: number) {
      frame = 0;
      render(timestamp / 1000);
      if (!reducedQuery.matches && inViewport && documentVisible) frame = window.requestAnimationFrame(tick);
    }

    function syncMotion() {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (reducedQuery.matches) {
        canvas.dataset.motion = "reduced";
        render(2.4);
        return;
      }
      if (!inViewport || !documentVisible) {
        canvas.dataset.motion = "paused";
        return;
      }
      canvas.dataset.motion = "running";
      frame = window.requestAnimationFrame(tick);
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = surface.getBoundingClientRect();
      pointer.x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      pointer.y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      pointer.intensity = event.pointerType === "touch" ? 0.35 : 1;
    }

    function handlePointerLeave() {
      pointer.intensity = 0;
    }

    function handleVisibility() {
      documentVisible = !document.hidden;
      syncMotion();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      syncMotion();
    }, { rootMargin: "100px" });

    resizeObserver.observe(canvas);
    intersectionObserver.observe(surface);
    surface.addEventListener("pointermove", handlePointerMove, { passive: true });
    surface.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedQuery.addEventListener("change", syncMotion);
    resize();
    syncMotion();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedQuery.removeEventListener("change", syncMotion);
      canvas.dataset.motion = "stopped";
    };
  }, []);

  return <canvas ref={canvasRef} className="armageddon-signal-field" aria-hidden="true" />;
}
