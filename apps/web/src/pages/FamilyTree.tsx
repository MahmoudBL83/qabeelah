import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import TenantLayout from '../components/layout/TenantLayout';
import TreeMap from '../components/tree/TreeMap';
import ReelsView from '../components/tree/ReelsView';
import PersonEditModal from '../components/tree/PersonEditModal';
import CreatePersonModal from '../components/tree/CreatePersonModal';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { canEditBranch, canCreatePersonInBranch, canEditPerson } from '../lib/permissions';
import { useParams } from 'react-router-dom';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { useTreePan } from '../hooks/useTreePan';
import { useGenerationTracking } from '../hooks/useGenerationTracking';
import { Person, UserRole, Branch } from '@qabila/types';
import { TreeLayoutSnapshot } from '../components/tree/TreeMap';


const MAX_TREE_NODES = Number.POSITIVE_INFINITY;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ============================================================================
const normalizeSearchDigits = (value: string) =>
  value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit);
    if (arabic >= 0) return String(arabic);
    const persian = '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit);
    return persian >= 0 ? String(persian) : digit;
  });

const normalizeSearchText = (value: string) =>
  normalizeSearchDigits(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/([0-9]{4})/g, ' $1 ')
    .replace(/(الفرع|فرع|قبيله|عشيره|فخذ|بطن|branch|tribe|clan)/gi, ' $1 ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeSearchText = (value: string) =>
  normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

const compactSearchText = (value: string) => normalizeSearchText(value).replace(/\s+/g, '');

const SEARCH_STOP_WORDS = new Set([
  'find', 'search', 'show', 'the', 'a', 'an', 'of', 'for', 'and', 'with', 'in', 'on', 'by', 'from', 'to', 'all',
  'family', 'member', 'members', 'name', 'person', 'people', 'ابحث', 'عن', 'في', 'مع', 'كل', 'شخص', 'اشخاص',
  'افراد', 'العائله', 'عائله', 'اسم'
]);

const BRANCH_MARKERS = new Set(['فرع', 'الفرع', 'branch', 'قبيله', 'عشيره', 'فخذ', 'بطن', 'tribe', 'clan']);
const STATUS_WORDS = new Set(['alive', 'living', 'dead', 'deceased', 'حياء', 'حي', 'متوفي', 'وفاه']);
const RELATION_WORDS = new Set([
  'parent', 'father', 'mother', 'child', 'son', 'daughter', 'children', 'offspring', 'root', 'ancestor', 'leaf',
  'اب', 'الاب', 'ام', 'الام', 'ابن', 'ابنه', 'الابناء', 'اصل', 'جد', 'نسل', 'ذرية'
]);

const isYearToken = (token: string) => /^\d{4}$/.test(token);
const isSearchFillerToken = (token: string) =>
  SEARCH_STOP_WORDS.has(token) || BRANCH_MARKERS.has(token) || STATUS_WORDS.has(token) || RELATION_WORDS.has(token);

const includesLoose = (value: string, term: string) => Boolean(term) && (value.includes(term) || term.includes(value));

const scoreTokenAgainstText = (token: string, text: string, exactScore: number, prefixScore: number, containsScore: number) => {
  if (!token || !text) return 0;
  if (text === token) return exactScore;
  if (text.startsWith(token)) return prefixScore;
  if (text.includes(token)) return containsScore;
  return 0;
};

const getBranchId = (branch: Branch) => String(branch._id ?? branch.id ?? '');

type TreeSearchResult = {
  person: Person;
  score: number;
  matchedFields: string[];
  duplicateNameCount: number;
  displayLabel: string;
  subtitle: string;
};

type SmartSearchIntent = {
  birthFrom?: number;
  birthTo?: number;
  deathFrom?: number;
  deathTo?: number;
  exactYears: number[];
  requireLiving?: boolean;
  requireDeceased?: boolean;
  relation?: 'parent' | 'child' | 'root' | 'leaf';
  generation?: number;
  branchTerms: string[];
  nameTerms: string[];
  compactQuery: string;
};

const getSearchId = (person: Person) => String(person._id ?? person.id ?? '');
const getSearchFullName = (person: Person) => `${person.firstName || ''} ${person.lastName || ''}`.trim();

const getBranchName = (person: Person | null | undefined, branches: Branch[] = []) => {
  if (!person || !person.branchId) return 'الفرع الرئيسي';
  const branch = branches.find(b => b._id === person.branchId || b.id === person.branchId);
  return branch ? branch.name : person.branchId;
};

const getBranchHierarchyText = (branchId: string | undefined, branches: Branch[] = []) => {
  if (!branchId) return '';

  const byId = new Map<string, Branch>();
  branches.forEach((branch) => {
    const id = getBranchId(branch);
    if (id) byId.set(id, branch);
  });

  const names: string[] = [];
  const visited = new Set<string>();
  let currentId = String(branchId);

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const branch = byId.get(currentId);

    if (!branch) {
      names.push(currentId);
      break;
    }

    names.push(branch.name);
    currentId = branch.parentId ? String(branch.parentId) : '';
  }

  return names.join(' ');
};

const parseSmartSearchIntent = (query: string): SmartSearchIntent => {
  const normalized = normalizeSearchText(query);
  const words = tokenizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const exactYears = Array.from(new Set((normalized.match(/\b\d{4}\b/g) || []).map((year) => Number(year))));
  const intent: SmartSearchIntent = { exactYears, branchTerms: [], nameTerms: [], compactQuery };

  const birthFromMatch = normalized.match(/(?:born|birth|مواليد|ميلاد|from|بعد)\s*(\d{4})/i);
  const birthToMatch = normalized.match(/(?:to|until|through|الي|قبل)\s*(\d{4})/i);
  const deathFromMatch = normalized.match(/(?:died|death|وفاه)\s*(\d{4})/i);
  const deathToMatch = normalized.match(/(?:to|until|through|الي|قبل)\s*(\d{4})/i);

  if (birthFromMatch?.[1]) intent.birthFrom = Number(birthFromMatch[1]);
  if (birthToMatch?.[1]) intent.birthTo = Number(birthToMatch[1]);
  if (deathFromMatch?.[1]) intent.deathFrom = Number(deathFromMatch[1]);
  if (deathToMatch?.[1]) intent.deathTo = Number(deathToMatch[1]);

  if (/\b(alive|living|حياء|حي)\b/.test(normalized)) intent.requireLiving = true;
  if (/\b(dead|deceased|متوفي|وفاه)\b/.test(normalized)) intent.requireDeceased = true;

  if (/\b(parent|father|mother|اب|الاب|ام|الام)\b/.test(normalized)) intent.relation = 'parent';
  else if (/\b(child|son|daughter|ابن|ابنه|children|offspring|الابناء)\b/.test(normalized)) intent.relation = 'child';
  else if (/\b(root|ancestor|origin|اصل|جد)\b/.test(normalized)) intent.relation = 'root';
  else if (/\b(leaf|descendant|branch leaf|ورقه|فرع\s*اخير)\b/.test(normalized)) intent.relation = 'leaf';

  const generationMatch = normalized.match(/(?:generation|gen|جيل|الجيل)\s*(\d{1,2})/i);
  if (generationMatch?.[1]) intent.generation = Number(generationMatch[1]);

  const branchTerms = new Set<string>();
  words.forEach((word, index) => {
    const compactWord = compactSearchText(word);
    const marker = Array.from(BRANCH_MARKERS).find((candidate) => compactWord === candidate || compactWord.startsWith(candidate));
    if (!marker) return;

    const inlineTerm = compactWord.length > marker.length ? compactWord.slice(marker.length) : '';
    if (inlineTerm && !isSearchFillerToken(inlineTerm) && !isYearToken(inlineTerm)) {
      branchTerms.add(inlineTerm);
    }

    const trailingTerms: string[] = [];
    for (let i = index + 1; i < Math.min(words.length, index + 4); i += 1) {
      const term = words[i];
      if (!term || isYearToken(term) || isSearchFillerToken(term)) break;
      trailingTerms.push(term);
    }

    if (trailingTerms.length > 0) {
      branchTerms.add(trailingTerms.join(' '));
      trailingTerms.forEach((term) => branchTerms.add(term));
    }
  });

  intent.branchTerms = Array.from(branchTerms);
  intent.nameTerms = words.filter((word) => !isYearToken(word) && !isSearchFillerToken(word));
  return intent;
};

const scorePersonMatch = (
  person: Person,
  query: string,
  tokens: string[],
  extra?: {
    parentName?: string;
    ancestorNames?: string[];
    childNames?: string[];
    descendantNames?: string[];
    branchPath?: string;
    generationDepth?: number;
    intent?: SmartSearchIntent;
    branches?: Branch[];
  }
) => {
  const firstName = normalizeSearchText(person.firstName || '');
  const lastName = normalizeSearchText(person.lastName || '');
  const fullName = normalizeSearchText(getSearchFullName(person));
  const branch = normalizeSearchText(getBranchName(person, extra?.branches));
  const branchPath = normalizeSearchText(extra?.branchPath || branch);
  const bio = normalizeSearchText(person.bio || '');
  const identifier = normalizeSearchText(getSearchId(person));
  const birthYear = person.birthYear ? String(person.birthYear) : '';
  const deathYear = person.deathYear ? String(person.deathYear) : '';
  const parentName = normalizeSearchText(extra?.parentName || '');
  const ancestorNames = normalizeSearchText((extra?.ancestorNames || []).join(' '));
  const childNames = normalizeSearchText((extra?.childNames || []).join(' '));
  const descendantNames = normalizeSearchText((extra?.descendantNames || []).join(' '));
  const intent = extra?.intent;
  const compactQuery = intent?.compactQuery || compactSearchText(query);
  const compactFullName = compactSearchText(fullName);
  const compactFirstName = compactSearchText(firstName);
  const compactLastName = compactSearchText(lastName);
  const compactBranch = compactSearchText(branchPath);
  const compactLineage = compactSearchText(`${ancestorNames} ${fullName} ${descendantNames}`);

  const matchedFields = new Set<string>();
  let score = 0;

  if (!query) return { score: 0, matchedFields: [] as string[] };

  if (intent?.requireLiving && !person.isLiving) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.requireDeceased && person.isLiving) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.birthFrom && person.birthYear && person.birthYear < intent.birthFrom) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.birthTo && person.birthYear && person.birthYear > intent.birthTo) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.deathFrom && person.deathYear && person.deathYear < intent.deathFrom) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.deathTo && person.deathYear && person.deathYear > intent.deathTo) {
    return { score: 0, matchedFields: [] as string[] };
  }

  if (intent?.generation && extra?.generationDepth === intent.generation) {
    score += 360;
    matchedFields.add('الجيل');
  } else if (intent?.generation && extra?.generationDepth !== intent.generation) {
    score -= 180;
  }

  if (intent?.exactYears.length) {
    const personYears = [birthYear, deathYear].filter(Boolean);
    const hasYearMatch = intent.exactYears.some((year) => personYears.includes(String(year)));
    if (hasYearMatch) {
      score += 680;
      matchedFields.add('السنة');
    } else if (tokens.every(isYearToken)) {
      return { score: 0, matchedFields: [] as string[] };
    } else if (personYears.length > 0) {
      score -= 160;
    }
  }

  if (identifier.includes(query)) {
    score += identifier === query ? 1200 : 780;
    matchedFields.add('المعرف');
  }

  if (fullName === query) {
    score += 1100;
    matchedFields.add('الاسم الكامل');
  } else if (fullName.startsWith(query)) {
    score += 900;
    matchedFields.add('الاسم الكامل');
  } else if (fullName.includes(query)) {
    score += 650;
    matchedFields.add('الاسم الكامل');
  }

  if (firstName === query) {
    score += 800;
    matchedFields.add('الاسم الأول');
  } else if (firstName.startsWith(query)) {
    score += 520;
    matchedFields.add('الاسم الأول');
  }

  if (lastName === query) {
    score += 780;
    matchedFields.add('اسم العائلة');
  } else if (lastName.startsWith(query)) {
    score += 500;
    matchedFields.add('اسم العائلة');
  }

  if (branch.includes(query)) {
    score += branch === query ? 420 : 220;
    matchedFields.add('الفرع');
  }

  if (bio.includes(query)) {
    score += 140;
    matchedFields.add('النبذة');
  }

  if (parentName && parentName.includes(query)) {
    score += parentName === query ? 260 : 160;
    matchedFields.add('اسم الأب');
  }

  if (childNames && childNames.includes(query)) {
    score += 180;
    matchedFields.add('أسماء الأبناء');
  }

  if (ancestorNames && ancestorNames.includes(query)) {
    score += 190;
    matchedFields.add('تسلسل النسب');
  }

  if (descendantNames && descendantNames.includes(query)) {
    score += 160;
    matchedFields.add('الأبناء');
  }

  if (compactQuery) {
    if (compactQuery === compactFullName) {
      score += 1000;
      matchedFields.add('الاسم المدمج');
    } else if (compactQuery.includes(compactFullName)) {
      score += 780;
      matchedFields.add('الاسم المدمج');
    } else if (compactFullName.includes(compactQuery) && compactQuery.length >= 3) {
      score += 520;
      matchedFields.add('الاسم المدمج');
    } else if (compactFirstName && compactQuery.includes(compactFirstName)) {
      score += 280;
      matchedFields.add('الاسم الأول');
    }

    if (compactLastName && compactQuery.includes(compactLastName)) {
      score += 260;
      matchedFields.add('اسم العائلة');
    }

    if (compactBranch && compactQuery.includes(compactBranch)) {
      score += 360;
      matchedFields.add('الفرع');
    }
  }

  intent?.branchTerms.forEach((term) => {
    const branchTerm = normalizeSearchText(term);
    const compactBranchTerm = compactSearchText(branchTerm);
    if (includesLoose(branchPath, branchTerm) || (compactBranchTerm && compactBranch.includes(compactBranchTerm))) {
      score += branch === branchTerm ? 560 : 320;
      matchedFields.add('الفرع');
    }
  });

  if (intent?.relation === 'parent' && parentName) {
    score += 180;
    matchedFields.add('صلة قرابة');
  }

  if (intent?.relation === 'child' && childNames) {
    score += 180;
    matchedFields.add('صلة قرابة');
  }

  if (intent?.relation === 'root' && !person.parentId) {
    score += 300;
    matchedFields.add('الأصل');
  }

  if (intent?.relation === 'leaf') {
    score += 0;
    matchedFields.add('الأوراق');
  }


  if (birthYear && (birthYear === query || birthYear.includes(query))) {
    score += birthYear === query ? 520 : 250;
    matchedFields.add('سنة الميلاد');
  }

  if (deathYear && (deathYear === query || deathYear.includes(query))) {
    score += deathYear === query ? 260 : 140;
    matchedFields.add('سنة الوفاة');
  }

  intent?.nameTerms.forEach((token) => {
    const compactToken = compactSearchText(token);
    let tokenScore = 0;

    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, fullName, 360, 280, 190));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, firstName, 320, 240, 160));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, lastName, 300, 220, 150));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, parentName, 190, 140, 90));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, ancestorNames, 170, 120, 80));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, branchPath, 160, 120, 80));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, bio, 70, 50, 30));

    if (compactToken && compactLineage.includes(compactToken)) {
      tokenScore = Math.max(tokenScore, 110);
    }

    if (compactToken && compactBranch.includes(compactToken)) {
      tokenScore = Math.max(tokenScore, 130);
    }

    if (tokenScore > 0) {
      score += tokenScore;
      if (fullName.includes(token) || compactFullName.includes(compactToken)) matchedFields.add('الاسم');
      else if (branchPath.includes(token) || compactBranch.includes(compactToken)) matchedFields.add('الفرع');
      else if (ancestorNames.includes(token) || parentName.includes(token)) matchedFields.add('تسلسل النسب');
      else matchedFields.add('كلمات البحث');
    }
  });

  const meaningfulTokens = tokens.filter((token) => !isSearchFillerToken(token));
  if (meaningfulTokens.length > 0) {
    const matchedTokenCount = meaningfulTokens.filter((token) => {
      if (isYearToken(token)) return birthYear === token || deathYear === token;
      const compactToken = compactSearchText(token);
      return (
        fullName.includes(token) ||
        branchPath.includes(token) ||
        parentName.includes(token) ||
        ancestorNames.includes(token) ||
        childNames.includes(token) ||
        descendantNames.includes(token) ||
        bio.includes(token) ||
        identifier.includes(token) ||
        compactLineage.includes(compactToken) ||
        compactBranch.includes(compactToken)
      );
    }).length;

    if (matchedTokenCount > 0) {
      score += matchedTokenCount * 45;
      if (matchedTokenCount === meaningfulTokens.length) score += 220;
      matchedFields.add('كلمات البحث');
    } else if (meaningfulTokens.length > 1) {
      score -= 120;
    }
  }

  const finalScore = score + Math.min(60, matchedFields.size * 10);
  return { score: finalScore, matchedFields: Array.from(matchedFields) };
};


// ============================================================================
// Focused view calculation
// ============================================================================

const getFocusedPersons = (
  persons: Person[],
  selectedPersonId: string | null,
  maxNodes: number
) => {
  if (!selectedPersonId) return persons;

  const byId = new Map<string, Person>();
  const childrenMap = new Map<string, Person[]>();

  persons.forEach((person) => {
    const id = String(person._id ?? person.id ?? '');
    if (!id) return;
    byId.set(id, person);

    const parentId = String(person.parentId ?? '');
    if (parentId) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)?.push(person);
    }
  });

  const selected = byId.get(selectedPersonId);
  if (!selected) return persons;

  const result = new Set<string>();
  const pushId = (id?: string | null) => {
    if (!id || result.size >= maxNodes) return;
    result.add(id);
  };

  pushId(selectedPersonId);

  // Ancestors
  let current: Person | undefined = selected;
  while (current?.parentId && result.size < maxNodes) {
    const parentId = String(current.parentId);
    pushId(parentId);
    current = byId.get(parentId);
  }

  // Siblings
  if (selected.parentId) {
    const siblings = childrenMap.get(String(selected.parentId)) || [];
    siblings.forEach((sibling) => pushId(String(sibling._id ?? sibling.id ?? '')));
  }

  // Descendants (BFS)
  const queue: string[] = [selectedPersonId];
  while (queue.length > 0 && result.size < maxNodes) {
    const currentId = queue.shift();
    if (!currentId) continue;
    const children = childrenMap.get(String(currentId)) || [];
    for (const child of children) {
      const childId = String(child._id ?? child.id ?? '');
      if (result.size >= maxNodes) break;
      pushId(childId);
      queue.push(childId);
    }
  }

  return persons.filter((person) => result.has(String(person._id ?? person.id ?? '')));
};

// ============================================================================
// Main Component
// ============================================================================

export default function FamilyTree() {
  const { tenantSlug: routeTenantSlug } = useParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading: tenantSelectionLoading,
  } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));

  // ========== Core state ==========
  const [persons, setPersons] = useState<Person[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string>('');

  // ========== View state ==========
  const [viewMode, setViewMode] = useState<'tree' | 'reels'>('tree');
  const [isTreeWide] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [useFocusedView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  


  // ========== Zoom state ==========
  const [zoomLevel, setZoomLevel] = useState(1);

  // ========== Search & Filter state ==========
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // ========== Modal state ==========
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // ========== Viewport & Layout state ==========
  const [treeLayout, setTreeLayout] = useState<TreeLayoutSnapshot>({ width: 0, height: 0, nodes: [] });
  const [treeViewport, setTreeViewport] = useState({ width: 0, height: 0 });
  const treeViewportRef = useRef<HTMLDivElement | null>(null);
  const treeViewportObserverRef = useRef<ResizeObserver | null>(null);
  const generationIndexRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const dragMovedRef = useRef(false);
  const suppressTreeClickUntilRef = useRef(0);

  // ========== Custom hooks ==========
  const {
    pan,
    setPan,
    handlePointerDown: handlePanDown,
    handlePointerMove,
    handlePointerUp,
    cancelPointer,
    clampPan: clampPanBounds
  } = useTreePan();

  // ========== Utility functions ==========
  const getPersonId = useCallback((person: Person | null) => String(person?._id ?? person?.id ?? ''), []);

  const formatYear = useCallback(
    (year?: number | null) => (year !== null && year !== undefined ? year.toLocaleString('ar-SA') : '—'),
    []
  );

  const formatDates = useCallback(
    (person: Person | null) => {
      if (!person) return '—';
      const birth = formatYear(person.birthYear);
      const death = person.deathYear ? formatYear(person.deathYear) : person.isLiving ? 'على قيد الحياة' : '—';
      return `${birth} - ${death}`;
    },
    [formatYear]
  );

  const getFullName = useCallback((person: Person | null) => (person ? person.firstName || '—' : '—'), []);

  const getGenerationDepth = useCallback(
    (person: Person | null) => {
      if (!person) return 1;
      let depth = 1;
      let current = person;
      while (current.parentId) {
        const parent = persons.find((p) => getPersonId(p) === String(current.parentId));
        if (!parent) break;
        depth += 1;
        current = parent;
      }
      return depth;
    },
    [persons, getPersonId]
  );

  const getGeneration = useCallback(
    (person: Person | null) => {
      if (!person) return '—';
      return getGenerationDepth(person).toLocaleString('ar-SA');
    },
    [getGenerationDepth]
  );

  // ========== Generation tracking ==========
  const {
    visibleGenerations,
    allGenerations,
    scrollTargetPersonId,
    setScrollTargetPersonId,
    handleScrollAnimation,
    cancelScrollAnimation
  } = useGenerationTracking({
    persons,
    getGenerationDepth,
    pan,
    zoomLevel,
    viewportHeight: treeViewport.height,
    treeLayout
  });

  // ========== Search results ==========
  const searchResults = useMemo<TreeSearchResult[]>(() => {
    const query = normalizeSearchText(deferredSearchQuery);
    const tokens = tokenizeSearchText(deferredSearchQuery);
    const intent = parseSmartSearchIntent(deferredSearchQuery);

    if (!query && tokens.length === 0) return [];

    const duplicateNameCounts = new Map<string, number>();
    const byId = new Map<string, Person>();
    const childrenMap = new Map<string, Person[]>();

    persons.forEach((person) => {
      const personId = getSearchId(person);
      if (personId) byId.set(personId, person);

      const parentId = String(person.parentId ?? '');
      if (parentId) {
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)?.push(person);
      }

      const key = normalizeSearchText(getSearchFullName(person));
      duplicateNameCounts.set(key, (duplicateNameCounts.get(key) || 0) + 1);
    });

    const getAncestorNames = (person: Person) => {
      const names: string[] = [];
      const visited = new Set<string>();
      let parentId = person.parentId ? String(person.parentId) : '';

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        names.push(getSearchFullName(parent));
        parentId = parent.parentId ? String(parent.parentId) : '';
      }

      return names;
    };

    const getDescendantNames = (person: Person) => {
      const names: string[] = [];
      const queue = [...(childrenMap.get(getSearchId(person)) || [])];
      const visited = new Set<string>();

      while (queue.length > 0 && names.length < 40) {
        const child = queue.shift();
        if (!child) continue;

        const childId = getSearchId(child);
        if (!childId || visited.has(childId)) continue;

        visited.add(childId);
        names.push(getSearchFullName(child));
        queue.push(...(childrenMap.get(childId) || []));
      }

      return names;
    };

    return persons
      .map((person) => {
        const parent = person.parentId ? byId.get(String(person.parentId)) || null : null;
        const childNames = (childrenMap.get(getSearchId(person)) || []).map((child) => getSearchFullName(child));
        const branch = getBranchName(person, branches);
        const branchPath = getBranchHierarchyText(person.branchId, branches) || branch;
        const ancestorNames = getAncestorNames(person);
        const descendantNames = getDescendantNames(person);
        const { score, matchedFields } = scorePersonMatch(person, query, tokens, {
          parentName: parent ? getSearchFullName(parent) : undefined,
          ancestorNames,
          childNames,
          descendantNames,
          branchPath,
          generationDepth: getGenerationDepth(person),
          intent,
          branches
        });
        const birth = person.birthYear ? `مواليد ${person.birthYear}` : 'بدون سنة ميلاد';
        const duplicateNameCount = duplicateNameCounts.get(normalizeSearchText(getSearchFullName(person))) || 0;
        const displayLabel = person.firstName || '—';
        const subtitleParts = [branchPath, birth];
        if (person.deathYear) subtitleParts.push(`وفاة ${person.deathYear}`);
        if (!person.isLiving) subtitleParts.push('متوفى');

        return {
          person,
          score,
          matchedFields,
          duplicateNameCount,
          displayLabel,
          subtitle: subtitleParts.join(' · ')
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aName = normalizeSearchText(getSearchFullName(a.person));
        const bName = normalizeSearchText(getSearchFullName(b.person));
        if (aName !== bName) return aName.localeCompare(bName, 'ar');
        return getSearchId(a.person).localeCompare(getSearchId(b.person));
      })
      .slice(0, 40);
  }, [persons, deferredSearchQuery, branches, getGenerationDepth]);

  // ========== Filtered persons ==========
  const filteredPersons = useMemo(() => {
    return persons;
  }, [persons]);

  // ========== Display persons with focus view ==========
  const displayPersons = useMemo(() => {
    const activeSelection =
      searchResults.length > 0 && !selectedPersonId ? getSearchId(searchResults[0].person) : selectedPersonId;

    if (useFocusedView && activeSelection) {
      return getFocusedPersons(filteredPersons, activeSelection, MAX_TREE_NODES);
    }

    return filteredPersons;
  }, [filteredPersons, selectedPersonId, useFocusedView, searchResults]);

  const scrollToGeneration = useCallback(
    (generation: number) => {
      const firstPersonInGen = displayPersons.find((p) => getGenerationDepth(p) === generation);
      if (firstPersonInGen) {
        setScrollTargetPersonId(getPersonId(firstPersonInGen));
      }
    },
    [displayPersons, getGenerationDepth, getPersonId, setScrollTargetPersonId]
  );

  const selectedPerson = persons.find((p) => getPersonId(p) === String(selectedPersonId)) || null;
  const canEditSelected = canEditPerson(user, selectedPerson, branches);
  const canEditBranchForUser = canEditBranch(user);

  const displayCount = displayPersons.length;
  const totalCount = persons.length;

  // ========== Data loading ==========
  useEffect(() => {
    const initializeData = async () => {
      if (isSuperAdmin && tenantSelectionLoading) return;

      setLoading(true);
      try {
        if (isSuperAdmin) {
          if (!selectedTenantId) {
            setTenantId('');
            setPersons([]);
            setSelectedPersonId(null);
            return;
          }

          setTenantId(selectedTenantId);
          setSelectedPersonId(null);
          
          const [personsData, branchesData] = await Promise.all([
            apiClient.getPersons(selectedTenantId),
            apiClient.getBranches(selectedTenantId).catch(() => [])
          ]);
          
          setPersons(Array.isArray(personsData) ? personsData : []);
          setBranches(Array.isArray(branchesData) ? branchesData : []);
          return;
        }

        const seedResult = await apiClient.seedDatabase(routeTenantSlug || user?.tenantSlug);
        if (seedResult.tenantId) {
          setTenantId(seedResult.tenantId);
          
          const [personsData, branchesData] = await Promise.all([
            apiClient.getPersons(seedResult.tenantId),
            apiClient.getBranches(seedResult.tenantId).catch(() => [])
          ]);
          
          setPersons(personsData);
          setBranches(branchesData);
        }
      } catch (err) {
        console.error('Failed to load tree data', err);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [isSuperAdmin, routeTenantSlug, selectedTenantId, tenantSelectionLoading, user?.tenantSlug]);

  // ========== Set default selected person ==========
  useEffect(() => {
    if (persons.length === 0) return;

    if (!selectedPersonId) {
      const withBio = persons.find((p) => p.bio);
      const root = persons.find((p) => !p.parentId);
      const defaultPerson = withBio || root || persons[0];
      const defaultPersonId = defaultPerson ? getPersonId(defaultPerson) : null;
      setSelectedPersonId(defaultPersonId);
      setScrollTargetPersonId(defaultPersonId);
    }
  }, [persons, selectedPersonId, getPersonId, setScrollTargetPersonId]);

  // ========== Tree viewport observer ==========
  const setTreeViewportNode = useCallback((node: HTMLDivElement | null) => {
    treeViewportObserverRef.current?.disconnect();
    treeViewportObserverRef.current = null;
    treeViewportRef.current = node;

    if (!node) {
      setTreeViewport({ width: 0, height: 0 });
      return;
    }

    const update = () => {
      setTreeViewport({
        width: node.clientWidth,
        height: node.clientHeight
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    treeViewportObserverRef.current = observer;
  }, []);

  useEffect(() => {
    return () => {
      treeViewportObserverRef.current?.disconnect();
      treeViewportObserverRef.current = null;
    };
  }, []);

  // ========== Clamp pan when layout or viewport changes ==========
  useEffect(() => {
    if (viewMode !== 'tree') return;
    if (treeLayout.width === 0 || treeViewport.width === 0) return;

    const config = {
      viewportWidth: treeViewport.width,
      viewportHeight: treeViewport.height,
      contentWidth: treeLayout.width,
      contentHeight: treeLayout.height,
      zoomLevel
    };

    const clampedPan = clampPanBounds(pan, config);
    if (clampedPan.x !== pan.x || clampedPan.y !== pan.y) {
      setPan(clampedPan);
    }
  }, [treeLayout, treeViewport, zoomLevel, pan, clampPanBounds, setPan, viewMode]);

  useEffect(() => {
    if (viewMode === 'tree') return;

    setIsDragging(false);
    dragMovedRef.current = false;
    cancelPointer();
    cancelScrollAnimation();
    setScrollTargetPersonId(null);
  }, [cancelPointer, cancelScrollAnimation, setScrollTargetPersonId, viewMode]);

  // ========== Handle scroll target animation ==========
  useEffect(() => {
    if (!scrollTargetPersonId) return;
    if (viewMode !== 'tree') return;
    const viewportWidth = treeViewportRef.current?.clientWidth || treeViewport.width;
    const viewportHeight = treeViewportRef.current?.clientHeight || treeViewport.height;
    if (viewportWidth === 0 || viewportHeight === 0 || treeLayout.width === 0 || treeLayout.height === 0) return;
    if (treeLayout.nodes.length === 0) return;

    const targetPerson = displayPersons.find((p) => getPersonId(p) === scrollTargetPersonId);
    if (!targetPerson) {
      setScrollTargetPersonId(null);
      return;
    }

    const config = {
      viewportWidth,
      viewportHeight,
      contentWidth: treeLayout.width,
      contentHeight: treeLayout.height,
      zoomLevel
    };

    const frame = requestAnimationFrame(() => {
      handleScrollAnimation(targetPerson, pan, setPan, clampPanBounds, config);
    });

    return () => cancelAnimationFrame(frame);
    // Intentionally omit `pan` from deps so animation doesn't restart on every frame.
  }, [scrollTargetPersonId, displayPersons, treeViewport, treeLayout, zoomLevel, viewMode, getPersonId, handleScrollAnimation, clampPanBounds, setPan, setScrollTargetPersonId]);

  // ========== Zoom handling ==========
  const zoomAtViewportPoint = useCallback(
    (nextZoomValue: number, point: { x: number; y: number }) => {
      const nextZoom = clampValue(nextZoomValue, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === zoomLevel) return;

      setPan((currentPan) => {
        if (treeViewport.width === 0 || treeViewport.height === 0 || treeLayout.width === 0 || treeLayout.height === 0) {
          return currentPan;
        }

        const worldX = (point.x - currentPan.x) / zoomLevel;
        const worldY = (point.y - currentPan.y) / zoomLevel;
        const nextPan = {
          x: point.x - worldX * nextZoom,
          y: point.y - worldY * nextZoom
        };

        return clampPanBounds(nextPan, {
          viewportWidth: treeViewport.width,
          viewportHeight: treeViewport.height,
          contentWidth: treeLayout.width,
          contentHeight: treeLayout.height,
          zoomLevel: nextZoom
        });
      });

      setZoomLevel(nextZoom);
    },
    [clampPanBounds, setPan, treeLayout, treeViewport, zoomLevel]
  );

  useEffect(() => {
    const element = treeViewportRef.current;
    if (!element || viewMode !== 'tree') return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = element.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
      zoomAtViewportPoint(zoomLevel * zoomFactor, point);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [viewMode, zoomAtViewportPoint, zoomLevel]);

  // ========== Pan/drag handlers wrapper ==========
  const handlePointerDownWrapper = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragMovedRef.current = false;
    handlePanDown(event);
  }, [handlePanDown]);

  const handlePointerMoveWrapper = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const config = {
        viewportWidth: treeViewport.width,
        viewportHeight: treeViewport.height,
        contentWidth: treeLayout.width,
        contentHeight: treeLayout.height,
        zoomLevel
      };

      handlePointerMove(event, config, (isDragging) => {
        if (isDragging) dragMovedRef.current = true;
        setIsDragging(isDragging);
      });
    },
    [handlePointerMove, treeViewport, treeLayout, zoomLevel]
  );

  const handlePointerUpWrapper = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragMovedRef.current) {
      suppressTreeClickUntilRef.current = Date.now() + 250;
    }
    setIsDragging(false);
    handlePointerUp(event);
  }, [handlePointerUp]);

  // ========== Person handlers ==========
  const handlePersonUpdated = useCallback((updatedPerson: Person) => {
    setPersons((prev) =>
      prev.map((person) =>
        getPersonId(person) === getPersonId(updatedPerson) ? { ...person, ...updatedPerson } : person
      )
    );
  }, [getPersonId]);

  const handleSavePerson = useCallback(
    async (updates: Partial<Person>) => {
      if (!selectedPerson) return;
      const updated = await apiClient.updatePerson(getPersonId(selectedPerson), updates);
      handlePersonUpdated(updated);
    },
    [handlePersonUpdated, selectedPerson, getPersonId]
  );

  const handleCreatePerson = useCallback(
    async (firstName: string, lastName: string, parentId?: string, branchId?: string, birthYear?: number | null) => {
      if (!tenantId) return;
      const newPerson = await apiClient.createPerson({
        tenantId,
        firstName,
        lastName,
        parentId: parentId || undefined,
        branchId: branchId || 'الفرع الرئيسي',
        isLiving: true,
        ...(birthYear !== undefined && birthYear !== null ? { birthYear } : {})
      });
      setPersons((prev) => [...prev, newPerson]);
      handleSelectPerson(getPersonId(newPerson));
    },
    [tenantId, getPersonId]
  );

  // ========== Click-outside handler for sidebar ==========
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        // Check if click was on tree or search results, don't close
        const treeViewport = treeViewportRef.current;
        if (treeViewport && treeViewport.contains(target)) return;
        
        setSidebarOpen(false);
      }
    };

    if (sidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [sidebarOpen]);

  // ========== Person selection wrapper to open sidebar ==========
  const handleSelectPerson = useCallback((personId: string | null) => {
    if (personId) {
      setSidebarOpen(true);
      setScrollTargetPersonId(personId);
    }
    setSelectedPersonId(personId);
  }, [setScrollTargetPersonId]);

  const handleTreePersonSelect = useCallback((personId: string) => {
    if (Date.now() < suppressTreeClickUntilRef.current) return;
    handleSelectPerson(personId);
  }, [handleSelectPerson]);

  // ========== Render ==========
  return (
    <TenantLayout>
      {isSuperAdmin && (
        <div className="mb-4 rounded-2xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs text-on-surface-variant">العائلة المعروضة</p>
              <h2 className="mt-1 text-lg font-bold text-on-surface">{selectedTenant?.name || 'اختر عائلة'}</h2>
              <p className="text-xs text-on-surface-variant mt-1">هذه العائلة تُستخدم للشجرة للمشرف العام.</p>
            </div>
            <div className="min-w-0 lg:w-80">
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">تغيير العائلة</label>
              <select
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(event.target.value)}
                className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2 text-sm text-on-surface shadow-sm focus:border-secondary focus:outline-none"
              >
                {tenants.length === 0 ? (
                  <option value="">لا توجد عائلات</option>
                ) : (
                  tenants.map((tenant) => (
                    <option key={tenant._id} value={tenant._id}>
                      {tenant.name} · {tenant.subdomain}.qabila.com
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-xs text-on-surface-variant">
          {totalCount > 0 ? `عرض ${displayCount.toLocaleString('ar-SA')} من ${totalCount.toLocaleString('ar-SA')}` : 'لا توجد بيانات بعد'}
        </div>
        <div className="flex items-center gap-2">
          
          
          <div className="bg-surface-container-low p-1 rounded-lg inline-flex shadow-sm border border-surface-variant">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border border-surface-variant/50'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              شجرة العائلة
            </button>
            <button
              onClick={() => setViewMode('reels')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'reels'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border border-surface-variant/50'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
               الكروت
            </button>
          </div>
        </div>
      </div>

      {/* Smart Search */}
      <div className={`mt-4 mb-4 sm:top-18 right-4 left-4 sm:right-6 sm:left-6 z-20 flex justify-center ${isTreeWide ? 'max-w-none' : ''}`}>
        <div className={`w-full ${isTreeWide ? 'max-w-5xl' : 'max-w-4xl'} bg-surface-container-lowest border border-surface-variant shadow-heritage-sm rounded-xl p-4`}>
          <div className="flex gap-3 items-center">
            <div className="flex-1 flex items-center gap-3 bg-surface px-3 py-2 rounded-lg border border-surface-variant focus-within:border-secondary transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-on-surface-variant ml-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                placeholder="مثال: محمد سلمان 1996 فرع الرياض، أو محمدسلمان1996فرعالرياض"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchPanelOpen(true);
                }}
                onFocus={() => setSearchPanelOpen(true)}
                className="bg-transparent border-none outline-none w-full text-sm font-medium focus:ring-0 placeholder:text-on-surface-variant/60 text-on-surface"
              />
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchPanelOpen(false);
              }}
              className="px-4 py-2 rounded-lg text-sm font-bold border border-surface-variant bg-surface text-on-surface hover:bg-surface-variant transition-colors"
            >
              مسح
            </button>
          </div>

          {searchPanelOpen && searchQuery.trim() && (
            <div className="mt-4 rounded-2xl border border-surface-variant bg-surface-container-lowest p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">نتائج البحث الذكي</h3>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {searchResults.length} نتيجة من {persons.length.toLocaleString('ar-SA')} عنصر
                  </p>
                </div>
                <div className="text-xs text-on-surface-variant">
                  يفهم الاسم، الفرع، الأب/الأبناء، السنوات، والحالة الاجتماعية
                </div>
              </div>

              {searchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-variant bg-surface p-4 text-sm text-on-surface-variant">
                  لا توجد نتائج مطابقة.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {searchResults.map((result) => {
                    const isSelected = getPersonId(result.person) === selectedPersonId;
                    return (
                      <button
                        key={getPersonId(result.person)}
                        type="button"
                        onClick={() => {
                          const resultPersonId = getPersonId(result.person);
                          handleSelectPerson(resultPersonId);
                          setScrollTargetPersonId(resultPersonId);
                          setSearchPanelOpen(false);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-right transition ${
                          isSelected ? 'border-primary bg-primary/10' : 'border-surface-variant bg-surface hover:bg-surface-variant/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-right">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-on-surface">{result.displayLabel}</span>
                              {result.matchedFields.slice(0, 3).map((field) => (
                                <span key={field} className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                                  {field}
                                </span>
                              ))}
                            </div>
                            <div className="mt-1 text-xs text-on-surface-variant truncate">{result.subtitle}</div>
                          </div>
                          <div className="shrink-0 text-left">
                            {result.duplicateNameCount > 1 && (
                              <div className="mt-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                                مكرر ×{result.duplicateNameCount}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`${
          isTreeWide
            ? 'fixed inset-0 z-40 bg-surface/95 backdrop-blur-sm p-4 sm:p-6 overflow-auto'
            : 'flex flex-col lg:flex-row gap-6 min-h-[calc(100dvh-6rem)]'
        }`}
      >
        {viewMode === 'reels' ? (
          <div className="w-full flex justify-center px-4 sm:px-0 sm:py-4 sm:bg-surface-container-lowest/50 sm:rounded-lg sm:border sm:border-surface-variant">
            <ReelsView
              persons={persons}
              branches={branches}
              onPersonUpdated={handlePersonUpdated}
              selectedPersonId={selectedPersonId}
            />
          </div>
        ) : (
          <>
            {/* Person Details Sidebar */}
            {!isTreeWide && sidebarOpen && (
              <div ref={sidebarRef} className="w-full lg:w-80 shrink-0 bg-surface-container-lowest rounded-lg border border-surface-variant shadow-heritage-sm relative overflow-hidden flex flex-col">
                <div className="h-48 bg-surface-variant relative">
                  <img
                    src={
                      selectedPerson?.imageSrc 
                    }
                    alt={selectedPerson ? getFullName(selectedPerson) : 'Portrait'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="text-secondary text-xs mb-2 flex items-center gap-1 font-medium">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" />
                    </svg>
                    الجيل {getGeneration(selectedPerson)}
                  </div>
                  <h2 className="text-3xl font-semibold text-on-surface mb-2">{getFullName(selectedPerson)}</h2>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {canEditSelected && (
                      <button
                        onClick={() => setIsEditOpen(true)}
                        className="bg-secondary/10 text-secondary border border-secondary/20 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-secondary/20 transition-colors"
                      >
                        تعديل البيانات
                      </button>
                    )}
                    {canCreatePersonInBranch(user, selectedPerson?.branchId, branches) && (
                      <button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-primary/10 text-primary border border-primary/20 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                        </svg>
                        إضافة عضو
                      </button>
                    )}
                  </div>
                  <div className="text-on-surface-variant text-sm mb-6 flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                      />
                    </svg>
                    {selectedPerson
                      ? `ولد ${formatYear(selectedPerson.birthYear)}${
                          selectedPerson.deathYear
                            ? ` - توفي ${formatYear(selectedPerson.deathYear)}`
                            : selectedPerson.isLiving
                            ? ' - على قيد الحياة'
                            : ''
                        }`
                      : 'البيانات غير متوفرة'}
                  </div>

                  <div className="border-t border-surface-variant pt-6 mb-6">
                    <h3 className="text-sm font-semibold text-on-surface mb-2">نبذة مختصرة</h3>
                    <p className="text-on-surface-variant text-sm leading-relaxed">{selectedPerson?.bio || 'لا توجد نبذة متاحة حالياً.'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tree Canvas */}
            <div
              className={`${
                isTreeWide
                  ? 'flex-1 w-full h-[calc(100dvh-3rem)] min-h-0 bg-surface-container-lowest/70 border border-surface-variant rounded-2xl relative overflow-hidden flex flex-col items-center justify-start shadow-heritage-lg p-4 sm:p-6 pb-10 pattern-dots'
                  : 'flex-1 w-full h-[calc(100dvh-9rem)] sticky top-4 bg-surface-container-lowest/50 border border-surface-variant rounded-lg relative overflow-hidden flex flex-col items-start justify-start shadow-inner p-4 sm:p-6 pattern-dots opacity-90'
              } touch-none select-none`}
            >
     

              

              {/* Tree viewport */}
              <div className="relative flex-1 w-full min-h-0">
                <div
                  ref={setTreeViewportNode}
                  data-tree-viewport="true"
                  className={`absolute inset-0 overflow-hidden border-2 border-surface-variant/80 rounded-xl bg-surface-container-lowest/30 touch-none pointer-events-auto ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  onPointerDown={handlePointerDownWrapper}
                  onPointerMove={handlePointerMoveWrapper}
                  onPointerUp={handlePointerUpWrapper}
                  onPointerLeave={handlePointerUpWrapper}
                  onPointerCancel={handlePointerUpWrapper}
                >
                  {/* Decorative elements */}
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                    <div className="absolute -top-20 left-[-4rem] h-64 w-64 rounded-full bg-white/18 blur-3xl" />
                    <div className="absolute top-12 right-[-3rem] h-48 w-48 rounded-full bg-white/14 blur-3xl" />
                    <div className="absolute bottom-[-5rem] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/16 blur-3xl" />
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#f7f3ec]/70 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#f7f3ec]/60 to-transparent" />
                  </div>

                  {loading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-on-surface-variant">
                      جارٍ تحميل الشجرة...
                    </div>
                  ) : (
                    <div
                      className={`absolute left-0 top-0 z-10 ${isDragging ? '' : 'transition-transform duration-150 ease-out'}`}
                      style={{
                        width: treeLayout.width || undefined,
                        height: treeLayout.height || undefined,
                        transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomLevel})`,
                        transformOrigin: '0 0',
                        willChange: 'transform'
                      }}
                    >
                      <TreeMap
                        persons={displayPersons}
                        selectedPersonId={selectedPersonId}
                        onSelectPerson={handleTreePersonSelect}
                        formatDates={formatDates}
                        getFullName={getFullName}
                        onLayout={setTreeLayout}
                        getGenerationDepth={getGenerationDepth}
                      />
                    </div>
                  )}
                </div>

                {/* Generation index bar */}
                {allGenerations.length > 1 && (
                  <div
                    ref={generationIndexRef}
                    className="absolute right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 bg-surface-container-lowest/90 border border-surface-variant rounded-lg p-1.5 shadow-lg backdrop-blur-sm"

                  >
                    {allGenerations.map((gen) => (
                      <div key={gen} className="relative group">
                        <button
                          onClick={() => scrollToGeneration(gen)}
                          className={`w-6 h-6 text-xs font-bold rounded transition-all flex items-center justify-center ${
                            visibleGenerations.has(gen)
                              ? 'bg-primary text-on-primary shadow-md'
                              : 'text-on-surface-variant hover:text-secondary hover:bg-secondary/10'
                          }`}
                        >
                          {gen}
                        </button>
                        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200">
                          <div className="bg-surface-container-high border border-surface-variant rounded-lg px-3 py-1.5 shadow-lg backdrop-blur-sm whitespace-nowrap flex items-center gap-2">
                            <span className="text-xs font-semibold text-on-surface">الجيل</span>
                            <span className="text-xs font-bold text-secondary">{gen}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <PersonEditModal
        key={selectedPerson ? `${getPersonId(selectedPerson)}-${isEditOpen ? 'open' : 'closed'}` : 'edit-modal'}
        person={selectedPerson}
        branches={branches}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSavePerson}
        showBranchField={canEditSelected && canEditBranchForUser}
      />

      <CreatePersonModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreatePerson}
        parentsList={persons}
        branches={branches}
        selectedPersonId={selectedPersonId}
      />
    </TenantLayout>
  );
}


