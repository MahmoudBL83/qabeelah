import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import useAuthenticatedEffect from '../hooks/useAuthenticatedEffect';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { colors, spacing, typography, rounded } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import ScreenHeader from '../components/ScreenHeader';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Person, UserRole, Branch } from '@qabila/types';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 150;
const H_GAP = 28;
const V_GAP = 80;
const LINE_WIDTH = 2;
const DETAILS_HEIGHT = 310;
const MAX_TREE_NODES = 260;
const MAX_SEARCH_RESULTS = 20;
const BOTTOM_TAB_CLEARANCE_FALLBACK = 96;

type LayoutNode = {
  id: string;
  person: Person;
  children: LayoutNode[];
  width: number;
  x: number;
  y: number;
  depth: number;
};

type LayoutEdge = {
  from: LayoutNode;
  to: LayoutNode;
};

type MemberDraft = {
  firstName: string;
  lastName: string;
  birthYear: string;
  deathYear: string;
  bio: string;
  imageSrc: string;
  parentId: string;
  branchId: string;
  spouseIds: string;
};

const getPersonId = (person?: Person | null) => String(person?._id ?? person?.id ?? '');

const getFocusedPersons = (persons: Person[], focusId?: string | null, maxNodes = MAX_TREE_NODES) => {
  if (!focusId || persons.length <= maxNodes) return persons;

  const personMap = new Map<string, Person>();
  const childrenMap = new Map<string, string[]>();

  persons.forEach((person) => {
    const id = getPersonId(person);
    if (!id) return;
    personMap.set(id, person);
    const parentId = String(person.parentId ?? '');
    if (parentId) {
      const list = childrenMap.get(parentId) || [];
      list.push(id);
      childrenMap.set(parentId, list);
    }
  });

  const queue: string[] = [focusId];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < maxNodes) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    const person = personMap.get(id);
    if (!person) continue;

    visited.add(id);
    const parentId = String(person.parentId ?? '');

    if (parentId) queue.push(parentId);
    (childrenMap.get(id) || []).forEach((childId) => queue.push(childId));

    if (parentId) {
      (childrenMap.get(parentId) || []).forEach((siblingId) => queue.push(siblingId));
    }
  }

  return Array.from(visited)
    .map((id) => personMap.get(id))
    .filter((person): person is Person => Boolean(person));
};

const buildLayout = (persons: Person[]) => {
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
  const edges = nodes.flatMap((node) => node.children.map((child) => ({ from: node, to: child })));
  const width = Math.max(totalWidth, NODE_WIDTH);
  const height = (maxDepth + 1) * NODE_HEIGHT + maxDepth * V_GAP;

  return { nodes, edges, width, height };
};

const formatYear = (year?: number | null) =>
  year !== null && year !== undefined ? year.toLocaleString('ar-SA') : '—';

const formatDates = (person?: Person | null) => {
  if (!person) return '—';
  const birth = formatYear(person.birthYear);
  const death = person.deathYear
    ? formatYear(person.deathYear)
    : person.isLiving
      ? 'على قيد الحياة'
      : '—';
  return `${birth} - ${death}`;
};

const getFullName = (person?: Person | null) => person ? person.firstName || '—' : '—';

const getImageSrc = (person?: Person | null) => {
  if (person?.imageSrc) return person.imageSrc;
  const imageIndex = (getPersonId(person).length % 70) + 1;
  return ``;
};

const getBranchName = (person: Person | null | undefined, branches: Branch[] = []) => {
  if (!person || !person.branchId) return 'الفرع الرئيسي';
  const branch = branches.find(b => b._id === person.branchId || b.id === person.branchId);
  return branch ? branch.name : person.branchId;
};

const createMemberDraft = (person?: Person | null, parentId = '', branches: Branch[] = []): MemberDraft => ({
  firstName: person?.firstName || '',
  lastName: person?.lastName || '',
  birthYear: person?.birthYear !== undefined && person?.birthYear !== null ? String(person.birthYear) : '',
  deathYear: person?.deathYear !== undefined && person?.deathYear !== null ? String(person.deathYear) : '',
  bio: person?.bio || '',
  imageSrc: person?.imageSrc || '',
  parentId,
  branchId: getBranchName(person, branches),
  spouseIds: Array.isArray((person as any)?.spouseIds) ? (person as any).spouseIds.join(', ') : ''
});

const toDataUrl = (base64: string, mimeType?: string) => `data:${mimeType || 'image/jpeg'};base64,${base64}`;

const canManagePerson = (user: { role: UserRole; tenantId?: string; branchId?: string } | null, person: Person | null | undefined, branches: Branch[]) => {
  if (!user || !person) return false;
  const branchName = getBranchName(person, branches);
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.role === UserRole.QABILA_ADMIN) return Boolean(user.tenantId && person.tenantId && String(user.tenantId) === String(person.tenantId));
  if (user.role === UserRole.SUB_ADMIN) {
    return Boolean(
      user.tenantId &&
        person.tenantId &&
        String(user.tenantId) === String(person.tenantId) &&
        user.branchId &&
        String(user.branchId) === String(branchName)
    );
  }
  return false;
};

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
  'اب', 'الاب', 'ام', 'الام', 'ابن', 'ابنه', 'الابناء', 'اصل', 'جد', 'نسل', 'ذريه'
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

type TreeSearchResult = {
  person: Person;
  score: number;
  matchedFields: string[];
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
  extra: {
    parentName?: string;
    ancestorNames?: string[];
    childNames?: string[];
    descendantNames?: string[];
    branchPath?: string;
    generationDepth?: number;
    intent: SmartSearchIntent;
    branches: Branch[];
  }
) => {
  const firstName = normalizeSearchText(person.firstName || '');
  const lastName = normalizeSearchText(person.lastName || '');
  const fullName = normalizeSearchText(getFullName(person));
  const branch = normalizeSearchText(getBranchName(person, extra.branches));
  const branchPath = normalizeSearchText(extra.branchPath || branch);
  const bio = normalizeSearchText(person.bio || '');
  const personId = normalizeSearchText(String(person._id || person.id || ''));
  const birthYear = person.birthYear ? String(person.birthYear) : '';
  const deathYear = person.deathYear ? String(person.deathYear) : '';
  const parentName = normalizeSearchText(extra.parentName || '');
  const ancestorNames = normalizeSearchText((extra.ancestorNames || []).join(' '));
  const childNames = normalizeSearchText((extra.childNames || []).join(' '));
  const descendantNames = normalizeSearchText((extra.descendantNames || []).join(' '));
  const intent = extra.intent;
  const compactQuery = intent.compactQuery || compactSearchText(query);
  const compactFullName = compactSearchText(fullName);
  const compactFirstName = compactSearchText(firstName);
  const compactLastName = compactSearchText(lastName);
  const compactBranch = compactSearchText(branchPath);
  const compactLineage = compactSearchText(`${ancestorNames} ${fullName} ${descendantNames}`);

  const matchedFields = new Set<string>();
  let score = 0;

  if (!query) return { score: 0, matchedFields: [] as string[] };

  if (intent.requireLiving && !person.isLiving) return { score: 0, matchedFields: [] as string[] };
  if (intent.requireDeceased && person.isLiving) return { score: 0, matchedFields: [] as string[] };
  if (intent.birthFrom && person.birthYear && person.birthYear < intent.birthFrom) return { score: 0, matchedFields: [] as string[] };
  if (intent.birthTo && person.birthYear && person.birthYear > intent.birthTo) return { score: 0, matchedFields: [] as string[] };
  if (intent.deathFrom && person.deathYear && person.deathYear < intent.deathFrom) return { score: 0, matchedFields: [] as string[] };
  if (intent.deathTo && person.deathYear && person.deathYear > intent.deathTo) return { score: 0, matchedFields: [] as string[] };

  if (intent.generation && extra.generationDepth === intent.generation) {
    score += 360;
    matchedFields.add('الجيل');
  } else if (intent.generation && extra.generationDepth !== intent.generation) {
    score -= 180;
  }

  if (intent.exactYears.length) {
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

  if (personId.includes(query)) {
    score += personId === query ? 1200 : 780;
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

  score += scoreTokenAgainstText(query, firstName, 800, 520, 0);
  score += scoreTokenAgainstText(query, lastName, 780, 500, 0);
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
  if (ancestorNames && ancestorNames.includes(query)) {
    score += 190;
    matchedFields.add('تسلسل النسب');
  }
  if (childNames && childNames.includes(query)) {
    score += 180;
    matchedFields.add('أسماء الأبناء');
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

  intent.branchTerms.forEach((term) => {
    const branchTerm = normalizeSearchText(term);
    const compactBranchTerm = compactSearchText(branchTerm);
    if (includesLoose(branchPath, branchTerm) || (compactBranchTerm && compactBranch.includes(compactBranchTerm))) {
      score += branch === branchTerm ? 560 : 320;
      matchedFields.add('الفرع');
    }
  });

  if (intent.relation === 'parent' && parentName) {
    score += 180;
    matchedFields.add('صلة قرابة');
  }
  if (intent.relation === 'child' && childNames) {
    score += 180;
    matchedFields.add('صلة قرابة');
  }
  if (intent.relation === 'root' && !person.parentId) {
    score += 300;
    matchedFields.add('الأصل');
  }

  if (birthYear && (birthYear === query || birthYear.includes(query))) {
    score += birthYear === query ? 520 : 250;
    matchedFields.add('سنة الميلاد');
  }
  if (deathYear && (deathYear === query || deathYear.includes(query))) {
    score += deathYear === query ? 260 : 140;
    matchedFields.add('سنة الوفاة');
  }

  intent.nameTerms.forEach((token) => {
    const compactToken = compactSearchText(token);
    let tokenScore = 0;

    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, fullName, 360, 280, 190));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, firstName, 320, 240, 160));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, lastName, 300, 220, 150));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, parentName, 190, 140, 90));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, ancestorNames, 170, 120, 80));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, branchPath, 160, 120, 80));
    tokenScore = Math.max(tokenScore, scoreTokenAgainstText(token, bio, 70, 50, 30));

    if (compactToken && compactLineage.includes(compactToken)) tokenScore = Math.max(tokenScore, 110);
    if (compactToken && compactBranch.includes(compactToken)) tokenScore = Math.max(tokenScore, 130);

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
        personId.includes(token) ||
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

  return { score: score + Math.min(60, matchedFields.size * 10), matchedFields: Array.from(matchedFields) };
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type PanPoint = {
  x: number;
  y: number;
};

type ArrowButtonProps = {
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
};

function AnimatedArrowButton({ disabled, onPress, children, style }: ArrowButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animateTo(0.94)}
        onPressOut={() => animateTo(1)}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function FamilyTreeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'FamilyTree'>>();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const routeTenantSlug = route.params?.tenantSlug;
  const resolvedTenantSlug = routeTenantSlug || user?.tenantSlug;
  const {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading: tenantSelectionLoading,
  } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));
  const [viewMode, setViewMode] = useState<'tree' | 'reels'>('tree');
  const [persons, setPersons] = useState<Person[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const lastPinchDistanceRef = useRef<number | null>(null);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  // Estimated bottom navigator/tab height — adjust if your navigator uses a different height
  const TAB_BAR_HEIGHT = 64;
  const bottomNavigatorClearance = Math.max(
    BOTTOM_TAB_CLEARANCE_FALLBACK,
    tabBarHeight + spacing.lg + Math.max(insets.bottom, 0),
    TAB_BAR_HEIGHT + spacing.xl
  );
  const detailSheetBottomOffset = bottomNavigatorClearance + spacing.sm;
  const [filterLiving, setFilterLiving] = useState(false);
  const [filterHasBio, setFilterHasBio] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string | null>(null);
  const [filterBirthFrom, setFilterBirthFrom] = useState<number | undefined>(undefined);
  const [filterBirthTo, setFilterBirthTo] = useState<number | undefined>(undefined);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [isFocusedView, setIsFocusedView] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('edit');
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [memberDraft, setMemberDraft] = useState<MemberDraft>(createMemberDraft());
  const [showGallery, setShowGallery] = useState(false);
  const [showTenantPicker, setShowTenantPicker] = useState(false);
  const lastCenteredKeyRef = useRef('');
  const panRef = useRef<PanPoint>({ x: 0, y: 0 });
  const panStartRef = useRef<PanPoint>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const generationRailTouchingRef = useRef(false);

  const loadData = async (withSpinner = true) => {
    if (isSuperAdmin && tenantSelectionLoading) return;
    if (withSpinner) setLoading(true);
    try {
      let tenantId = user?.tenantId;

      if (isSuperAdmin) {
        tenantId = selectedTenantId;
      } else {
        try {
          const seedResult = await apiClient.seedDatabase(resolvedTenantSlug);
          if (seedResult?.tenantId) tenantId = seedResult.tenantId;
        } catch (seedErr) {
          console.warn('seedDatabase failed, falling back to user.tenantId', seedErr);
        }
      }

      if (!tenantId) {
        console.warn('No tenantId available to load family tree', {
          routeTenantSlug,
          userTenantSlug: user?.tenantSlug,
          userTenantId: user?.tenantId
        });
        setPersons([]);
        return;
      }

      const [data, branchesData] = await Promise.all([
        apiClient.getPersons(tenantId),
        apiClient.getBranches(tenantId).catch(() => [])
      ]);
      setPersons(Array.isArray(data) ? data : (data || []));
      setBranches(branchesData);
    } catch (err) {
      console.error('Failed loading family tree', err);
      Alert.alert('تعذر تحميل الشجرة', 'حصل خطأ أثناء تحميل بيانات الشجرة. حاول مرة أخرى لاحقاً.');
    } finally {
      if (withSpinner) setLoading(false);
      setRefreshing(false);
    }
  };

  useAuthenticatedEffect(() => {
    loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedTenantId, tenantSelectionLoading, resolvedTenantSlug, user?.tenantId]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    if (persons.length > MAX_TREE_NODES) {
      setIsFocusedView(true);
    }
  }, [persons.length]);

  const defaultFocusId = useMemo(() => {
    if (persons.length === 0) return null;
    const withBio = persons.find((person) => person.bio);
    const root = persons.find((person) => !person.parentId);
    return getPersonId(withBio || root || persons[0]);
  }, [persons]);

  useEffect(() => {
    if (persons.length === 0) return;
    if (!selectedPersonId && defaultFocusId) {
      setSelectedPersonId(defaultFocusId);
    }
  }, [persons, selectedPersonId, defaultFocusId]);

  useEffect(() => {
    if (viewMode === 'reels') {
      setShowDetails(false);
    } else {
      setShowDetails(true);
    }
  }, [viewMode]);

  const personsById = useMemo(() => {
    const map = new Map<string, Person>();
    persons.forEach((person) => {
      const id = getPersonId(person);
      if (id) map.set(id, person);
    });
    return map;
  }, [persons]);

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    persons.forEach((person) => {
      const parentId = String(person.parentId ?? '');
      if (!parentId) return;
      map.set(parentId, (map.get(parentId) || 0) + 1);
    });
    return map;
  }, [persons]);

  const getGenerationDepth = useCallback(
    (person?: Person | null) => {
      if (!person) return 1;
      let depth = 1;
      let current: Person | undefined = person;
      const visited = new Set<string>();

      while (current?.parentId) {
        const parentId = String(current.parentId);
        if (visited.has(parentId)) break;
        visited.add(parentId);
        const parent = personsById.get(parentId);
        if (!parent) break;
        depth += 1;
        current = parent;
      }

      return depth;
    },
    [personsById]
  );

  const effectiveFocusId = selectedPersonId || defaultFocusId;

  const selectedPerson =
    persons.find((person) => getPersonId(person) === String(selectedPersonId)) ||
    (effectiveFocusId ? personsById.get(effectiveFocusId) || null : null);
  const canManageSelectedPerson = canManagePerson(user, selectedPerson, branches);
  const canEditStructure = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.QABILA_ADMIN;

  const selectedPersonParent = useMemo(() => {
    if (!selectedPerson?.parentId) return null;
    return persons.find((p) => getPersonId(p) === String(selectedPerson.parentId)) || null;
  }, [selectedPerson, persons]);

  const selectedPersonChildren = useMemo(() => {
    if (!selectedPerson) return [];
    return persons.filter((p) => String(p.parentId) === getPersonId(selectedPerson));
  }, [selectedPerson, persons]);

  const selectedPersonSiblings = useMemo(() => {
    if (!selectedPerson?.parentId) return [];
    return persons.filter((p) => String(p.parentId) === String(selectedPerson.parentId) && getPersonId(p) !== getPersonId(selectedPerson));
  }, [selectedPerson, persons]);

  const countDescendants = (personId: string): number => {
    let count = 0;
    const queue = [personId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const children = persons.filter((p) => String(p.parentId) === String(currentId));
      count += children.length;
      children.forEach((c) => queue.push(getPersonId(c)));
    }
    return count;
  };

  const countAncestors = (personId: string): number => {
    let count = 0;
    let current = persons.find((p) => getPersonId(p) === String(personId));
    while (current?.parentId) {
      count += 1;
      current = persons.find((p) => getPersonId(p) === String(current?.parentId));
    }
    return count;
  };

  const selectedPersonStats = useMemo(() => {
    if (!selectedPerson) return { descendants: 0, ancestors: 0, siblings: selectedPersonSiblings.length, children: selectedPersonChildren.length };
    return {
      descendants: countDescendants(getPersonId(selectedPerson)),
      ancestors: countAncestors(getPersonId(selectedPerson)),
      siblings: selectedPersonSiblings.length,
      children: selectedPersonChildren.length
    };
  }, [selectedPerson, selectedPersonSiblings, selectedPersonChildren, persons]);

  useEffect(() => {
    if (!editorVisible) return;
    if (editorMode === 'edit') {
      setMemberDraft(createMemberDraft(selectedPerson || undefined, String(selectedPerson?.parentId || ''), branches));
    } else {
      setMemberDraft({
        ...createMemberDraft(undefined, String(selectedPersonId || ''), branches),
        branchId: getBranchName(selectedPerson, branches)
      });
    }
  }, [editorMode, editorVisible, selectedPerson, selectedPersonId, canEditStructure, branches]);

  const visiblePersons = useMemo(
    () => (isFocusedView ? getFocusedPersons(persons, effectiveFocusId, MAX_TREE_NODES) : persons),
    [persons, effectiveFocusId, isFocusedView]
  );

  const layout = useMemo(
    () => (visiblePersons.length ? buildLayout(visiblePersons) : null),
    [visiblePersons]
  );

  const visibleViewportHeight = useMemo(() => {
    const coveredByDetails = showDetails && selectedPerson ? DETAILS_HEIGHT + detailSheetBottomOffset : 0;
    return Math.max(160, canvasSize.height - coveredByDetails);
  }, [canvasSize.height, detailSheetBottomOffset, selectedPerson, showDetails]);

  const generationRailMaxHeight = useMemo(
    () => Math.max(96, Math.min(420, visibleViewportHeight - spacing.lg)),
    [visibleViewportHeight]
  );

  const clampPanToViewport = useCallback(
    (nextPan: PanPoint, nextZoom = zoomRef.current) => {
      if (!layout || canvasSize.width === 0 || canvasSize.height === 0) return nextPan;

      const getBounds = (viewport: number, content: number) => {
        const scaled = content * nextZoom;
        if (!viewport || !scaled) return { min: 0, max: 0 };
        if (scaled <= viewport) {
          const centered = (viewport - scaled) / 2;
          return { min: centered, max: centered };
        }
        return { min: viewport / 2 - scaled, max: viewport / 2 };
      };

      const xBounds = getBounds(canvasSize.width, layout.width);
      const yBounds = getBounds(visibleViewportHeight, layout.height);

      return {
        x: clampValue(nextPan.x, xBounds.min, xBounds.max),
        y: clampValue(nextPan.y, yBounds.min, yBounds.max)
      };
    },
    [canvasSize.height, canvasSize.width, layout, visibleViewportHeight]
  );

  const setClampedPan = useCallback(
    (nextPan: PanPoint, nextZoom = zoomRef.current) => {
      const clamped = clampPanToViewport(nextPan, nextZoom);
      panRef.current = clamped;
      setPan(clamped);
    },
    [clampPanToViewport]
  );

  const zoomAtViewportPoint = useCallback(
    (nextZoomValue: number, point?: PanPoint) => {
      if (!layout || canvasSize.width === 0 || canvasSize.height === 0) return;

      const nextZoom = clampValue(nextZoomValue, MIN_ZOOM, MAX_ZOOM);
      const currentZoom = zoomRef.current;
      if (nextZoom === currentZoom) return;

      const focusPoint = point || {
        x: canvasSize.width / 2,
        y: visibleViewportHeight / 2
      };

      const currentPan = panRef.current;
      const worldX = (focusPoint.x - currentPan.x) / currentZoom;
      const worldY = (focusPoint.y - currentPan.y) / currentZoom;
      const nextPan = {
        x: focusPoint.x - worldX * nextZoom,
        y: focusPoint.y - worldY * nextZoom
      };

      zoomRef.current = nextZoom;
      setZoomLevel(nextZoom);
      setClampedPan(nextPan, nextZoom);
    },
    [canvasSize.height, canvasSize.width, layout, setClampedPan, visibleViewportHeight]
  );

  const adjustZoom = useCallback(
    (delta: number) => {
      zoomAtViewportPoint(zoomRef.current + delta);
    },
    [zoomAtViewportPoint]
  );

  const treePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gesture) => {
          if (generationRailTouchingRef.current) return false;
          const touches = event.nativeEvent.touches?.length || 1;
          return touches >= 2 || Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
        },
        onPanResponderGrant: () => {
          panStartRef.current = panRef.current;
        },
        onPanResponderMove: (event, gesture) => {
          const touches = event.nativeEvent.touches || [];

          if (touches.length >= 2) {
            const [first, second] = touches;
            const dx = second.pageX - first.pageX;
            const dy = second.pageY - first.pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (lastPinchDistanceRef.current !== null && Math.abs(distance - lastPinchDistanceRef.current) > 2) {
              const factor = distance / lastPinchDistanceRef.current;
              zoomAtViewportPoint(zoomRef.current * factor);
            }

            lastPinchDistanceRef.current = distance;
            return;
          }

          lastPinchDistanceRef.current = null;
          setClampedPan({
            x: panStartRef.current.x + gesture.dx,
            y: panStartRef.current.y + gesture.dy
          });
        },
        onPanResponderRelease: () => {
          lastPinchDistanceRef.current = null;
        },
        onPanResponderTerminate: () => {
          lastPinchDistanceRef.current = null;
        }
      }),
    [setClampedPan, zoomAtViewportPoint]
  );

  useEffect(() => {
    if (!layout || canvasSize.width === 0 || canvasSize.height === 0) return;
    setClampedPan(panRef.current, zoomLevel);
  }, [canvasSize, layout, setClampedPan, visibleViewportHeight, zoomLevel]);

  const searchMatches = useMemo<TreeSearchResult[]>(() => {
    const query = searchQuery.trim();
    if (!query && !filterLiving && !filterHasBio && !filterBranch && !filterBirthFrom && !filterBirthTo) return [];

    const childrenMap = new Map<string, Person[]>();
    persons.forEach((person) => {
      const parentId = String(person.parentId ?? '');
      if (!parentId) return;
      const list = childrenMap.get(parentId) || [];
      list.push(person);
      childrenMap.set(parentId, list);
    });

    const getAncestorNames = (person: Person) => {
      const names: string[] = [];
      const visited = new Set<string>();
      let parentId = person.parentId ? String(person.parentId) : '';

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = personsById.get(parentId);
        if (!parent) break;
        names.push(getFullName(parent));
        parentId = parent.parentId ? String(parent.parentId) : '';
      }

      return names;
    };

    const getDescendantNames = (person: Person) => {
      const names: string[] = [];
      const queue = [...(childrenMap.get(getPersonId(person)) || [])];
      const visited = new Set<string>();

      while (queue.length > 0 && names.length < 40) {
        const child = queue.shift();
        if (!child) continue;
        const childId = getPersonId(child);
        if (!childId || visited.has(childId)) continue;

        visited.add(childId);
        names.push(getFullName(child));
        queue.push(...(childrenMap.get(childId) || []));
      }

      return names;
    };

    const normalizedQuery = normalizeSearchText(query);
    const tokens = tokenizeSearchText(query);
    const intent = parseSmartSearchIntent(query);

    return persons
      .map((person) => {
        const parent = person.parentId ? personsById.get(String(person.parentId)) || null : null;
        const childNames = (childrenMap.get(getPersonId(person)) || []).map((child) => getFullName(child));
        const branch = getBranchName(person, branches);
        const branchPath = getBranchHierarchyText(person.branchId, branches) || branch;
        const { score, matchedFields } = query
          ? scorePersonMatch(person, normalizedQuery, tokens, {
              parentName: parent ? getFullName(parent) : undefined,
              ancestorNames: getAncestorNames(person),
              childNames,
              descendantNames: getDescendantNames(person),
              branchPath,
              generationDepth: getGenerationDepth(person),
              intent,
              branches
            })
          : { score: 1, matchedFields: [] as string[] };

        const subtitleParts = [branchPath];
        if (person.birthYear) subtitleParts.push(`مواليد ${person.birthYear}`);
        if (person.deathYear) subtitleParts.push(`وفاة ${person.deathYear}`);
        if (matchedFields.length > 0) subtitleParts.push(matchedFields.slice(0, 3).join('، '));

        return {
          person,
          score,
          matchedFields,
          subtitle: subtitleParts.join(' · ')
        };
      })
      .filter((result) => {
        const person = result.person;
        if (query && result.score <= 0) return false;
        if (filterBranch && getBranchName(person, branches) !== filterBranch) return false;
        if (filterLiving && !person.isLiving) return false;
        if (filterHasBio && !person.bio) return false;
        if (filterBirthFrom && (person.birthYear || 0) < filterBirthFrom) return false;
        if (filterBirthTo && (person.birthYear || 0) > filterBirthTo) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return normalizeSearchText(getFullName(a.person)).localeCompare(normalizeSearchText(getFullName(b.person)), 'ar');
      });
  }, [branches, filterBirthFrom, filterBirthTo, filterBranch, filterHasBio, filterLiving, getGenerationDepth, persons, personsById, searchQuery]);

  const searchResults = useMemo(
    () => searchMatches.slice(0, MAX_SEARCH_RESULTS),
    [searchMatches]
  );

  const totalMatches = searchMatches.length;
  const isSearching = searchQuery.trim().length > 0 || filterLiving || filterHasBio || filterBranch || filterBirthFrom || filterBirthTo;
  const visibleCount = visiblePersons.length;
  const allGenerations = useMemo(() => {
    if (!layout) return [];
    return Array.from(new Set(layout.nodes.map((node) => node.depth + 1))).sort((a, b) => a - b);
  }, [layout]);

  const visibleGenerations = useMemo(() => {
    const visible = new Set<number>();
    if (!layout || canvasSize.height === 0) return visible;

    layout.nodes.forEach((node) => {
      const screenTop = node.y * zoomLevel + pan.y;
      const screenBottom = (node.y + NODE_HEIGHT) * zoomLevel + pan.y;
      if (screenBottom >= 0 && screenTop <= visibleViewportHeight) {
        visible.add(node.depth + 1);
      }
    });

    return visible;
  }, [canvasSize.height, layout, pan.y, visibleViewportHeight, zoomLevel]);

  const scrollToGeneration = useCallback(
    (generation: number) => {
      if (!layout) return;
      const targetNode = layout.nodes.filter((node) => node.depth + 1 === generation).sort((a, b) => a.x - b.x)[0];
      if (!targetNode) return;
      setSelectedPersonId(targetNode.id);
      setShowDetails(true);
      centerOnPerson(targetNode.id);
    },
    [layout]
  );

  useEffect(() => {
    if (!searchQuery.trim() && !filterLiving && !filterHasBio && !filterBranch && !filterBirthFrom && !filterBirthTo) return;
    if (searchResults.length === 0) return;
    if (selectedPersonId && searchResults.some((result) => getPersonId(result.person) === selectedPersonId)) return;
    setSelectedPersonId(getPersonId(searchResults[0].person));
  }, [searchQuery, filterLiving, filterHasBio, filterBranch, filterBirthFrom, filterBirthTo, searchResults, selectedPersonId]);

  const centerOnPerson = (id?: string | null) => {
    if (!layout || !id || canvasSize.width === 0 || canvasSize.height === 0) return;
    const node = layout.nodes.find((item) => item.id === String(id));
    if (!node) return;
    const targetPan = {
      x: canvasSize.width / 2 - node.x * zoomRef.current,
      y: visibleViewportHeight / 2 - (node.y + NODE_HEIGHT / 2) * zoomRef.current
    };
    setClampedPan(targetPan);
  };

  useEffect(() => {
    if (!isSearching || searchResults.length === 0) return;
    const targetId =
      selectedPersonId && searchResults.some((result) => getPersonId(result.person) === selectedPersonId)
        ? selectedPersonId
        : getPersonId(searchResults[0].person);
    centerOnPerson(targetId);
  }, [isSearching, searchQuery, totalMatches, selectedPersonId, layout, canvasSize, zoomLevel]);

  useEffect(() => {
    const targetId = selectedPersonId || effectiveFocusId;
    if (!layout || !targetId || canvasSize.width === 0 || canvasSize.height === 0) return;

    const centerKey = `${targetId}:${layout.width}:${layout.height}:${canvasSize.width}:${canvasSize.height}`;
    if (lastCenteredKeyRef.current === centerKey) return;

    centerOnPerson(targetId);
    lastCenteredKeyRef.current = centerKey;
  }, [layout, selectedPersonId, effectiveFocusId, canvasSize]);

  const handleSelectPerson = (id: string) => {
    setSelectedPersonId(id);
    setShowDetails(true);
    centerOnPerson(id);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadData(false);
  };

  const handleFocusSelected = () => {
    if (!selectedPersonId) return;
    setIsFocusedView(true);
    centerOnPerson(selectedPersonId);
  };

  const openEditMember = () => {
    if (!selectedPerson || !canManageSelectedPerson) return;
    setEditorError('');
    setEditorMode('edit');
    setEditorVisible(true);
  };

  const openAddMember = () => {
    if (!selectedPerson || !canManageSelectedPerson) return;
    setEditorError('');
    setEditorMode('add');
    setEditorVisible(true);
  };

  const closeEditor = () => {
    if (editorSaving) return;
    setEditorVisible(false);
    setEditorError('');
  };

  const saveMember = async () => {
    const activeTenantId = isSuperAdmin ? selectedTenantId : user?.tenantId;

    if (!activeTenantId) {
      setEditorError('تعذر تحديد مساحة العائلة الحالية.');
      return;
    }

    const firstName = memberDraft.firstName.trim();
    const lastName = memberDraft.lastName.trim();
    if (!firstName || !lastName) {
      setEditorError('الاسم الأول واسم العائلة مطلوبان.');
      return;
    }

    setEditorSaving(true);
    setEditorError('');

    const payload: Record<string, unknown> = {
      firstName,
      lastName,
      bio: memberDraft.bio.trim(),
      imageSrc: memberDraft.imageSrc.trim() || undefined
    };

    const birthYear = memberDraft.birthYear.trim();
    const deathYear = memberDraft.deathYear.trim();

    if (birthYear) {
      const parsedBirthYear = Number(birthYear);
      if (Number.isNaN(parsedBirthYear)) {
        setEditorError('سنة الميلاد يجب أن تكون رقماً صالحاً.');
        setEditorSaving(false);
        return;
      }
      payload.birthYear = parsedBirthYear;
    }

    if (deathYear) {
      const parsedDeathYear = Number(deathYear);
      if (Number.isNaN(parsedDeathYear)) {
        setEditorError('سنة الوفاة يجب أن تكون رقماً صالحاً.');
        setEditorSaving(false);
        return;
      }
      payload.deathYear = parsedDeathYear;
    }

    if (canEditStructure) {
      payload.parentId = memberDraft.parentId.trim() || null;
      payload.branchId = memberDraft.branchId.trim() || 'الفرع الرئيسي';
    }

    const spouseIds = memberDraft.spouseIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (spouseIds.length > 0) {
      (payload as any).spouseIds = spouseIds;
    }

    try {
      if (editorMode === 'edit' && selectedPerson) {
        await apiClient.updatePerson(getPersonId(selectedPerson), payload);
        await loadData(false);
        setSelectedPersonId(getPersonId(selectedPerson));
      } else {
        const created = await apiClient.createPerson({
          tenantId: activeTenantId,
          ...payload,
          parentId: canEditStructure ? memberDraft.parentId.trim() || null : selectedPerson ? getPersonId(selectedPerson) : null,
          branchId: canEditStructure ? memberDraft.branchId.trim() || 'الفرع الرئيسي' : getBranchName(selectedPerson, branches)
        });
        await loadData(false);
        setSelectedPersonId(getPersonId(created));
      }
      setEditorVisible(false);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'تعذر حفظ العضو حالياً.');
    } finally {
      setEditorSaving(false);
    }
  };

  const pickMemberImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setEditorError('نحتاج إذن الوصول للصور لاختيار ملف العضو.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      base64: true
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) {
      setEditorError('تعذر قراءة الصورة المختارة.');
      return;
    }

    setMemberDraft((current) => ({
      ...current,
      imageSrc: toDataUrl(asset.base64 || '', asset.mimeType)
    }));
  };

  const deleteSelectedMember = () => {
    const activeTenantId = isSuperAdmin ? selectedTenantId : user?.tenantId;
    if (!selectedPerson || !canManageSelectedPerson || !activeTenantId) return;

    Alert.alert('حذف العضو', `هل تريد حذف ${getFullName(selectedPerson)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deletePerson(getPersonId(selectedPerson), activeTenantId);
            await loadData(false);
            setSelectedPersonId(null);
          } catch (error) {
            Alert.alert('تعذر الحذف', error instanceof Error ? error.message : 'تعذر حذف العضو حالياً.');
          }
        }
      }
    ]);
  };

  const openGallery = () => {
    if (!selectedPerson) return;
    setShowGallery(true);
  };

  const handleResetRoot = () => {
    const root = persons.find((person) => !person.parentId) || persons[0];
    if (!root) return;
    const rootId = getPersonId(root);
    setSelectedPersonId(rootId);
    setShowDetails(true);
    centerOnPerson(rootId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="شجرة العائلة"
        onBack={() => navigation.goBack()}
      />

      {isSuperAdmin ? (
        <View style={styles.tenantPickerCard}>
          <View style={styles.tenantPickerTextBlock}>
            <Text style={styles.tenantPickerLabel}>العائلة المعروضة</Text>
            <Text style={styles.tenantPickerTitle}>{selectedTenant?.name || 'اختر عائلة'}</Text>
            <Text style={styles.tenantPickerSubtitle}>هذه العائلة تُستخدم للشجرة للمشرف العام.</Text>
          </View>
          <TouchableOpacity style={styles.tenantPickerButton} onPress={() => setShowTenantPicker(true)} activeOpacity={0.9}>
            <Text style={styles.tenantPickerButtonText}>تغيير العائلة</Text>
            <Ionicons name="chevron-down" size={16} color={colors.surface} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'tree' && styles.toggleButtonActive]}
          onPress={() => setViewMode('tree')}
        >
          <Text style={[styles.toggleText, viewMode === 'tree' && styles.toggleTextActive]}>شجرة العائلة</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'reels' && styles.toggleButtonActive]}
          onPress={() => setViewMode('reels')}
        >
          <Text style={[styles.toggleText, viewMode === 'reels' && styles.toggleTextActive]}>عرض النسب</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'tree' ? (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="مثال: محمد سلمان 1996 فرع الرياض"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              textAlign="right"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.searchMetaRow}>
            <Text style={styles.searchMetaText}>يعرض {visibleCount} من {persons.length} فرد</Text>
            <View style={styles.searchMetaTag}>
              <Text style={styles.searchMetaTagText}>{`تم تحميل ${persons.length} فرد`}</Text>
            </View>
          </View>



          {isSearching ? (
            <View style={styles.searchResults}>
              <View style={styles.searchResultsHeader}>
                <Text style={styles.searchResultsTitle}>نتائج البحث</Text>
                <Text style={styles.searchResultsCount}>{totalMatches} نتيجة</Text>
              </View>
              <ScrollView style={styles.searchResultsScroll} contentContainerStyle={styles.searchResultsList} nestedScrollEnabled>
                {searchResults.map((result) => {
                  const person = result.person;
                  const id = getPersonId(person);
                  const parent = person.parentId ? personsById.get(String(person.parentId)) : null;
                  const childCount = childCountMap.get(id) || 0;

                  return (
                    <TouchableOpacity
                      key={id}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectPerson(id)}
                    >
                      <Image source={{ uri: getImageSrc(person) }} style={styles.searchResultAvatar} />
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.searchResultName}>{getFullName(person)}</Text>
                        <Text style={styles.searchResultMeta} numberOfLines={1}>
                          {result.subtitle || `${parent ? `ابن ${getFullName(parent)}` : 'جذر العائلة'} · ${childCount} أبناء`}
                        </Text>
                        {result.matchedFields.length > 0 ? (
                          <View style={styles.searchMatchRow}>
                            {result.matchedFields.slice(0, 3).map((field) => (
                              <Text key={field} style={styles.searchMatchPill}>{field}</Text>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {totalMatches > MAX_SEARCH_RESULTS ? (
                  <Text style={styles.searchResultsNote}>عرض {MAX_SEARCH_RESULTS} نتائج من {totalMatches}</Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {viewMode === 'tree' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.treeControlsContainer}
          contentContainerStyle={styles.treeControls}
        >
          <TouchableOpacity
            style={[styles.controlChip, isFocusedView && styles.controlChipActive]}
            onPress={() => setIsFocusedView((prev) => !prev)}
          >
            <Ionicons name="layers-outline" size={16} color={isFocusedView ? colors.surface : colors.text} />
            <Text style={[styles.controlChipText, isFocusedView && styles.controlChipTextActive]}>
              {isFocusedView ? 'عرض كامل' : 'عرض مركز'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlChip} onPress={() => centerOnPerson(selectedPersonId)}>
            <Ionicons name="navigate" size={16} color={colors.text} />
            <Text style={styles.controlChipText}>تمركز</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlChip} onPress={handleResetRoot}>
            <Ionicons name="home" size={16} color={colors.text} />
            <Text style={styles.controlChipText}>الجذر</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlChip} onPress={() => setShowDetails((prev) => !prev)}>
            <Ionicons name="information-circle-outline" size={16} color={colors.text} />
            <Text style={styles.controlChipText}>{showDetails ? 'إخفاء التفاصيل' : 'إظهار التفاصيل'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlChip, refreshing && styles.controlChipActive]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Ionicons name="refresh" size={16} color={refreshing ? colors.surface : colors.text} />
            <Text style={[styles.controlChipText, refreshing && styles.controlChipTextActive]}>
              {refreshing ? 'جارٍ التحديث' : 'تحديث البيانات'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlChip} onPress={handleFocusSelected}>
            <Ionicons name="locate" size={16} color={colors.text} />
            <Text style={styles.controlChipText}>تركيز الفرع</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlChip} onPress={() => setZoomLevel(1)}>
            <Ionicons name="resize" size={16} color={colors.text} />
            <Text style={styles.controlChipText}>{Math.round(zoomLevel * 100)}%</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.loadingState}>
          <Skeleton style={{ height: 12, width: '50%', borderRadius: 8, marginBottom: spacing.md }} aria-label="loading-tree-title" />
          <Skeleton style={{ height: 220, borderRadius: 12 }} aria-label="loading-tree-canvas" />
        </View>
      ) : viewMode === 'reels' ? (
        <ReelsView persons={persons} branches={branches} selectedPersonId={selectedPersonId} />
      ) : (
        <View
          style={styles.treeScene}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setCanvasSize({ width, height });
          }}
        >
          <View pointerEvents="none" style={styles.treeFogOverlay}>
            <View style={[styles.fogBlob, styles.fogBlobTopLeft]} />
            <View style={[styles.fogBlob, styles.fogBlobTopRight]} />
            <View style={[styles.fogBlob, styles.fogBlobBottomCenter]} />
            <View style={styles.fogTopFade} />
            <View style={styles.fogBottomFade} />
          </View>
          {!layout ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد بيانات للشجرة حالياً.</Text>
            </View>
          ) : (
            <View style={styles.treeViewport} {...treePanResponder.panHandlers}>
              <View
                style={[
                  styles.treeWorld,
                  {
                    width: layout.width,
                    height: layout.height,
                    transform: [
                      { translateX: pan.x - ((1 - zoomLevel) * layout.width) / 2 },
                      { translateY: pan.y - ((1 - zoomLevel) * layout.height) / 2 },
                      { scale: zoomLevel }
                    ]
                  }
                ]}
              >
                {layout.edges.map((edge, index) => {
                  const startX = edge.from.x;
                  const startY = edge.from.y + NODE_HEIGHT;
                  const endX = edge.to.x;
                  const endY = edge.to.y;
                  const midY = startY + V_GAP / 2;
                  const horizontalWidth = Math.abs(endX - startX);
                  const horizontalLeft = Math.min(startX, endX);

                  return (
                    <React.Fragment key={`${edge.from.id}-${edge.to.id}-${index}`}>
                      <View
                        style={[
                          styles.lineVertical,
                          {
                            left: startX - LINE_WIDTH / 2,
                            top: startY,
                            height: Math.max(0, midY - startY)
                          }
                        ]}
                      />
                      <View
                        style={[
                          styles.lineHorizontal,
                          {
                            left: horizontalLeft,
                            top: midY - LINE_WIDTH / 2,
                            width: Math.max(0, horizontalWidth)
                          }
                        ]}
                      />
                      <View
                        style={[
                          styles.lineVertical,
                          {
                            left: endX - LINE_WIDTH / 2,
                            top: midY,
                            height: Math.max(0, endY - midY)
                          }
                        ]}
                      />
                    </React.Fragment>
                  );
                })}

                {layout.nodes.map((node) => {
                  const isSelected = String(selectedPersonId) === node.id;
                  return (
                    <View
                      key={node.id}
                      style={{
                        position: 'absolute',
                        left: node.x - NODE_WIDTH / 2,
                        top: node.y,
                        width: NODE_WIDTH,
                        height: NODE_HEIGHT
                      }}
                    >
                      <TouchableOpacity
                        style={[styles.nodeCard, isSelected && styles.nodeCardSelected]}
                        onPress={() => handleSelectPerson(node.id)}
                      >
                        {isSelected && (
                          <View style={styles.nodeBadge}>
                            <Text style={styles.nodeBadgeText}>محدد</Text>
                          </View>
                        )}
                        <Image source={{ uri: getImageSrc(node.person) }} style={styles.nodeAvatar} />
                        <Text style={styles.nodeName} numberOfLines={1}>
                          {getFullName(node.person)}
                        </Text>
                        <Text style={styles.nodeDates} numberOfLines={1}>
                          {formatDates(node.person)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {allGenerations.length > 1 ? (
                <View style={[styles.generationRail, { maxHeight: generationRailMaxHeight }]}>
                  <ScrollView
                    style={styles.generationRailScroll}
                    contentContainerStyle={styles.generationRailContent}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    onTouchStart={() => {
                      generationRailTouchingRef.current = true;
                    }}
                    onTouchEnd={() => {
                      generationRailTouchingRef.current = false;
                    }}
                    onTouchCancel={() => {
                      generationRailTouchingRef.current = false;
                    }}
                  >
                    {allGenerations.map((generation) => {
                      const isVisible = visibleGenerations.has(generation);
                      return (
                        <TouchableOpacity
                          key={generation}
                          style={[styles.generationButton, isVisible && styles.generationButtonActive]}
                          onPress={() => scrollToGeneration(generation)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.generationButtonText, isVisible && styles.generationButtonTextActive]}>
                            {generation.toLocaleString('ar-SA')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          )}

          <Modal
            visible={Boolean(selectedPerson && showDetails)}
            transparent
            animationType="fade"
            onRequestClose={() => setShowDetails(false)}
          >
            <View style={styles.detailSheetOverlay} pointerEvents="box-none">
              {selectedPerson ? (
                <View style={[styles.bottomSheet, { bottom: detailSheetBottomOffset }]}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.sheetHeader}>
                    <TouchableOpacity style={styles.sheetClose} onPress={() => setShowDetails(false)}>
                      <Ionicons name="close" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <View style={styles.sheetTitleBlock}>
                      <Text style={styles.sheetName}>{getFullName(selectedPerson)}</Text>
                      <Text style={styles.sheetDates}>{formatDates(selectedPerson)}</Text>
                    </View>
                    <Image source={{ uri: getImageSrc(selectedPerson) }} style={styles.sheetAvatar} />
                  </View>

                  <Text style={styles.sheetBio} numberOfLines={4}>
                    {selectedPerson.bio || 'لا توجد سيرة مسجلة حتى الآن. يمكنك إضافة نبذة مختصرة عن حياة صاحب السيرة.'}
                  </Text>

                  <View style={styles.sheetStatsRow}>
                    <View style={styles.sheetStatItem}>
                      <Text style={styles.sheetStatValue}>{selectedPersonStats.ancestors}</Text>
                      <Text style={styles.sheetStatLabel}>أجداد</Text>
                    </View>
                    <View style={styles.sheetStatItem}>
                      <Text style={styles.sheetStatValue}>{selectedPersonStats.children}</Text>
                      <Text style={styles.sheetStatLabel}>أبناء</Text>
                    </View>
                    <View style={styles.sheetStatItem}>
                      <Text style={styles.sheetStatValue}>{selectedPersonStats.siblings}</Text>
                      <Text style={styles.sheetStatLabel}>إخوة</Text>
                    </View>
                    <View style={styles.sheetStatItem}>
                      <Text style={styles.sheetStatValue}>{selectedPersonStats.descendants}</Text>
                      <Text style={styles.sheetStatLabel}>أحفاد</Text>
                    </View>
                  </View>

                  {canManageSelectedPerson ? (<View style={styles.sheetActions}>
                    
                      <View style={styles.sheetActionRow}>
                        <TouchableOpacity style={styles.sheetSecondaryButton} onPress={openAddMember}>
                          <Ionicons name="person-add-outline" size={18} color={colors.text} />
                          <Text style={styles.sheetSecondaryText}>إضافة فرد</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sheetSecondaryButton} onPress={openEditMember}>
                          <Ionicons name="create-outline" size={18} color={colors.text} />
                          <Text style={styles.sheetSecondaryText}>تعديل</Text>
                        </TouchableOpacity>
                      </View>
                    
                    <View style={styles.sheetActionRow}>
                      {/* <TouchableOpacity style={styles.sheetSecondaryButton} onPress={openGallery}>
                        <Ionicons name="images-outline" size={18} color={colors.text} />
                        <Text style={styles.sheetSecondaryText}>معرض الوثائق</Text>
                      </TouchableOpacity> */}
                      
                        <TouchableOpacity style={[styles.sheetSecondaryButton, styles.sheetDangerButton]} onPress={deleteSelectedMember}>
                          <Ionicons name="trash-outline" size={18} color={colors.error} />
                          <Text style={[styles.sheetSecondaryText, styles.sheetDangerText]}>حذف</Text>
                        </TouchableOpacity>
                      
                    </View>
                  </View>) : null}

                  <View style={styles.sheetRelationsSection}>
                    <Text style={styles.sheetRelationsTitle}>العلاقات العائلية</Text>
                    {selectedPersonParent && (
                      <View style={styles.relationItem}>
                        <Text style={styles.relationLabel}>الأب/الأم</Text>
                        <Text style={styles.relationValue}>{getFullName(selectedPersonParent)}</Text>
                      </View>
                    )}
                    {selectedPersonChildren.length > 0 && (
                      <View style={styles.relationItem}>
                        <Text style={styles.relationLabel}>الأبناء ({selectedPersonChildren.length})</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relationList}>
                          {selectedPersonChildren.slice(0, 3).map((child) => (
                            <View key={getPersonId(child)} style={styles.relationPill}>
                              <Text style={styles.relationPillText}>{getFullName(child)}</Text>
                            </View>
                          ))}
                          {selectedPersonChildren.length > 3 && (
                            <View style={styles.relationPill}>
                              <Text style={styles.relationPillText}>و {selectedPersonChildren.length - 3} آخرين</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}
                    {selectedPersonSiblings.length > 0 && (
                      <View style={styles.relationItem}>
                        <Text style={styles.relationLabel}>الإخوة ({selectedPersonSiblings.length})</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relationList}>
                          {selectedPersonSiblings.slice(0, 3).map((sibling) => (
                            <View key={getPersonId(sibling)} style={styles.relationPill}>
                              <Text style={styles.relationPillText}>{getFullName(sibling)}</Text>
                            </View>
                          ))}
                          {selectedPersonSiblings.length > 3 && (
                            <View style={styles.relationPill}>
                              <Text style={styles.relationPillText}>و {selectedPersonSiblings.length - 3} آخرين</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          </Modal>
        </View>
      )}

      <Modal visible={showTenantPicker} transparent animationType="fade" onRequestClose={() => setShowTenantPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.tenantPickerModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>اختيار العائلة</Text>
                <Text style={styles.modalSubtitle}>اختر العائلة التي تريد عرضها في الشجرة.</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowTenantPicker(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tenantPickerList} contentContainerStyle={styles.tenantPickerListContent}>
              {tenants.map((tenant) => {
                const isSelected = tenant._id === selectedTenantId;
                return (
                  <TouchableOpacity
                    key={tenant._id}
                    style={[styles.tenantPickerOption, isSelected && styles.tenantPickerOptionSelected]}
                    onPress={() => {
                      setSelectedTenantId(tenant._id);
                      setShowTenantPicker(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.tenantPickerOptionTitle, isSelected && styles.tenantPickerOptionTitleSelected]}>{tenant.name}</Text>
                    <Text style={[styles.tenantPickerOptionSub, isSelected && styles.tenantPickerOptionTitleSelected]}>{tenant.subdomain}.qabila.com</Text>
                  </TouchableOpacity>
                );
              })}

              {tenants.length === 0 ? (
                <View style={styles.tenantPickerEmpty}>
                  <Text style={styles.tenantPickerEmptyText}>لا توجد عائلات متاحة حالياً.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={closeEditor}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editorMode === 'edit' ? 'تعديل العضو' : 'إضافة عضو جديد'}</Text>
                <Text style={styles.modalSubtitle}>
                  {canEditStructure
                    ? 'يمكنك تعديل الاسم والبيانات والربط البنيوي.'
                    : 'يمكنك تعديل البيانات الأساسية فقط لهذا الفرع.'}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={closeEditor} disabled={editorSaving}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الاسم الأول</Text>
                  <TextInput
                    style={styles.formInput}
                    value={memberDraft.firstName}
                    onChangeText={(value) => setMemberDraft((current) => ({ ...current, firstName: value }))}
                    placeholder="الاسم الأول"
                    placeholderTextColor={colors.textMuted}
                    textAlign="right"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>اسم العائلة</Text>
                  <TextInput
                    style={styles.formInput}
                    value={memberDraft.lastName}
                    onChangeText={(value) => setMemberDraft((current) => ({ ...current, lastName: value }))}
                    placeholder="اسم العائلة"
                    placeholderTextColor={colors.textMuted}
                    textAlign="right"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>سنة الميلاد</Text>
                  <TextInput
                    style={styles.formInput}
                    value={memberDraft.birthYear}
                    onChangeText={(value) => setMemberDraft((current) => ({ ...current, birthYear: value }))}
                    placeholder="1990"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>سنة الوفاة</Text>
                  <TextInput
                    style={styles.formInput}
                    value={memberDraft.deathYear}
                    onChangeText={(value) => setMemberDraft((current) => ({ ...current, deathYear: value }))}
                    placeholder="اختياري"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>صورة الملف</Text>
                <View style={styles.imagePickerRow}>
                  <View style={styles.imagePreviewWrap}>
                    {memberDraft.imageSrc ? (
                      <Image source={{ uri: memberDraft.imageSrc }} style={styles.imagePreview} />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <TouchableOpacity style={styles.imageUploadButton} onPress={pickMemberImage}>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.surface} />
                    <Text style={styles.imageUploadButtonText}>اختيار صورة</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>نبذة</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={memberDraft.bio}
                  onChangeText={(value) => setMemberDraft((current) => ({ ...current, bio: value }))}
                  placeholder="نبذة قصيرة عن العضو"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  textAlign="right"
                />
              </View>

              {canEditStructure ? (
                <>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>الفرع</Text>
                    <TextInput
                      style={styles.formInput}
                      value={memberDraft.branchId}
                      onChangeText={(value) => setMemberDraft((current) => ({ ...current, branchId: value }))}
                      placeholder="الفرع الرئيسي"
                      placeholderTextColor={colors.textMuted}
                      textAlign="right"
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>معرف الأب</Text>
                    <TextInput
                      style={styles.formInput}
                      value={memberDraft.parentId}
                      onChangeText={(value) => setMemberDraft((current) => ({ ...current, parentId: value }))}
                      placeholder={editorMode === 'add' ? getPersonId(selectedPerson) : 'اختياري'}
                      placeholderTextColor={colors.textMuted}
                      textAlign="right"
                    />
                  </View>
                </>
              ) : null}

              <View style={styles.formField}>
                <Text style={styles.formLabel}>معرفات الأزواج (مفصولة بفواصل)</Text>
                <TextInput
                  style={styles.formInput}
                  value={memberDraft.spouseIds}
                  onChangeText={(value) => setMemberDraft((current) => ({ ...current, spouseIds: value }))}
                  placeholder="مثال: 64ab12..., 64ab13..."
                  placeholderTextColor={colors.textMuted}
                  textAlign="right"
                />
              </View>

              {editorError ? <Text style={styles.formError}>{editorError}</Text> : null}

              <TouchableOpacity style={[styles.formPrimaryButton, editorSaving && styles.formButtonDisabled]} onPress={saveMember} disabled={editorSaving}>
                <Text style={styles.formPrimaryButtonText}>{editorSaving ? 'جارٍ الحفظ...' : 'حفظ'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showGallery} transparent animationType="fade" onRequestClose={() => setShowGallery(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>معرض الوثائق</Text>
                <Text style={styles.modalSubtitle}>{selectedPerson ? getFullName(selectedPerson) : ''}</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowGallery(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.galleryContent} showsVerticalScrollIndicator={false}>
              {selectedPerson?.imageSrc ? (
                <View style={styles.galleryImageContainer}>
                  <Image source={{ uri: selectedPerson.imageSrc }} style={styles.galleryImage} />
                  <Text style={styles.galleryCaption}>صورة ملف العضو</Text>
                </View>
              ) : null}
              
              <View style={styles.galleryEmptyState}>
                <Ionicons name="folder-outline" size={48} color={colors.textMuted} />
                <Text style={styles.galleryEmptyText}>لا توجد وثائق مرفوعة حالياً</Text>
                <Text style={styles.galleryEmptySubtext}>يمكنك إضافة وثائق من خلال تعديل ملف العضو</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ReelsView({
  persons,
  branches,
  selectedPersonId
}: {
  persons: Person[];
  branches: Branch[];
  selectedPersonId?: string | null;
}) {
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const lastExternalSelectedPersonId = useRef<string | null>(null);
  const tabBarClearance = Math.max(
    BOTTOM_TAB_CLEARANCE_FALLBACK,
    tabBarHeight + spacing.lg + Math.max(insets.bottom, 0)
  );

  useEffect(() => {
    if (persons.length === 0) {
      if (currentPersonId) setCurrentPersonId(null);
      return;
    }

    const currentStillExists = persons.some((person) => getPersonId(person) === String(currentPersonId));
    if (currentStillExists) return;

    const rootPerson = persons.find((person) => !person.parentId) || persons[0];
    setCurrentPersonId(getPersonId(rootPerson));
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

  const currentIndex = useMemo(
    () => persons.findIndex((person) => getPersonId(person) === String(currentPersonId)),
    [persons, currentPersonId]
  );

  const siblingIndex = useMemo(() => {
    if (!currentPerson || siblings.length === 0) return -1;
    return siblings.findIndex((person) => getPersonId(person) === getPersonId(currentPerson));
  }, [siblings, currentPerson]);

  const generationLevel = useMemo(() => {
    if (!currentPerson) return 1;

    let level = 1;
    let cursor: Person | null = currentPerson;
    const visited = new Set<string>();

    while (cursor?.parentId) {
      const nextParentId: string = String(cursor.parentId);
      if (!nextParentId || visited.has(nextParentId)) break;
      visited.add(nextParentId);

      const parentPerson: Person | null = persons.find((person) => getPersonId(person) === nextParentId) || null;
      if (!parentPerson) break;

      level += 1;
      cursor = parentPerson;
    }

    return level;
  }, [currentPerson, persons]);

  const nameTrail = useMemo(() => {
    if (!currentPerson) return [];
    const grandfather = parent?.parentId
      ? persons.find((person) => getPersonId(person) === String(parent.parentId))
      : null;

    return [
      grandfather?.firstName,
      parent?.firstName,
      currentPerson.firstName
    ].filter(Boolean) as string[];
  }, [currentPerson, parent, persons]);

  const branchLabel = useMemo(
    () => getBranchName(currentPerson, branches),
    [currentPerson, branches]
  );

  const navigateToPerson = useCallback((person: Person | null) => {
    if (!person) return;
    setCurrentPersonId(getPersonId(person));
    setShowDetails(false);
  }, []);

  const handleUp = useCallback(() => {
    if (parent) navigateToPerson(parent);
  }, [navigateToPerson, parent]);

  const handleDown = useCallback(() => {
    if (children.length > 0) navigateToPerson(children[0]);
  }, [children, navigateToPerson]);

  const handleNextSibling = useCallback(() => {
    if (!currentPerson || siblings.length <= 1) return;
    const nextIndex = (siblingIndex + 1 + siblings.length) % siblings.length;
    navigateToPerson(siblings[nextIndex]);
  }, [currentPerson, navigateToPerson, siblingIndex, siblings]);

  const handlePrevSibling = useCallback(() => {
    if (!currentPerson || siblings.length <= 1) return;
    const prevIndex = (siblingIndex - 1 + siblings.length) % siblings.length;
    navigateToPerson(siblings[prevIndex]);
  }, [currentPerson, navigateToPerson, siblingIndex, siblings]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !showDetails && (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12),
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
          if (gesture.dy < -50) handleDown();
          if (gesture.dy > 50) handleUp();
        } else {
          if (gesture.dx < -50) handleNextSibling();
          if (gesture.dx > 50) handlePrevSibling();
        }
      }
    }),
    [handleDown, handleNextSibling, handlePrevSibling, handleUp, showDetails]
  );

  if (!currentPerson) {
    return (
      <View style={[styles.reelsEmpty, { marginBottom: tabBarClearance }]}>
        <Text style={styles.reelsEmptyText}>لا يوجد بيانات</Text>
      </View>
    );
  }

  return (
    <View style={[styles.reelsContainer, { marginBottom: tabBarClearance }]} {...panResponder.panHandlers}>
      <ImageBackground
        source={{ uri: getImageSrc(currentPerson) }}
        style={styles.reelsBackground}
        imageStyle={styles.reelsImage}
        resizeMode="contain"
      >
        <View style={styles.reelsOverlay} />
        <View style={styles.reelsTopGradient} />
        <View style={styles.reelsBottomGradient} />

        {/* Header */}
        <View style={styles.reelsHeader}>
          <View style={styles.reelsTrailChip}>
            <View style={styles.reelsTrailRow}>
              {nameTrail.map((name, index) => {
                const isLast = index === nameTrail.length - 1;
                return (
                  <React.Fragment key={`${name}-${index}`}>
                    <Text
                      style={[styles.reelsTrailText, isLast && styles.reelsTrailTextActive]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    {!isLast && <Text style={styles.reelsTrailDivider}>›</Text>}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
          <View style={styles.reelsMetaGroup}>
            <View style={styles.reelsGenerationBadge}>
              <Text style={styles.reelsGenerationBadgeText}>الجيل {generationLevel.toLocaleString('ar-SA')}</Text>
            </View>
            <View style={styles.reelsCounterChip}>
              <Text style={styles.reelsCounterText}>{Math.max(currentIndex + 1, 1)} / {persons.length}</Text>
            </View>
          </View>
        </View>

        {/* Main Content Info */}
        <View style={styles.reelsInfo}>
          <View style={styles.reelsBadgeRow}>
            <View style={styles.reelsBirthBadge}>
              <Text style={styles.reelsBirthBadgeText}>
                {currentPerson.birthYear ? `مواليد ${currentPerson.birthYear}` : 'الجيل السابق'}
              </Text>
            </View>
            <View style={styles.reelsSiblingBadge}>
              <Text style={styles.reelsSiblingBadgeText}>
                {siblings.length > 1 ? `${siblings.length} إخوة` : 'الوحيد'}
              </Text>
            </View>
            <View style={styles.reelsBranchBadge}>
              <Text style={styles.reelsSiblingBadgeText} numberOfLines={1}>{branchLabel}</Text>
            </View>
          </View>

          <Text style={styles.reelsName}>{getFullName(currentPerson)}</Text>
          <Text style={styles.reelsDates}>{formatDates(currentPerson)}</Text>

          <View style={styles.reelsStatsRow}>
            <View style={styles.reelsStatChip}>
              <Text style={styles.reelsStatValue}>{parent ? '✓' : '—'}</Text>
              <Text style={styles.reelsStatLabel}>أب</Text>
            </View>
            <View style={styles.reelsStatChip}>
              <Text style={styles.reelsStatValue}>{children.length}</Text>
              <Text style={styles.reelsStatLabel}>أبناء</Text>
            </View>
            <View style={styles.reelsStatChip}>
              <Text style={styles.reelsStatValue}>{siblings.length > 1 ? siblings.length : '—'}</Text>
              <Text style={styles.reelsStatLabel}>إخوة</Text>
            </View>
          </View>

          <Text style={styles.reelsBio} numberOfLines={2}>
            {currentPerson.bio || 'لا توجد نبذة متاحة'}
          </Text>
        </View>

        {/* Progress Indicator */}
        <View style={styles.reelsProgressRail}>
          {(siblings.length > 0 ? siblings : [currentPerson]).map((_, index) => (
            <View
              key={`sibling-segment-${index}`}
              style={[
                styles.reelsProgressSegment,
                index === Math.max(siblingIndex, 0) && styles.reelsProgressSegmentActive,
                siblingIndex > 0 && index < siblingIndex && styles.reelsProgressSegmentPast
              ]}
            />
          ))}
        </View>

        {/* Bottom Action Buttons (TikTok Style) */}
        <View style={styles.reelsBottomActions}>
         

          {/* Parent Button */}
          <TouchableOpacity
            style={[styles.reelsActionButton, !parent && styles.reelsActionButtonDisabled]}
            onPress={handleUp}
            disabled={!parent}
            activeOpacity={0.8}
          >
            <Ionicons 
              name="arrow-up-circle-outline" 
              size={24} 
              color={parent ? colors.surface : colors.textMuted}
            />
            <Text style={[styles.reelsActionLabel, !parent && { opacity: 0.5 }]}>الأب</Text>
          </TouchableOpacity>

          {/* Children Button */}
          <TouchableOpacity
            style={[styles.reelsActionButton, children.length === 0 && styles.reelsActionButtonDisabled]}
            onPress={handleDown}
            disabled={children.length === 0}
            activeOpacity={0.8}
          >
            <Ionicons 
              name="arrow-down-circle-outline" 
              size={24} 
              color={children.length > 0 ? colors.surface : colors.textMuted}
            />
            <Text style={[styles.reelsActionLabel, children.length === 0 && { opacity: 0.5 }]}>الابن</Text>
          </TouchableOpacity>

          {/* Siblings Navigation */}
          <View style={styles.reelsSiblingsGroup}>
            <TouchableOpacity
              style={[styles.reelsActionButton, siblings.length <= 1 && styles.reelsActionButtonDisabled]}
              onPress={handlePrevSibling}
              disabled={siblings.length <= 1}
              activeOpacity={0.8}
            >
              <Ionicons 
                name="arrow-back-circle-outline" 
                size={24} 
                color={siblings.length > 1 ? colors.surface : colors.textMuted}
              />
              <Text style={[styles.reelsActionLabel, siblings.length <= 1 && { opacity: 0.5 }]} numberOfLines={1}>
                سابق
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reelsActionButton, siblings.length <= 1 && styles.reelsActionButtonDisabled]}
              onPress={handleNextSibling}
              disabled={siblings.length <= 1}
              activeOpacity={0.8}
            >
              <Ionicons 
                name="arrow-forward-circle-outline" 
                size={24} 
                color={siblings.length > 1 ? colors.surface : colors.textMuted}
              />
              <Text style={[styles.reelsActionLabel, siblings.length <= 1 && { opacity: 0.5 }]} numberOfLines={1}>
                تالي
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>

      {/* Details Modal */}
      {showDetails && (
        <View style={styles.reelsDetailsPanel}>
          <View style={styles.reelsDetailHeader}>
            <TouchableOpacity
              onPress={() => setShowDetails(false)}
              style={styles.reelsDetailCloseButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={colors.surface} />
            </TouchableOpacity>
            <Text style={styles.reelsDetailTitle}>معلومات العضو</Text>
            <View style={{ width: 30 }} />
          </View>

          <ScrollView
            style={styles.reelsDetailScroll}
            contentContainerStyle={styles.reelsDetailContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* Profile Info */}
            <View style={styles.reelsDetailSection}>
              <Text style={styles.reelsDetailLabel}>الاسم الكامل</Text>
              <Text style={styles.reelsDetailValue}>{getFullName(currentPerson)}</Text>
            </View>

            {currentPerson.birthYear && (
              <View style={styles.reelsDetailSection}>
                <Text style={styles.reelsDetailLabel}>سنة الميلاد</Text>
                <Text style={styles.reelsDetailValue}>{currentPerson.birthYear}</Text>
              </View>
            )}

            {currentPerson.bio && (
              <View style={styles.reelsDetailSection}>
                <Text style={styles.reelsDetailLabel}>النبذة</Text>
                <Text style={styles.reelsDetailValue}>{currentPerson.bio}</Text>
              </View>
            )}

            {currentPerson.branchId && (
              <View style={styles.reelsDetailSection}>
                <Text style={styles.reelsDetailLabel}>الفرع</Text>
                <Text style={styles.reelsDetailValue}>{branchLabel}</Text>
              </View>
            )}

            {/* Relations */}
            <View style={[styles.reelsDetailSection, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }]}>
              <Text style={styles.reelsDetailLabel}>العلاقات العائلية</Text>
            </View>

            {parent && (
              <TouchableOpacity
                style={styles.reelsDetailRelation}
                onPress={() => {
                  setCurrentPersonId(getPersonId(parent));
                  setShowDetails(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.reelsDetailRelationLabel}>الأب/الأم</Text>
                <Text style={styles.reelsDetailRelationValue}>{getFullName(parent)}</Text>
              </TouchableOpacity>
            )}

            {children.length > 0 && (
              <View style={styles.reelsDetailRelations}>
                <Text style={styles.reelsDetailRelationLabel}>الأبناء ({children.length})</Text>
                {children.slice(0, 5).map((child) => (
                  <TouchableOpacity
                    key={getPersonId(child)}
                    style={styles.reelsDetailRelation}
                    onPress={() => {
                      setCurrentPersonId(getPersonId(child));
                      setShowDetails(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reelsDetailRelationValue}>{getFullName(child)}</Text>
                  </TouchableOpacity>
                ))}
                {children.length > 5 && (
                  <Text style={[styles.reelsDetailRelationLabel, { textAlign: 'center', marginTop: 8 }]}>
                    و {children.length - 5} آخرين
                  </Text>
                )}
              </View>
            )}

            {siblings.length > 1 && (
              <View style={styles.reelsDetailRelations}>
                <Text style={styles.reelsDetailRelationLabel}>الإخوة ({siblings.length})</Text>
                {siblings.slice(0, 5).map((sibling) => (
                  <TouchableOpacity
                    key={getPersonId(sibling)}
                    style={[
                      styles.reelsDetailRelation,
                      getPersonId(sibling) === getPersonId(currentPerson) && styles.reelsDetailRelationActive
                    ]}
                    onPress={() => {
                      if (getPersonId(sibling) !== getPersonId(currentPerson)) {
                        setCurrentPersonId(getPersonId(sibling));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text 
                      style={[
                        styles.reelsDetailRelationValue,
                        getPersonId(sibling) === getPersonId(currentPerson) && { color: colors.secondary }
                      ]}
                    >
                      {getFullName(sibling)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {siblings.length > 5 && (
                  <Text style={[styles.reelsDetailRelationLabel, { textAlign: 'center', marginTop: 8 }]}>
                    و {siblings.length - 5} آخرين
                  </Text>
                )}
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  brandWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  brandTextWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  brandTitle: {
    ...typography.headlineMd,
    color: colors.text,
    //add 'reem kufi' font family
      fontFamily: 'Reem Kufi',
  },
  brandSubtitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    fontSize: 11,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: rounded.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggle: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row-reverse',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.surface,
  },
  toggleText: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.primary,
  },
  searchSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchIcon: {
    marginLeft: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.text,
  },
  searchMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchMetaText: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  searchMetaTag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  searchMetaTagText: {
    ...typography.labelMd,
    color: colors.text,
    fontSize: 12,
  },
  noticeCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typography.labelMd,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  filterRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.labelMd,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  searchResults: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    maxHeight: 240,
  },
  searchResultsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  searchResultsTitle: {
    ...typography.labelMd,
    color: colors.text,
  },
  searchResultsCount: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  searchResultsScroll: {
    maxHeight: 180,
  },
  searchResultsList: {
    gap: spacing.sm,
  },
  searchResultItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchResultInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  searchResultName: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600',
  },
  searchResultMeta: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  searchMatchRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  searchMatchPill: {
    ...typography.labelMd,
    fontSize: 10,
    color: colors.secondary,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  searchResultsNote: {
    ...typography.labelMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  treeScene: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
    overflow: 'hidden',
  },
  treeFogOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  treeControls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
    alignItems: 'center',
  },
  treeControlsContainer: {
    maxHeight: 48,
  },
  controlChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  controlChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  controlChipText: {
    ...typography.labelMd,
    color: colors.text,
    fontSize: 11,
  },
  controlChipTextActive: {
    color: colors.surface,
  },
  controlChipDisabled: {
    opacity: 0.5,
  },
  controlChipTextDisabled: {
    color: colors.textMuted,
  },
  treeCanvas: {
    flex: 1,
    padding: spacing.lg,
    zIndex: 2,
    paddingBottom: spacing.sm,
  },
  treeViewport: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    overflow: 'hidden',
  },
  treeWorld: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  generationRail: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    zIndex: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  generationRailScroll: {
    flexGrow: 0,
  },
  generationRailContent: {
    gap: 6,
    alignItems: 'center',
  },
  generationButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generationButtonActive: {
    backgroundColor: colors.primary,
  },
  generationButtonText: {
    ...typography.labelMd,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  generationButtonTextActive: {
    color: colors.surface,
  },
  fogBlob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  fogBlobTopLeft: {
    width: 240,
    height: 240,
    top: -70,
    left: -60,
    opacity: 0.75,
  },
  fogBlobTopRight: {
    width: 180,
    height: 180,
    top: 40,
    right: -40,
    opacity: 0.55,
  },
  fogBlobBottomCenter: {
    width: 280,
    height: 220,
    bottom: -90,
    left: '50%',
    marginLeft: -140,
    opacity: 0.65,
  },
  fogTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
    backgroundColor: 'rgba(248, 246, 242, 0.52)',
  },
  fogBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    backgroundColor: 'rgba(248, 246, 242, 0.42)',
  },
  lineVertical: {
    position: 'absolute',
    width: LINE_WIDTH,
    backgroundColor: colors.secondary,
    opacity: 0.55,
  },
  lineHorizontal: {
    position: 'absolute',
    height: LINE_WIDTH,
    backgroundColor: colors.secondary,
    opacity: 0.55,
  },
  nodeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  nodeCardSelected: {
    borderColor: colors.secondary,
    borderWidth: 2,
  },
  nodeBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  nodeBadgeText: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 11,
  },
  nodeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeName: {
    ...typography.bodyMd,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  nodeDates: {
    ...typography.labelMd,
    color: colors.secondary,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.bodyLg,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10000,
    elevation: 32,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    maxHeight: DETAILS_HEIGHT,
  },
  detailSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: rounded.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  sheetTitleBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  sheetName: {
    ...typography.headlineMd,
    color: colors.text,
  },
  sheetDates: {
    ...typography.labelMd,
    color: colors.secondary,
    marginTop: 2,
  },
  sheetAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetBio: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'right',
    marginVertical: spacing.md,
  },
  sheetStatsRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetStatItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetStatValue: {
    ...typography.headlineMd,
    color: colors.primary,
    fontWeight: '700',
  },
  sheetStatLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 11,
  },
  sheetActions: {
    gap: spacing.sm,
    pointerEvents: 'auto',
  },
  sheetPrimaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sheetPrimaryText: {
    ...typography.bodyMd,
    color: colors.surface,
    fontWeight: '600',
  },
  sheetActionRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  sheetSecondaryButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sheetSecondaryText: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600',
  },
  sheetDangerButton: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  sheetDangerText: {
    color: colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.headlineMd,
    color: colors.text,
    textAlign: 'right',
  },
  modalSubtitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: rounded.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  tenantPickerCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tenantPickerTextBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tenantPickerLabel: {
    ...typography.labelMd,
    color: colors.primary,
    marginBottom: 2,
  },
  tenantPickerTitle: {
    ...typography.headlineMd,
    color: colors.text,
  },
  tenantPickerSubtitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  tenantPickerButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginLeft: spacing.sm,
  },
  tenantPickerButtonText: {
    ...typography.labelMd,
    color: colors.surface,
    fontWeight: '700',
  },
  tenantPickerModal: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tenantPickerList: {
    maxHeight: '100%',
  },
  tenantPickerListContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tenantPickerOption: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tenantPickerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  tenantPickerOptionTitle: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600',
  },
  tenantPickerOptionTitleSelected: {
    color: colors.primary,
  },
  tenantPickerOptionSub: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  tenantPickerEmpty: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantPickerEmptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  formField: {
    flex: 1,
    gap: 6,
  },
  imagePickerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imagePreviewWrap: {
    width: 72,
    height: 72,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageUploadButton: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.secondary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  imageUploadButtonText: {
    color: colors.surface,
    fontWeight: '700',
  },
  formLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    textAlign: 'right',
  },
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    ...typography.bodyMd,
  },
  formTextArea: {
    minHeight: 96,
  },
  formError: {
    ...typography.labelMd,
    color: colors.error,
    textAlign: 'right',
  },
  formPrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formButtonDisabled: {
    opacity: 0.65,
  },
  formPrimaryButtonText: {
    ...typography.bodyMd,
    color: colors.surface,
    fontWeight: '700',
  },
  reelsContainer: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  reelsBackground: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'flex-start',
    backgroundColor: '#000000',
  },
  reelsImage: {
    backgroundColor: '#000000',
  },
  reelsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  reelsTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reelsBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  reelsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    zIndex: 2,
  },
  reelsTrailChip: {
    flexShrink: 1,
    maxWidth: '62%',
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  reelsTrailRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reelsTrailText: {
    ...typography.labelMd,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    lineHeight: 15,
    maxWidth: 70,
  },
  reelsTrailTextActive: {
    color: '#f7c45f',
    fontWeight: '700',
  },
  reelsTrailDivider: {
    ...typography.labelMd,
    color: 'rgba(255,255,255,0.32)',
    fontSize: 12,
    lineHeight: 15,
  },
  reelsMetaGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  reelsBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  reelsBadgeText: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 12,
  },
  reelsCounterChip: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  reelsGenerationBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(119,90,25,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(119,90,25,0.45)',
  },
  reelsGenerationBadgeText: {
    ...typography.labelMd,
    color: '#f7c45f',
    fontSize: 11,
    fontWeight: '700',
  },
  reelsCounterText: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 12,
  },
  reelsVerticalControls: {
    position: 'absolute',
    right: spacing.md,
    top: '38%',
    gap: spacing.sm,
    zIndex: 3,
  },
  reelsHorizontalControls: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  reelsActionHint: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reelsActionHintText: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 10,
  },
  reelsArrowPill: {
    minWidth: 126,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  reelsArrowButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  reelsArrowLabel: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 10,
  },
  reelsDirections: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  reelsDirectionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  reelsControl: {
    alignItems: 'center',
    gap: spacing.xs,
    opacity: 0.95,
  },
  reelsControlDisabled: {
    opacity: 0.35,
  },
  reelsControlLabel: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 12,
  },
  reelsInfo: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 128,
    zIndex: 2,
    alignItems: 'flex-end',
  },
  reelsHint: {
    ...typography.labelMd,
    color: '#e9dcc9',
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  reelsStatsRow: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  reelsBadgeRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  reelsBirthBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(119,90,25,0.9)',
  },
  reelsBirthBadgeText: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  reelsSiblingBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  reelsBranchBadge: {
    maxWidth: 120,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  reelsSiblingBadgeText: {
    ...typography.labelMd,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
  },
  reelsProgressRail: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 108,
    height: 4,
    flexDirection: 'row',
    gap: 3,
    zIndex: 2,
  },
  reelsProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.secondary,
  },
  reelsProgressSegment: {
    flex: 1,
    height: '100%',
    minWidth: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  reelsProgressSegmentPast: {
    backgroundColor: 'rgba(119,90,25,0.62)',
  },
  reelsProgressSegmentActive: {
    backgroundColor: colors.secondary,
  },
  reelsStatChip: {
    minWidth: 82,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  reelsStatValue: {
    ...typography.labelMd,
    color: colors.surface,
    fontWeight: '700',
    fontSize: 12,
  },
  reelsStatLabel: {
    ...typography.labelMd,
    color: '#e5d8c3',
    fontSize: 10,
    marginTop: 1,
  },
  reelsName: {
    ...typography.headlineLg,
    color: colors.surface,
    textAlign: 'right',
  },
  reelsDates: {
    ...typography.labelMd,
    color: '#e5d8c3',
    marginVertical: spacing.xs,
    textAlign: 'right',
  },
  reelsBio: {
    ...typography.bodyMd,
    color: colors.surface,
    textAlign: 'right',
  },
  reelsEmpty: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelsEmptyText: {
    ...typography.bodyLg,
    color: colors.surface,
  },
  // New TikTok-style bottom actions
  reelsBottomActions: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    left: spacing.md,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 28,
    zIndex: 3,
  },
  reelsActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 46,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  reelsActionButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  reelsActionButtonDisabled: {
    opacity: 0.4,
  },
  reelsActionLabel: {
    ...typography.labelMd,
    color: colors.surface,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: 40,
  },
  reelsSiblingsGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // Details panel styles
  reelsDetailsPanel: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 50,
  },
  reelsDetailHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reelsDetailCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  reelsDetailTitle: {
    ...typography.headlineMd,
    color: colors.surface,
    flex: 1,
    textAlign: 'center',
  },
  reelsDetailScroll: {
    flex: 1,
  },
  reelsDetailContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
  },
  reelsDetailSection: {
    marginBottom: spacing.lg,
  },
  reelsDetailLabel: {
    ...typography.labelMd,
    color: '#b8a89a',
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  reelsDetailValue: {
    ...typography.bodyMd,
    color: colors.surface,
    textAlign: 'right',
  },
  reelsDetailRelations: {
    marginBottom: spacing.lg,
  },
  reelsDetailRelation: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: spacing.sm,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reelsDetailRelationLabel: {
    ...typography.labelMd,
    color: '#b8a89a',
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  reelsDetailRelationValue: {
    ...typography.bodyMd,
    color: colors.surface,
  },
  reelsDetailRelationActive: {
    backgroundColor: 'rgba(255,183,3,0.15)',
    borderColor: colors.secondary,
  },
  sheetRelationsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetRelationsTitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  relationItem: {
    marginBottom: spacing.md,
  },
  relationLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: 'right',
  },
  relationValue: {
    ...typography.bodyMd,
    color: colors.text,
    textAlign: 'right',
  },
  relationList: {
    marginTop: spacing.xs,
  },
  relationPill: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  relationPillText: {
    ...typography.labelMd,
    color: colors.text,
    fontSize: 12,
  },
  galleryContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  galleryImageContainer: {
    alignItems: 'center',
  },
  galleryImage: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  galleryCaption: {
    ...typography.labelMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  galleryEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  galleryEmptyText: {
    ...typography.bodyMd,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  galleryEmptySubtext: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
