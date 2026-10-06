import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { colors, spacing, typography } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import { formatDateWithHijri } from '../lib/date';

interface Tenant {
  _id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  isActive: boolean;
  createdAt: string;
}

interface JoinRequest {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  relationship?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function TenantDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { tenantId } = (route.params || {}) as { tenantId?: string };

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    if (!tenantId) {
      setError('معرّف العائلة مفقود');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [tenantData, requestsData] = await Promise.all([
          apiClient.getTenant(tenantId),
          apiClient.getAllJoinRequests(tenantId)
        ]);
        setTenant(tenantData);
        setJoinRequests(requestsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل تحميل التفاصيل');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  const handleApprove = async (requestId: string) => {
    if (!tenantId) return;
    try {
      setActionLoading(requestId);
      await apiClient.approveJoinRequest(tenantId, requestId);
      setJoinRequests(reqs => reqs.map(r => r._id === requestId ? { ...r, status: 'approved' } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الموافقة على الطلب');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!tenantId) return;
    try {
      setActionLoading(requestId);
      await apiClient.rejectJoinRequest(tenantId, requestId);
      setJoinRequests(reqs => reqs.map(r => r._id === requestId ? { ...r, status: 'rejected' } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفض الطلب');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredRequests = filterStatus === 'all' ? joinRequests : joinRequests.filter(r => r.status === filterStatus);

  const getFirstNameFromFullName = (fullName?: string) => {
    const trimmed = (fullName || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : '—';
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!tenant) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="تفاصيل العائلة" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <Text style={{ color: colors.error, ...typography.bodyMd }}>لم تُعثر على العائلة</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tenant.name} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        {error ? (
          <View style={{
            backgroundColor: colors.error,
            padding: spacing.md,
            borderRadius: 8,
            marginBottom: spacing.lg
          }}>
            <Text style={{ color: '#fff', ...typography.bodyMd }}>{error}</Text>
          </View>
        ) : null}

        {/* Tenant Info */}
        <View style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: spacing.lg,
          marginBottom: spacing.lg
        }}>
          <Text style={{ ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.xs }}>الرمز</Text>
          <Text style={{ ...typography.bodyMd, color: colors.text, marginBottom: spacing.md }}>{tenant.subdomain}</Text>

          {tenant.customDomain && (
            <>
              <Text style={{ ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.xs }}>النطاق المخصص</Text>
              <Text style={{ ...typography.bodyMd, color: colors.text, marginBottom: spacing.md }}>{tenant.customDomain}</Text>
            </>
          )}

          <Text style={{ ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.xs }}>الحالة</Text>
          <Text style={{
            ...typography.bodyMd,
            color: tenant.isActive ? '#22c55e' : colors.textMuted,
            marginBottom: spacing.md
          }}>
            {tenant.isActive ? 'نشطة' : 'معطلة'}
          </Text>

          <Text style={{ ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.xs }}>تاريخ الإنشاء</Text>
          <Text style={{ ...typography.bodyMd, color: colors.text }}>
            {formatDateWithHijri(tenant.createdAt).combined}
          </Text>
        </View>

        {/* Join Requests */}
        <Text style={{ ...typography.headlineMd, color: colors.text, marginBottom: spacing.md }}>طلبات الانضمام</Text>

        {/* Filter buttons */}
        <View style={{
          flexDirection: 'row',
          marginBottom: spacing.lg,
          gap: spacing.sm,
          flexWrap: 'wrap'
        }}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: 20,
                backgroundColor: filterStatus === status ? colors.secondary : colors.surfaceAlt,
              }}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={{
                color: filterStatus === status ? '#fff' : colors.textMuted,
                ...typography.labelMd,
                fontSize: 12
              }}>
                {status === 'all' ? 'الكل' : status === 'pending' ? 'قيد الانتظار' : status === 'approved' ? 'موافق عليها' : 'مرفوضة'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredRequests.length === 0 ? (
          <View style={{
            backgroundColor: colors.surfaceAlt,
            padding: spacing.lg,
            borderRadius: 12,
            alignItems: 'center'
          }}>
            <Text style={{ color: colors.textMuted, ...typography.bodyMd }}>لا توجد طلبات</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredRequests.map((request) => (
              <View
                key={request._id}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: spacing.md,
                  gap: spacing.sm
                }}
              >
                <Text style={{ ...typography.bodyMd, color: colors.text, fontWeight: '600' }}>
                  {getFirstNameFromFullName(request.fullName)}
                </Text>
                <Text style={{ ...typography.labelMd, color: colors.textMuted }}>
                  {request.email}
                </Text>
                <Text style={{ ...typography.labelMd, color: colors.textMuted }}>
                  {request.phone}
                </Text>

                {/* Status badge */}
                <View style={{ marginVertical: spacing.sm }}>
                  <Text style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: request.status === 'pending'
                      ? 'rgba(234, 179, 8, 0.2)'
                      : request.status === 'approved'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                    color: request.status === 'pending'
                      ? '#ca8a04'
                      : request.status === 'approved'
                      ? '#22c55e'
                      : '#ef4444',
                    ...typography.labelMd,
                    fontSize: 11,
                    alignSelf: 'flex-start'
                  }}>
                    {request.status === 'pending' ? 'قيد الانتظار' : request.status === 'approved' ? 'موافق عليه' : 'مرفوض'}
                  </Text>
                </View>

                {/* Action buttons */}
                {request.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#22c55e',
                        paddingVertical: spacing.md,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => handleApprove(request._id)}
                      disabled={actionLoading === request._id}
                    >
                      <Text style={{ color: '#fff', ...typography.labelMd }}>
                        {actionLoading === request._id ? 'جاري...' : 'موافقة'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: colors.error,
                        paddingVertical: spacing.md,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => handleReject(request._id)}
                      disabled={actionLoading === request._id}
                    >
                      <Text style={{ color: '#fff', ...typography.labelMd }}>رفض</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, ...typography.labelMd, fontSize: 11, marginTop: spacing.sm }}>
                    تم المراجعة
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
