import { Person } from '@qabila/types';
import PersonCard from './PersonCard';

interface DynamicTreeProps {
  rootNode: Person | null;
  allPersons: Person[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  formatDates: (person: Person | null) => string;
  getFullName: (person: Person | null) => string;
}

export default function DynamicTree({
  rootNode,
  allPersons,
  selectedPersonId,
  onSelectPerson,
  formatDates,
  getFullName,
}: DynamicTreeProps) {
  if (!rootNode) return <div className="text-on-surface-variant text-sm">لا توجد بيانات للشجرة.</div>;

  return (
    <div className="family-tree-container overflow-auto w-full h-full flex justify-center p-8">
      <TreeNode
        person={rootNode}
        allPersons={allPersons}
        selectedPersonId={selectedPersonId}
        onSelectPerson={onSelectPerson}
        formatDates={formatDates}
        getFullName={getFullName}
        isRoot={true}
      />
    </div>
  );
}

interface TreeNodeProps {
  person: Person;
  allPersons: Person[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  formatDates: (person: Person | null) => string;
  getFullName: (person: Person | null) => string;
  isRoot?: boolean;
}

function TreeNode({
  person,
  allPersons,
  selectedPersonId,
  onSelectPerson,
  formatDates,
  getFullName,
  isRoot = false,
}: TreeNodeProps) {
  const personId = String(person._id ?? person.id ?? '');

  // Find children of the current person
  const children = allPersons.filter((p) => String(p.parentId) === personId);
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col items-center relative">
      {/* Connector from Parent (if not root) */}
      {!isRoot && (
        <div className="w-px h-6 bg-[#c19b60] absolute -top-6 left-1/2 -translate-x-1/2 opacity-50 z-0"></div>
      )}

      {/* Node Card */}
      <div className="relative z-10 px-4">
        <PersonCard
          name={getFullName(person)}
          dates={formatDates(person)}
          imageSrc={person.imageSrc}
          branchLabel={person.branchId || 'الفرع الرئيسي'}
          isMain={String(selectedPersonId) === personId}
          onClick={() => personId && onSelectPerson(personId)}
        />
        
        {/* Connector to Children */}
        {hasChildren && (
          <div className="w-px h-6 bg-[#c19b60] absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-50 z-0"></div>
        )}
      </div>

      {/* Children Row */}
      {hasChildren && (
           <div className="flex gap-4 mt-12 relative">
          {/* Horizontal connecting line for siblings */}
          {children.length > 1 && (
             <div className="absolute -top-6 left-0 right-0 h-px bg-[#c19b60] opacity-50 z-0"></div>
          )}
          
          {children.map((child) => (
            <TreeNode
              key={String(child._id ?? child.id)}
              person={child}
              allPersons={allPersons}
              selectedPersonId={selectedPersonId}
              onSelectPerson={onSelectPerson}
              formatDates={formatDates}
              getFullName={getFullName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
