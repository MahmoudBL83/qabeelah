import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationsListScreen from '../screens/ConversationsListScreen';
import ChatThreadScreen from '../screens/ChatThreadScreen';

const Stack = createNativeStackNavigator();

export default function MessagesStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="ConversationsList">
      <Stack.Screen name="ConversationsList" component={ConversationsListScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
    </Stack.Navigator>
  );
}
