import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Person } from '@qabila/types';
import { TreeLayoutSnapshot } from '../components/tree/TreeMap';

interface UseGenerationTrackingProps {
  persons: Person[];
  getGenerationDepth: (person: Person | null) => number;
  pan: { x: number; y: number };
  zoomLevel: number;
  viewportHeight: number;
  treeLayout: TreeLayoutSnapshot;
}

/**
 * Hook for tracking visible generations and handling generation scrolling.
 * Maintains accurate coordinate alignment with TreeMap layout.
 */
export function useGenerationTracking({
  persons,
  getGenerationDepth,
  pan,
  zoomLevel,
  viewportHeight,
  treeLayout
}: UseGenerationTrackingProps) {
  const [visibleGenerations, setVisibleGenerations] = useState<Set<number>>(new Set());
  const [scrollTargetPersonId, setScrollTargetPersonId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const layoutNodeById = useMemo(() => {
    return new Map(treeLayout.nodes.map((node) => [node.id, node]));
  }, [treeLayout.nodes]);

  const cancelScrollAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  // Get all unique generations in current view
  const allGenerations = useMemo(() => {
    if (treeLayout.nodes.length > 0) {
      const generations = new Set(treeLayout.nodes.map((node) => node.depth + 1));
      return Array.from(generations).sort((a, b) => a - b);
    }

    const generations = new Set(persons.map((p) => getGenerationDepth(p)));
    return Array.from(generations).sort((a, b) => a - b);
  }, [persons, getGenerationDepth, treeLayout.nodes]);

  // Track which generations are visible in viewport
  useEffect(() => {
    const visible = new Set<number>();
    if (treeLayout.nodes.length === 0 || viewportHeight === 0 || zoomLevel <= 0) {
      setVisibleGenerations(visible);
      return;
    }

    treeLayout.nodes.forEach((node) => {
      const screenTop = node.y * zoomLevel + pan.y;
      const screenBottom = (node.y + node.height) * zoomLevel + pan.y;

      if (screenBottom >= 0 && screenTop <= viewportHeight) {
        visible.add(node.depth + 1);
      }
    });

    setVisibleGenerations(visible);
  }, [pan, zoomLevel, viewportHeight, treeLayout.nodes]);


  // Handle animation to scroll target
  const handleScrollAnimation = useCallback(async (
    targetPerson: Person | null,
    currentPan: { x: number; y: number },
    setPan: (pan: any) => void,
    clampPan: (pan: any, config: any) => any,
    config: any
  ) => {
    if (!targetPerson) return;

    cancelScrollAnimation();

    const personId = String(targetPerson._id || targetPerson.id);
    const targetGeneration = getGenerationDepth(targetPerson);
    const targetNode =
      layoutNodeById.get(personId) ||
      treeLayout.nodes
        .filter((node) => node.depth + 1 === targetGeneration)
        .sort((a, b) => a.x - b.x)[0];

    if (!targetNode) {
      console.warn(`[useGenerationTracking] Could not resolve target node for personId: ${personId}`);
      setScrollTargetPersonId(null);
      return;
    }

    const viewportWidth = config?.viewportWidth || 0;
    const actualViewportHeight = config?.viewportHeight || viewportHeight || 0;
    const zoom = config?.zoomLevel ?? 1;

    const nodeCenterX = targetNode.x;
    const nodeCenterY = targetNode.y + targetNode.height / 2;

    const targetPanX = viewportWidth / 2 - nodeCenterX * zoom;
    const targetPanY = actualViewportHeight / 2 - nodeCenterY * zoom;

    config = {
      ...config,
      viewportWidth,
      viewportHeight: actualViewportHeight,
      contentWidth: treeLayout.width,
      contentHeight: treeLayout.height
    };

    const targetPan = clampPan({ x: targetPanX, y: targetPanY }, config);
    
    // Animate over 400ms
    const startPan = { ...currentPan };
    const startTime = Date.now();
    const duration = 400;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const newPan = {
        x: startPan.x + (targetPan.x - startPan.x) * easeProgress,
        y: startPan.y + (targetPan.y - startPan.y) * easeProgress
      };

      setPan(newPan);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setScrollTargetPersonId(null);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [cancelScrollAnimation, getGenerationDepth, layoutNodeById, treeLayout.height, treeLayout.nodes, treeLayout.width, viewportHeight]);

  useEffect(() => {
    return cancelScrollAnimation;
  }, [cancelScrollAnimation]);

  return {
    visibleGenerations,
    allGenerations,
    scrollTargetPersonId,
    setScrollTargetPersonId,
    handleScrollAnimation,
    cancelScrollAnimation
  };
}
