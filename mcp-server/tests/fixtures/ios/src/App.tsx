import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  const save = async () => {
    await AsyncStorage.setItem('key', 'value');
  };
  return <View><Text>Hello</Text></View>;
}
