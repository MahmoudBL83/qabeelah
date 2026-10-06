import { memo, useEffect, useMemo } from 'react';
import { Person } from '@qabila/types';
import PersonCard from './PersonCard';

const NODE_WIDTH = 192;
const NODE_HEIGHT = 148;
const H_GAP = 32;
const V_GAP = 80;

interface TreeMapProps {
  persons: Person[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  formatDates: (person: Person | null) => string;
  getFullName: (person: Person | null) => string;
  onLayout?: (layout: TreeLayoutSnapshot) => void;
  getGenerationDepth?: (person: Person) => number;
}

interface LayoutNode {
  id: string;
  person: Person;
  children: LayoutNode[];
  width: number;
  x: number;
  y: number;
  depth: number;
}

export interface TreeLayoutSnapshot {
  width: number;
  height: number;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
  }>;
}

const getPersonId = (person: Person | null) => String(person?._id ?? person?.id ?? '');

function buildLayout(persons: Person[]) {
  const nodeMap = new Map<string, LayoutNode>();

  persons.forEach((person) => {
    const id = getPersonId(person);
    if (!id) return;
    nodeMap.set(id, {
      id,
      person,
      children: [],
      width: NODE_WIDTH,
      x: 0,
      y: 0,
      depth: 0
    });
  });

  persons.forEach((person) => {
    const id = getPersonId(person);
    if (!id) return;
    const parentId = String(person.parentId ?? '');
    if (parentId && nodeMap.has(parentId)) {
      const parent = nodeMap.get(parentId);
      const child = nodeMap.get(id);
      if (parent && child) parent.children.push(child);
    }
  });

  const roots = Array.from(nodeMap.values()).filter((node) => {
    const parentId = String(node.person.parentId ?? '');
    return !parentId || !nodeMap.has(parentId);
  });

  const computeWidth = (node: LayoutNode): number => {
    if (node.children.length === 0) {
      node.width = NODE_WIDTH;
      return node.width;
    }

    let total = 0;
    node.children.forEach((child, index) => {
      total += computeWidth(child);
      if (index > 0) total += H_GAP;
    });

    node.width = Math.max(total, NODE_WIDTH);
    return node.width;
  };

  let maxDepth = 0;
  const assignPositions = (node: LayoutNode, left: number, depth: number) => {
    node.depth = depth;
    node.x = left + node.width / 2;
    node.y = depth * (NODE_HEIGHT + V_GAP);
    maxDepth = Math.max(maxDepth, depth);

    let cursor = left;
    node.children.forEach((child) => {
      assignPositions(child, cursor, depth + 1);
      cursor += child.width + H_GAP;
    });
  };

  roots.forEach((root) => computeWidth(root));

  let totalWidth = 0;
  roots.forEach((root, index) => {
    totalWidth += root.width;
    if (index > 0) totalWidth += H_GAP;
  });

  let offset = 0;
  roots.forEach((root, index) => {
    assignPositions(root, offset, 0);
    offset += root.width + (index < roots.length - 1 ? H_GAP : 0);
  });

  const nodes = Array.from(nodeMap.values());
  const edges = nodes.flatMap((node) =>
    node.children.map((child) => ({ from: node, to: child }))
  );

  const width = Math.max(totalWidth, NODE_WIDTH);
  const height = (maxDepth + 1) * NODE_HEIGHT + maxDepth * V_GAP;

  return { nodes, edges, width, height };
}

function TreeMap({
  persons,
  selectedPersonId,
  onSelectPerson,
  formatDates,
  getFullName,
  onLayout,
  getGenerationDepth
}: TreeMapProps) {
  const layout = useMemo(() => buildLayout(persons), [persons]);

  useEffect(() => {
    const snapshot = {
      width: layout.width,
      height: layout.height,
      nodes: layout.nodes.map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: NODE_HEIGHT,
        depth: node.depth
      }))
    };

    onLayout?.(snapshot);
  }, [layout.nodes, layout.width, layout.height, onLayout]);
  if (!persons.length) {
    return <div className="text-on-surface-variant text-sm">لا توجد بيانات للشجرة.</div>;
  }

  return (
    <div className="relative" style={{ width: layout.width, height: layout.height }}>
      <svg
        className="absolute inset-0"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        {layout.edges.map((edge, index) => {
          const startX = edge.from.x;
          const startY = edge.from.y + NODE_HEIGHT;
          const endX = edge.to.x;
          const endY = edge.to.y;
          const midY = startY + V_GAP / 2;
          const path = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;

          return (
            <path
              key={`${edge.from.id}-${edge.to.id}-${index}`}
              d={path}
              fill="none"
              stroke="#c19b60"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.55"
            />
          );
        })}
      </svg>

      {layout.nodes.map((node) => (
        <div
          key={node.id}
          data-generation={getGenerationDepth ? getGenerationDepth(node.person) : undefined}
          className="absolute"
          style={{
            left: node.x,
            top: node.y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            transform: 'translateX(-50%)'
          }}
        >
          <PersonCard
            name={getFullName(node.person)}
            dates={formatDates(node.person)}
            imageSrc={node.person.imageSrc}
            branchLabel={node.person.branchId || 'الفرع الرئيسي'}
            isMain={String(selectedPersonId) === node.id}
            onClick={() => onSelectPerson(node.id)}
            className="h-full"
            nodeId={node.id}
          />
        </div>
      ))}
    </div>
  );
}

export default memo(TreeMap);
