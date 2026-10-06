import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, FlatList } from 'react-native';
import { apiClient } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';

interface ModerationItem {
  type: string;
  id: string;
  tenantId: string;
  tenantName: string;
  userId?: string;
  userName?: string;
  status: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  data: Record<string, any>;
}

export default function ModerationScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  useEffect(() => {
    fetchQueue();
  }, [filterType, filterPriority]);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const result = await apiClient.getModerationQueue({
        type: filterType as any,
        priority: filterPriority as any,
        page: 1,
        limit: 50,
      });
      setItems(result.data || []);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (item: ModerationItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const handleAction = async (action: 'approve' | 'reject' | 'hold') => {
    if (!selectedItem) return;

    try {
      setActionInProgress(true);
      await apiClient.processModerationAction(selectedItem.id, {
        itemType: selectedItem.type,
        action,
        notes: actionNotes,
        tenantId: selectedItem.tenantId,
      });

      // Refresh queue
      setModalVisible(false);
      setSelectedItem(null);
      setActionNotes('');
      await fetchQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return theme.colors.error;
      case 'medium':
        return theme.colors.warning;
      case 'low':
        return theme.colors.info;
      default:
        return theme.colors.surface;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      lineage_verification: 'تحقق النسب',
      join_request: 'طلب الانضمام',
      flagged_user: 'مستخدم مشبوه',
      flagged_activity: 'نشاط مشبوه',
    };
    return labels[type] || type;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ backgroundColor: theme.colors.primary, paddingVertical: 16, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.colors.onPrimary, marginBottom: 8 }}>
          قائمة المراجعة
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.onPrimary, opacity: 0.8 }}>
          {items.length} عنصر بانتظار المراجعة
        </Text>
      </View>

      {/* Filters */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.background }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: filterType === '' ? theme.colors.primary : theme.colors.outline,
              backgroundColor: filterType === '' ? theme.colors.primary : 'transparent',
              marginRight: 8,
            }}
            onPress={() => setFilterType('')}
          >
            <Text
              style={{
                color: filterType === '' ? theme.colors.onPrimary : theme.colors.onBackground,
                fontWeight: '500',
              }}
            >
              الكل
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: filterPriority === 'high' ? theme.colors.error : theme.colors.outline,
              backgroundColor: filterPriority === 'high' ? theme.colors.error : 'transparent',
              marginRight: 8,
            }}
            onPress={() => setFilterPriority(filterPriority === 'high' ? '' : 'high')}
          >
            <Text
              style={{
                color: filterPriority === 'high' ? theme.colors.onError : theme.colors.onBackground,
                fontWeight: '500',
              }}
            >
              عاجل
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: filterPriority === 'medium' ? theme.colors.warning : theme.colors.outline,
              backgroundColor: filterPriority === 'medium' ? theme.colors.warning : 'transparent',
            }}
            onPress={() => setFilterPriority(filterPriority === 'medium' ? '' : 'medium')}
          >
            <Text
              style={{
                color: filterPriority === 'medium' ? theme.colors.onBackground : theme.colors.onBackground,
                fontWeight: '500',
              }}
            >
              متوسط
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Error */}
      {error && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            padding: 12,
            backgroundColor: theme.colors.errorContainer,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: theme.colors.error, fontWeight: '500' }}>{error}</Text>
        </View>
      )}

      {/* Items List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12, color: theme.colors.onBackground }}>جاري تحميل البيانات...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16, color: theme.colors.onBackground, opacity: 0.6 }}>
            لا توجد عناصر بانتظار المراجعة
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                marginHorizontal: 16,
                marginVertical: 8,
                padding: 12,
                backgroundColor: theme.colors.surfaceVariant,
                borderRadius: 12,
                borderLeftWidth: 4,
                borderLeftColor: getPriorityColor(item.priority),
              }}
              onPress={() => handleSelectItem(item)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.onBackground }}>
                    {getTypeLabel(item.type)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.7, marginTop: 4 }}>
                    {item.tenantName}
                  </Text>
                  {item.userName && (
                    <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.7, marginTop: 2 }}>
                      المستخدم: {item.userName}
                    </Text>
                  )}
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    backgroundColor: getPriorityColor(item.priority),
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.onPrimary }}>
                    {item.priority.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          scrollEnabled={true}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 20,
              maxHeight: '80%',
            }}
          >
            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.onBackground }}>
                    {getTypeLabel(selectedItem.type)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.6, marginTop: 4 }}>
                    {selectedItem.tenantName}
                  </Text>
                </View>

                {/* Details */}
                <View style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  {selectedItem.userName && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.7 }}>
                        المستخدم
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.onBackground, marginTop: 4 }}>
                        {selectedItem.userName}
                      </Text>
                    </View>
                  )}

                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.7 }}>
                      الأولوية
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: getPriorityColor(selectedItem.priority),
                        marginTop: 4,
                      }}
                    >
                      {selectedItem.priority.toUpperCase()}
                    </Text>
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, color: theme.colors.onBackground, opacity: 0.7 }}>
                      تاريخ الإرسال
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.onBackground, marginTop: 4 }}>
                      {new Date(selectedItem.createdAt).toLocaleString('ar-SA')}
                    </Text>
                  </View>
                </View>

                {/* Notes Input */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.onBackground, marginBottom: 8 }}>
                    ملاحظات (اختياري)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      borderRadius: 8,
                      padding: 12,
                      color: theme.colors.onBackground,
                      borderWidth: 1,
                      borderColor: theme.colors.outline,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                    placeholder="أضف ملاحظات..."
                    placeholderTextColor={theme.colors.onBackground}
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    multiline
                  />
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.primary,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => handleAction('approve')}
                    disabled={actionInProgress}
                  >
                    <Text style={{ color: theme.colors.onPrimary, fontWeight: '600' }}>
                      {actionInProgress ? 'جاري...' : 'موافقة'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.warning,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => handleAction('hold')}
                    disabled={actionInProgress}
                  >
                    <Text style={{ color: theme.colors.onBackground, fontWeight: '600' }}>
                      إيقاف مؤقت
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.error,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => handleAction('reject')}
                    disabled={actionInProgress}
                  >
                    <Text style={{ color: theme.colors.onError, fontWeight: '600' }}>
                      رفض
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                  style={{
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginTop: 12,
                    backgroundColor: theme.colors.surfaceVariant,
                  }}
                  onPress={() => setModalVisible(false)}
                  disabled={actionInProgress}
                >
                  <Text style={{ color: theme.colors.onBackground, fontWeight: '600' }}>
                    إغلاق
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
