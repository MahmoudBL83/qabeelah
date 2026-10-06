import { useState, useCallback, useRef } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PanState {
  x: number;
  y: number;
}

interface UsePanConfig {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  zoomLevel: number;
}

/**
 * Hook for managing pan/drag state with smooth 360° dragging.
 * Calculates bounds dynamically based on viewport and content size.
 */
export function useTreePan() {
  const MOBILE_VIEWPORT_MAX = 768;
  const TOUCH_MOBILE_PAN_MULTIPLIER = 1.8;
  const TOUCH_DRAG_THRESHOLD = 1;
  const DEFAULT_DRAG_THRESHOLD = 2;

  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const panStartRef = useRef<PanState>({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pointerDownRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const calculateBounds = useCallback((
    viewport: number,
    content: number,
    zoom: number
  ): { min: number; max: number } => {
    const scaled = content * zoom;
    if (!viewport || !scaled) return { min: 0, max: 0 };

    // Top-left world-space camera:
    // screenPosition = worldPosition * zoom + pan
    // Small trees stay centered. Larger trees can be dragged until either
    // edge reaches the viewport center, which still allows edge nodes to be
    // centered by search and generation navigation.
    if (scaled <= viewport) {
      const centered = (viewport - scaled) / 2;
      return { min: centered, max: centered };
    }

    return {
      min: viewport / 2 - scaled,
      max: viewport / 2
    };
  }, []);

  const clampPan = useCallback((
    nextPan: PanState,
    config: UsePanConfig
  ): PanState => {
    const xBounds = calculateBounds(config.viewportWidth, config.contentWidth, config.zoomLevel);
    const yBounds = calculateBounds(config.viewportHeight, config.contentHeight, config.zoomLevel);

    return {
      x: clamp(nextPan.x, xBounds.min, xBounds.max),
      y: clamp(nextPan.y, yBounds.min, yBounds.max)
    };
  }, [calculateBounds]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerDownRef.current = true;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    panStartRef.current = { ...pan };
    pointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  }, [pan]);

  const handlePointerMove = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    config: UsePanConfig,
    onDragging: (isDragging: boolean) => void
  ) => {
    if (!pointerDownRef.current) return;

    const rawDx = event.clientX - pointerStartRef.current.x;
    const rawDy = event.clientY - pointerStartRef.current.y;
    const isTouch = event.pointerType === 'touch';
    const isSmallScreen = config.viewportWidth > 0 && config.viewportWidth <= MOBILE_VIEWPORT_MAX;
    const panMultiplier = isTouch && isSmallScreen ? TOUCH_MOBILE_PAN_MULTIPLIER : 1;
    const dx = rawDx * panMultiplier;
    const dy = rawDy * panMultiplier;
    const distance = Math.abs(dx) + Math.abs(dy);
    const dragThreshold = isTouch ? TOUCH_DRAG_THRESHOLD : DEFAULT_DRAG_THRESHOLD;

    if (distance >= dragThreshold) {
      onDragging(true);
      event.preventDefault();

      const newPan = clampPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy
      }, config);

      setPan(newPan);
    }
  }, [clampPan]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = false;
    if (pointerIdRef.current !== null) {
      try {
        event.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {
        // no-op
      }
    }
    pointerIdRef.current = null;
  }, []);

  const cancelPointer = useCallback(() => {
    pointerDownRef.current = false;
    pointerIdRef.current = null;
  }, []);

  const resetPan = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, []);

  const animateToPan = useCallback((
    targetPan: PanState,
    duration: number = 400
  ): Promise<void> => {
    return new Promise((resolve) => {
      const startPan = { ...pan };
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        const newPan = {
          x: startPan.x + (targetPan.x - startPan.x) * easeProgress,
          y: startPan.y + (targetPan.y - startPan.y) * easeProgress
        };

        setPan(newPan);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }, [pan]);

  return {
    pan,
    setPan,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelPointer,
    resetPan,
    animateToPan,
    clampPan,
    pointerIdRef
  };
}
