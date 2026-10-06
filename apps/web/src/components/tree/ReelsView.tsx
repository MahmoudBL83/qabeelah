import { useEffect, useMemo, useRef, useState } from 'react';
import { Person } from '@qabila/types';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../lib/api';
import { canEditBranch, canCreatePersonInBranch, canEditPerson } from '../../lib/permissions';
import CreatePersonModal from './CreatePersonModal';
import PersonEditModal from './PersonEditModal';

interface ReelsViewProps {
  persons: Person[];
  branches?: any[];
  onPersonUpdated: (person: Person) => void;
  selectedPersonId?: string | null;
}

export default function ReelsView({ persons = [], branches = [], onPersonUpdated, selectedPersonId }: ReelsViewProps) {
  const { user } = useAuth();
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const wheelLock = useRef(false);
  const pointerSwipeRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0
  });
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const lastExternalSelectedPersonId = useRef<string | null>(null);

  const getPersonId = (person?: Person | null) => String(person?._id ?? person?.id ?? '');

  useEffect(() => {
    if (persons.length > 0 && !currentPersonId) {
      const rootPerson = persons.find((person) => !person.parentId) || persons[0];
      setCurrentPersonId(getPersonId(rootPerson));
    }
  }, [persons, currentPersonId]);

  useEffect(() => {
    const normalizedSelectedId = selectedPersonId ? String(selectedPersonId) : null;
    if (!normalizedSelectedId || normalizedSelectedId === lastExternalSelectedPersonId.current) return;

    lastExternalSelectedPersonId.current = normalizedSelectedId;
    const selectedPersonExists = persons.some((person) => getPersonId(person) === normalizedSelectedId);
    if (selectedPersonExists) {
      setCurrentPersonId(normalizedSelectedId);
    }
  }, [selectedPersonId, persons]);

  const currentPerson = useMemo(
    () => persons.find((person) => getPersonId(person) === String(currentPersonId)) || null,
    [persons, currentPersonId]
  );

  const parent = useMemo(() => {
    if (!currentPerson?.parentId) return null;
    return persons.find((person) => getPersonId(person) === String(currentPerson.parentId)) || null;
  }, [persons, currentPerson]);

  const children = useMemo(() => {
    if (!currentPerson) return [];
    return persons.filter((person) => String(person.parentId) === getPersonId(currentPerson));
  }, [persons, currentPerson]);

  const siblings = useMemo(() => {
    if (!currentPerson) return [];
    return persons.filter((person) => String(person.parentId) === String(currentPerson.parentId));
  }, [persons, currentPerson]);

  const siblingIndex = useMemo(() => {
    if (!currentPerson || siblings.length === 0) return -1;
    return siblings.findIndex((person) => getPersonId(person) === getPersonId(currentPerson));
  }, [siblings, currentPerson]);

  const generationLevel = useMemo(() => {
    if (!currentPerson) return 1;

    let level = 1;
    let cursor: Person | null = currentPerson;
    const visited = new Set<string>();

    while (cursor) {
      const nextParentId: string = cursor.parentId ? String(cursor.parentId) : '';
      if (!nextParentId || visited.has(nextParentId)) break;
      visited.add(nextParentId);

      const parentPerson: Person | null = persons.find((person) => getPersonId(person) === nextParentId) || null;
      if (!parentPerson) break;

      level += 1;
      cursor = parentPerson;
    }

    return level;
  }, [currentPerson, persons]);

  const canEditCurrent = canEditPerson(user, currentPerson);
  const canEditBranchForUser = canEditBranch(user);

  const [panelVisible, setPanelVisible] = useState(false);


  // const openDetails = () => {
  //   setShowDetails(true);
  //   setPanelVisible(true);
  // };

  const closeDetails = () => {
    setPanelVisible(false);
    // keep overlay rendered until animation completes
    window.setTimeout(() => setShowDetails(false), 280);
  };

  // const toggleDetails = () => {
  //   if (showDetails) closeDetails();
  //   else openDetails();
  // };

  const navigateTo = (person: Person | null) => {
    if (!person) return;
    setCurrentPersonId(getPersonId(person));
    // gracefully hide details when navigating
    if (showDetails) closeDetails();
  };

  const handleUp = () => {
    if (parent) navigateTo(parent);
  };

  const handleDown = () => {
    if (children.length > 0) navigateTo(children[0]);
  };

  const handleLeft = () => {
    if (siblings.length <= 1) return;
    const nextIndex = (siblingIndex - 1 + siblings.length) % siblings.length;
    navigateTo(siblings[nextIndex]);
  };

  const handleRight = () => {
    if (siblings.length <= 1) return;
    const nextIndex = (siblingIndex + 1) % siblings.length;
    navigateTo(siblings[nextIndex]);
  };

  const navigateBySwipe = (diffX: number, diffY: number) => {
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);
    if (Math.max(absX, absY) < 50) return;

    if (absY > absX) {
      if (diffY > 0) handleDown();
      else handleUp();
      return;
    }

    if (diffX > 0) handleLeft();
    else handleRight();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isEditOpen || isCreateOpen) return;
    if (e.target instanceof Element && e.target.closest('[data-ignore-reels-wheel="true"]')) return;
    e.preventDefault();
    e.stopPropagation();

    if (wheelLock.current) return;

    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (Math.max(absX, absY) < 12) return;

    wheelLock.current = true;
    window.setTimeout(() => {
      wheelLock.current = false;
    }, 350);

    if (absY > absX) {
      if (e.deltaY > 0) handleDown();
      else handleUp();
      return;
    }

    if (e.deltaX > 0) handleLeft();
    else handleRight();
  };

  const shouldIgnorePointerGesture = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('button, a, input, textarea, select, [role="button"], [data-ignore-reels-gesture="true"]'));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditOpen || isCreateOpen) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (shouldIgnorePointerGesture(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    pointerSwipeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY
    };
    setIsPointerDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerSwipeRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    pointerSwipeRef.current.lastX = e.clientX;
    pointerSwipeRef.current.lastY = e.clientY;
  };

  const finishPointerGesture = (e: React.PointerEvent<HTMLDivElement>, shouldNavigate: boolean) => {
    if (pointerSwipeRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const { startX, startY, lastX, lastY } = pointerSwipeRef.current;
    pointerSwipeRef.current.pointerId = null;
    setIsPointerDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The browser may have released capture already.
    }

    if (shouldNavigate) {
      navigateBySwipe(startX - lastX, startY - lastY);
    }
  };

  useEffect(() => {
    if (showDetails) setPanelVisible(true);
  }, [showDetails]);

  useEffect(() => {
    if (!isPointerDragging) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isPointerDragging]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          handleUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleDown();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleLeft();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleRight();
          break;
        case 'Escape':
          if (showDetails) closeDetails();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPersonId, parent, children, siblings, showDetails]);

  const handleSavePerson = async (updates: Partial<Person>) => {
    if (!currentPerson) return;
    const updated = await apiClient.updatePerson(getPersonId(currentPerson), updates);
    onPersonUpdated?.(updated);
    setCurrentPersonId(getPersonId(updated));
  };

  const handleCreatePerson = async (firstName: string, lastName: string, parentId?: string, branchId?: string) => {
    const newPerson = await apiClient.createPerson({
      firstName,
      lastName,
      parentId: parentId || getPersonId(currentPerson) || undefined,
      branchId: branchId || 'الفرع الرئيسي',
      isLiving: true,
      birthYear: new Date().getFullYear(),
      tenantId: (persons[0] as any)?.tenantId || ''
    });
    onPersonUpdated?.(newPerson);
    setIsCreateOpen(false);
  };

  if (!currentPerson) {
    return (
      <div className="flex h-[100dvh] items-center justify-center rounded-2xl bg-black text-white shadow-heritage-lg md:h-[calc(100vh-120px)]">
        لا يوجد بيانات
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-full touch-none select-none overflow-hidden overscroll-contain bg-black text-white shadow-2xl md:h-[calc(100vh-120px)] md:max-w-[980px] md:rounded-2xl"
      onWheel={handleWheel}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        className={`relative flex-1 touch-none overflow-hidden overscroll-contain ${
          isPointerDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishPointerGesture(e, true)}
        onPointerCancel={(e) => finishPointerGesture(e, false)}
        onLostPointerCapture={() => {
          pointerSwipeRef.current.pointerId = null;
          setIsPointerDragging(false);
        }}
      >
        <div
          key={getPersonId(currentPerson)}
          className="absolute inset-0 bg-black bg-no-repeat bg-center transition-opacity duration-500"
          style={{
            backgroundImage: `url(${currentPerson.imageSrc})`,
            backgroundSize: 'contain'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/90" />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/65 to-transparent" />
        </div>

        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 pointer-events-none">
          {(() => {
            const grandfather = parent && parent.parentId 
              ? persons.find((p) => getPersonId(p) === String(parent.parentId))
              : null;
            const nameTrail = [
              grandfather ? grandfather.firstName : null,
              parent ? parent.firstName : null,
              currentPerson.firstName
            ].filter(Boolean) as string[];
            
            return (
              <div className="pointer-events-auto inline-flex max-w-[90vw] items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
                <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] font-semibold leading-none">
                  {nameTrail.map((name, index) => {
                    const isLast = index === nameTrail.length - 1;
                    return (
                      <div key={`${name}-${index}`} className="flex items-center gap-2">
                        <span
                          className={`truncate ${
                            isLast
                              ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]'
                              : 'text-white/80'
                          }`}
                        >
                          {name}
                        </span>
                        {!isLast && <span className="text-white/30">›</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-[11px] font-bold text-secondary">
              الجيل {generationLevel}
            </span>

            {canEditCurrent && (
              <button
                onClick={() => setIsEditOpen(true)}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                تعديل
              </button>
            )}
            {canCreatePersonInBranch(user, currentPerson?.branchId) && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary backdrop-blur transition hover:bg-primary/20 flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                </svg>
                إضافة
              </button>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 p-5 pb-24 md:pb-8 pointer-events-none">
          <div className="max-w-[78%] space-y-3">
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <span className="rounded-full bg-secondary/90 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                {currentPerson.birthYear ? `مواليد ${currentPerson.birthYear}` : 'الجيل السابق'}
              </span>
              <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-white/85 backdrop-blur">
                {siblings.length > 1 ? `${siblings.length} إخوة` : 'الوحيد'}
              </span>
            </div>

            <h1 className="text-3xl font-bold leading-tight drop-shadow-lg md:text-5xl">
              {currentPerson.firstName}
            </h1>

            <p className="line-clamp-3 text-sm leading-6 text-white/90 md:line-clamp-4 md:text-base">
              {currentPerson.bio || 'لا توجد نبذة متاحة حالياً.'}
            </p>

            <div className="flex gap-1 w-full">
              {siblings.map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                    idx === siblingIndex
                      ? 'bg-secondary'
                      : idx < siblingIndex
                      ? 'bg-secondary/60'
                      : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 backdrop-blur">
            <button
              onClick={handleUp}
              disabled={!parent}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white disabled:opacity-30"
              title="الأعلى"
            >
              ↑ الأعلى
            </button>
            {/* <button
              onClick={toggleDetails}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-on-secondary"
            >
              التفاصيل
            </button> */}
            <button
              onClick={handleDown}
              disabled={children.length === 0}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white disabled:opacity-30"
              title="للأسفل"
            >
              ↓ الأسفل
            </button>
          </div>
        </div>
      </div>

      {(showDetails || panelVisible) && (
        <div className="absolute inset-0 z-20 md:relative md:w-[340px] md:border-s md:border-white/10">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-200" onClick={closeDetails} />

          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-y-0 right-0 z-30 w-full max-w-full transform transition-transform duration-200 md:relative md:w-[340px] ${panelVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} bg-black/80 md:bg-black/55 md:border-s md:border-white/10`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-5">
              <button
                onClick={closeDetails}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:hidden"
                aria-label="إغلاق التفاصيل"
              >
                ×
              </button>
              <h2 className="flex-1 text-center text-sm font-bold text-white md:text-base">تفاصيل العضو</h2>
              <div className="hidden w-10 md:block" />
            </div>

            <div
              data-ignore-reels-wheel="true"
              onWheelCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => e.stopPropagation()}
              className="max-h-[calc(100dvh-72px)] overflow-y-auto px-4 py-4 md:px-5"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] text-white/50">الاسم الكامل</p>
                  <p className="mt-1 text-base font-semibold text-white">{currentPerson.firstName}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] text-white/50">الأب</p>
                    <p className="mt-1 text-sm font-semibold text-white">{parent ? `${parent.firstName}` : 'لا يوجد'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] text-white/50">الأبناء</p>
                    <p className="mt-1 text-sm font-semibold text-white">{children.length}</p>
                  </div>
                </div>

                {currentPerson.bio && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] text-white/50">النبذة</p>
                    <p className="mt-2 text-sm leading-6 text-white/90">{currentPerson.bio}</p>
                  </div>
                )}

                {siblings.length > 1 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] text-white/50">الإخوة</p>
                    <div className="mt-3 space-y-2">
                      {siblings.slice(0, 5).map((sibling) => (
                        <button
                          key={getPersonId(sibling)}
                          onClick={() => navigateTo(sibling)}
                          className={`w-full rounded-xl px-3 py-2 text-right text-sm transition ${getPersonId(sibling) === getPersonId(currentPerson) ? 'bg-secondary text-on-secondary' : 'bg-white/8 text-white hover:bg-white/12'}`}
                        >
                          {sibling.firstName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <PersonEditModal
        key={getPersonId(currentPerson)}
        person={currentPerson}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSavePerson}
        showBranchField={canEditCurrent && canEditBranchForUser}
        branches={branches}
      />

      <CreatePersonModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreatePerson}
        parentsList={persons}
        selectedPersonId={getPersonId(currentPerson)}
        branches={branches}
      />
    </div>
  );
}
