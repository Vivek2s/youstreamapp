import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { Content } from '../types';
import ContentCard from './ContentCard';

interface Props {
  title: string;
  contents: Content[];
  onItemPress: (item: Content) => void;
}

export default function ContentRow({ title, contents, onItemPress }: Props) {
  if (!contents || contents.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={contents}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ContentCard item={item} onPress={onItemPress} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginLeft: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
});
