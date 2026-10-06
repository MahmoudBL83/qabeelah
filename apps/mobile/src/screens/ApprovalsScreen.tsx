import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, typography, rounded } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { UserRole } from '@qabila/types';

type JoinRequest = {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  relationship?: string;
  notes?: string;
  documents?: string[];
  status?: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

type LineageRequest = {
  _id: string;
  userId?: {
    _id?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | string;
  documents?: string[];
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  notes?: string;
  createdAt: string;
};

const getLineageStatusLabel = (status: LineageRequest['status']) => {
  switch (status) {
    case 'verified':
      return 'موثق';
    case 'pending':
      return 'قيد المراجعة';
    case 'rejected':
      return 'مرفوض';
    case 'unverified':
    default:
      return 'غير موثق';
  }
};

const getLineageBadgeStyle = (status: LineageRequest['status']) => {
  switch (status) {
    case 'verified':
      return styles.lineageBadgeVerified;
    case 'pending':
      return styles.lineageBadgePending;
    case 'rejected':
      return styles.lineageBadgeRejected;
    case 'unverified':
    default:
      return styles.lineageBadgeUnverified;
  }
};

const getFirstNameFromFullName = (fullName?: string) => {
  const trimmed = (fullName || '').trim();
  return trimmed ? trimmed.split(/\s+/)[0] : '—';
};

export default function ApprovalsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [lineageRequests, setLineageRequests] = useState<LineageRequest[]>([]);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageActionId, setLineageActionId] = useState('');
  const [selectedLineageId, setSelectedLineageId] = useState<string | null>(null);
  const [lineageNotes, setLineageNotes] = useState('');
  const lineageRequestIdFromRoute = route.params?.lineageRequestId as string | undefined;
  const canReviewRequests = user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUB_ADMIN;

  useEffect(() => {
    if (!canReviewRequests) {
      setLoading(false);
      return;
    }
    fetchRequests();
  }, [canReviewRequests]);

  useEffect(() => {
    if (!lineageRequestIdFromRoute || lineageRequests.length === 0) return;
    const match = lineageRequests.find((request) => request._id === lineageRequestIdFromRoute);
    if (match) {
      setSelectedLineageId(match._id);
      setLineageNotes(match.notes || '');
    }
  }, [lineageRequestIdFromRoute, lineageRequests]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const seedResult = await apiClient.seedDatabase();
      if (!seedResult?.tenantId) {
        throw new Error('Missing tenantId');
      }
      setTenantId(seedResult.tenantId);
      const data = await apiClient.getPendingJoinRequests(seedResult.tenantId, 20);
      setRequests(data);
      setLineageLoading(true);
      const lineageData = await apiClient.getPendingLineageRequests(seedResult.tenantId).catch(() => []);
      setLineageRequests(lineageData);
      const initialSelectedLineage = lineageRequestIdFromRoute
        ? lineageData.find((request: LineageRequest) => request._id === lineageRequestIdFromRoute) ?? lineageData[0]
        : lineageData[0];
      setSelectedLineageId(initialSelectedLineage?._id ?? null);
      setLineageNotes(initialSelectedLineage?.notes || '');
    } catch (err: any) {
      setError('تعذر تحميل طلبات الانضمام.');
    } finally {
      setLoading(false);
      setLineageLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      const status = action === 'APPROVED' ? 'approved' : 'rejected';
      await apiClient.updateJoinRequestStatus(id, status, tenantId);
      setRequests((prev) => prev.filter((r) => r._id !== id));
      if (selectedRequest?._id === id) {
        setDetailsVisible(false);
        setSelectedRequest(null);
      }
      const actionText = status === 'approved' ? 'تم اعتماد الطلب بنجاح' : 'تم رفض الطلب';
      Alert.alert('نجح', actionText);
    } catch (err) {
      console.error(err);
      Alert.alert('خطأ', 'فشل في معالجة الطلب. حاول مرة أخرى.');
    }
  };

  const handleLineageAction = async (id: string, status: 'pending' | 'verified' | 'rejected') => {
    try {
      setLineageActionId(id);
      await apiClient.updateLineageRequestStatus(tenantId, id, status, lineageNotes);
      setLineageRequests((prev) => prev.filter((item) => item._id !== id));
      Alert.alert('نجح', status === 'verified' ? 'تم اعتماد التحقق من النسب' : status === 'rejected' ? 'تم رفض التحقق من النسب' : 'تمت إعادة الطلب للمراجعة');
    } catch (err) {
      console.error(err);
      Alert.alert('خطأ', 'فشل تحديث حالة التحقق من النسب.');
    } finally {
      setLineageActionId('');
    }
  };

  const openRequestDetails = async (requestId: string) => {
    if (!tenantId) return;

    setDetailsVisible(true);
    setDetailsError('');
    setDetailsLoading(true);

    try {
      const request = await apiClient.getJoinRequest(tenantId, requestId);
      setSelectedRequest(request);
    } catch (err) {
      setSelectedRequest(requests.find((request) => request._id === requestId) || null);
      setDetailsError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الطلب.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const renderItem = ({ item }: { item: JoinRequest }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Image
          
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.fullName ? getFirstNameFromFullName(item.fullName) : 'الاسم غير متوفر'}</Text>
          <Text style={styles.userBranch}>{item.relationship || 'ابنة الأخ'} - فرع الرياض</Text>
          <TouchableOpacity onPress={() => openRequestDetails(item._id)}>
            <Text style={styles.detailsLink}>عرض التفاصيل الكاملة</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAction(item._id, 'APPROVED')}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.surface} style={styles.iconSpaced} />
          <Text style={styles.acceptButtonText}>قبول العضو</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleAction(item._id, 'REJECTED')}
        >
          <Ionicons name="close-circle-outline" size={20} color={colors.text} style={styles.iconSpaced} />
          <Text style={styles.rejectButtonText}>رفض</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!canReviewRequests) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.unauthorizedWrap}>
          <Text style={styles.unauthorizedTitle}>غير مصرح</Text>
          <Text style={styles.unauthorizedText}>طلبات الانضمام متاحة فقط لمدير العائلة أو مدير الفرع.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>طلبات الانضمام</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{requests.length} طلب معلق</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.filterButton}>
          <Ionicons name="filter" size={20} color={colors.text} />
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <Text style={styles.searchText}>البحث عن عضو...</Text>
        </View>
      </View>

      <View style={styles.lineageSection}>
        <View style={styles.lineageSectionHeader}>
          <Text style={styles.lineageTitle}>طلبات التحقق من النسب</Text>
          <Text style={styles.lineageCount}>{lineageLoading ? '...' : lineageRequests.length} طلب</Text>
        </View>

        {lineageRequests.length === 0 ? (
          <Text style={styles.emptyLineage}>لا توجد طلبات تحقق حالياً</Text>
        ) : (
          lineageRequests.slice(0, 3).map((item) => {
            const requester = typeof item.userId === 'string' ? null : item.userId;
            const isSelected = selectedLineageId === item._id;
            return (
              <View key={item._id} style={styles.lineageCard}>
                <View style={styles.lineageCardHeader}>
                  <View style={styles.lineageMeta}>
                    <Text style={styles.lineageName}>{requester?.name || requester?.email || 'مستخدم غير متوفر'}</Text>
                    <Text style={styles.lineageSub}>{item.documents?.length || 0} مرفقات</Text>
                  </View>
                  <Text style={[styles.lineageBadge, getLineageBadgeStyle(item.status)]}>{getLineageStatusLabel(item.status)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.lineagePreviewButton, isSelected && styles.lineagePreviewButtonActive]}
                  onPress={() => {
                    setSelectedLineageId(item._id);
                    setLineageNotes(item.notes || '');
                  }}
                >
                  <Text style={styles.lineagePreviewButtonText}>{isSelected ? 'محدد للمراجعة' : 'فتح المراجعة'}</Text>
                </TouchableOpacity>

                {isSelected ? (
                  <View style={styles.lineageReviewPanel}>
                    {item.documents?.length ? (
                      <View style={styles.lineageDocs}>
                        {item.documents.map((docUrl, index) => (
                          <TouchableOpacity key={`${docUrl}-${index}`} onPress={() => {}}>
                            <Text style={styles.lineageDocLink}>مستند النسب #{index + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    <TextInput
                      value={lineageNotes}
                      onChangeText={setLineageNotes}
                      placeholder="ملاحظات المراجعة"
                      multiline
                      style={styles.lineageNotesInput}
                      textAlignVertical="top"
                    />

                    <View style={styles.lineageButtons}>
                      <TouchableOpacity
                        style={[styles.lineageButton, styles.lineageButtonNeutral]}
                        onPress={() => handleLineageAction(item._id, 'pending')}
                        disabled={lineageActionId === item._id}
                      >
                        <Text style={styles.lineageButtonTextNeutral}>{lineageActionId === item._id ? '...' : 'إعادة'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.lineageButton, styles.lineageButtonPrimary]}
                        onPress={() => handleLineageAction(item._id, 'verified')}
                        disabled={lineageActionId === item._id}
                      >
                        <Text style={styles.lineageButtonTextPrimary}>{lineageActionId === item._id ? '...' : 'اعتماد'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.lineageButton, styles.lineageButtonDanger]}
                        onPress={() => handleLineageAction(item._id, 'rejected')}
                        disabled={lineageActionId === item._id}
                      >
                        <Text style={styles.lineageButtonTextDanger}>{lineageActionId === item._id ? '...' : 'رفض'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingAvatar} />
            <View style={styles.loadingLines}>
              <View style={styles.loadingLineWide} />
              <View style={styles.loadingLineMid} />
              <View style={styles.loadingLineNarrow} />
            </View>
          </View>
          <View style={styles.loadingCard}>
            <View style={styles.loadingAvatar} />
            <View style={styles.loadingLines}>
              <View style={styles.loadingLineWide} />
              <View style={styles.loadingLineMid} />
              <View style={styles.loadingLineNarrow} />
            </View>
          </View>
          <View style={styles.loadingCard}>
            <View style={styles.loadingAvatar} />
            <View style={styles.loadingLines}>
              <View style={styles.loadingLineWide} />
              <View style={styles.loadingLineMid} />
              <View style={styles.loadingLineNarrow} />
            </View>
          </View>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات معلقة</Text>}
        />
      )}

      <Modal visible={detailsVisible} transparent animationType="fade" onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تفاصيل طلب الانضمام</Text>
              <TouchableOpacity onPress={() => setDetailsVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {detailsLoading ? (
              <View style={styles.detailsSkeleton}>
                <View style={styles.detailsSkeletonRow} />
                <View style={styles.detailsSkeletonRow} />
                <View style={styles.detailsSkeletonRow} />
                <View style={styles.detailsSkeletonRow} />
              </View>
            ) : detailsError ? (
              <Text style={styles.detailsError}>{detailsError}</Text>
            ) : selectedRequest ? (
              <ScrollView contentContainerStyle={styles.detailsBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الاسم</Text>
                  <Text style={styles.detailValue}>{getFirstNameFromFullName(selectedRequest.fullName)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>البريد</Text>
                  <Text style={styles.detailValue}>{selectedRequest.email}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الهاتف</Text>
                  <Text style={styles.detailValue}>{selectedRequest.phone}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الصلة</Text>
                  <Text style={styles.detailValue}>{selectedRequest.relationship || 'غير محدد'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الحالة</Text>
                  <Text style={styles.detailValue}>{selectedRequest.status || 'pending'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الملاحظات</Text>
                  <Text style={styles.detailValue}>{selectedRequest.notes || 'لا توجد ملاحظات إضافية.'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الوثائق</Text>
                  <Text style={styles.detailValue}>{selectedRequest.documents?.length ? `${selectedRequest.documents.length} ملفات` : 'لا توجد وثائق'}</Text>
                </View>

                <View style={styles.detailButtons}>
                  <TouchableOpacity style={styles.detailApproveButton} onPress={() => handleAction(selectedRequest._id, 'APPROVED')}>
                    <Text style={styles.detailApproveText}>قبول</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.detailRejectButton} onPress={() => handleAction(selectedRequest._id, 'REJECTED')}>
                    <Text style={styles.detailRejectText}>رفض</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.headlineLg,
    color: colors.primary,
  },
  badge: {
    backgroundColor: colors.secondaryContainer,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: rounded.md,
  },
  badgeText: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
  },
  searchContainer: {
    flexDirection: 'row-reverse',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    paddingHorizontal: spacing.sm,
    height: 48,
  },
  searchText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  lineageSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  lineageSectionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineageTitle: {
    ...typography.bodyLg,
    color: colors.primary,
    fontWeight: '700',
  },
  lineageCount: {
    ...typography.labelMd,
    color: colors.secondary,
  },
  emptyLineage: {
    ...typography.bodyMd,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
    textAlign: 'center',
    backgroundColor: colors.surface,
    borderRadius: rounded.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineageCard: {
    backgroundColor: colors.surface,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineageCardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lineageMeta: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: spacing.sm,
  },
  lineageName: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '700',
  },
  lineageSub: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  lineageBadge: {
    ...typography.labelMd,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: rounded.full,
    overflow: 'hidden',
  },
  lineageBadgePending: {
    color: colors.secondary,
    backgroundColor: colors.secondaryContainer,
  },
  lineageBadgeVerified: {
    color: colors.surface,
    backgroundColor: colors.primary,
  },
  lineageBadgeRejected: {
    color: colors.surface,
    backgroundColor: colors.error,
  },
  lineageBadgeUnverified: {
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
  },
  lineagePreviewButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  lineagePreviewButtonActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondaryContainer,
  },
  lineagePreviewButtonText: {
    ...typography.labelMd,
    color: colors.text,
  },
  lineageReviewPanel: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  lineageDocs: {
    gap: spacing.xs,
  },
  lineageDocLink: {
    ...typography.labelMd,
    color: colors.secondary,
    textAlign: 'right',
  },
  lineageNotesInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    ...typography.bodyMd,
    color: colors.text,
    textAlign: 'right',
  },
  lineageButtons: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
  },
  lineageButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: rounded.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  lineageButtonNeutral: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  lineageButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  lineageButtonDanger: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  lineageButtonTextNeutral: {
    ...typography.labelMd,
    color: colors.text,
  },
  lineageButtonTextPrimary: {
    ...typography.labelMd,
    color: colors.surface,
  },
  lineageButtonTextDanger: {
    ...typography.labelMd,
    color: colors.surface,
  },
  loadingState: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  loadingCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  loadingAvatar: {
    width: 64,
    height: 64,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceAlt,
  },
  loadingLines: {
    flex: 1,
    gap: 8,
  },
  loadingLineWide: {
    height: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    width: '85%',
  },
  loadingLineMid: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    width: '65%',
  },
  loadingLineNarrow: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    width: '45%',
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: rounded.md,
    marginLeft: spacing.md,
  },
  userInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  userName: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.primary,
  },
  userBranch: {
    ...typography.bodyMd,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailsLink: {
    ...typography.labelMd,
    color: colors.secondary,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    maxHeight: '85%'
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.bodyLg,
    fontWeight: '700',
    color: colors.text,
  },
  detailsBody: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  detailsSkeleton: {
    gap: spacing.sm,
  },
  detailsSkeletonRow: {
    height: 52,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceAlt,
  },
  detailRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: rounded.md,
    padding: spacing.sm,
    gap: 4,
  },
  detailLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.bodyMd,
    color: colors.text,
    textAlign: 'right',
  },
  detailsError: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  detailButtons: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  detailApproveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: rounded.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  detailApproveText: {
    color: colors.surface,
    fontWeight: '700',
  },
  detailRejectButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: rounded.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  detailRejectText: {
    color: colors.text,
    fontWeight: '700',
  },
  actionButtons: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.surface,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    ...typography.button,
    color: colors.text,
  },
  iconSpaced: {
    marginLeft: spacing.xs,
  },
  error: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  unauthorizedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  unauthorizedTitle: {
    ...typography.headlineMd,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  unauthorizedText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  empty: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});