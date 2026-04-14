import React, { useEffect } from 'react';
import { ScrollView, View, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../theme';
import { useAppDispatch } from '../hooks/useAuth';
import { fetchHomeData } from '../store/contentSlice';
import { RootState } from '../store/store';
import { Content, HomeStackParamList } from '../types';
import HeroBanner from '../components/HeroBanner';
import ContentRow from '../components/ContentRow';
import LoadingSpinner from '../components/LoadingSpinner';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'HomeScreen'>;
};

export default function HomeScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { homeData, isLoadingHome } = useSelector((state: RootState) => state.content);

  useEffect(() => {
    dispatch(fetchHomeData());
  }, [dispatch]);

  const handleItemPress = (item: Content) => {
    navigation.navigate('ContentDetail', { contentId: item._id });
  };

  const handlePlay = (item: Content) => {
    navigation.navigate('Player', { contentId: item._id, title: item.title });
  };

  if (isLoadingHome && !homeData) {
    return <LoadingSpinner />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isLoadingHome}
          onRefresh={() => dispatch(fetchHomeData())}
          tintColor={colors.primary}
        />
      }
    >
      {/* Search icon */}
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => navigation.navigate('Search')}
          activeOpacity={0.7}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </Svg>
        </TouchableOpacity>
      </View>

      {homeData?.hero && (
        <HeroBanner
          content={homeData.hero}
          onPlay={() => handlePlay(homeData.hero!)}
          onInfo={() => handleItemPress(homeData.hero!)}
        />
      )}

      {homeData?.rows.map((row) => (
        <ContentRow
          key={row.category.id}
          title={row.category.name}
          contents={row.contents}
          onItemPress={handleItemPress}
        />
      ))}

      {homeData?.allContent && homeData.allContent.length > 0 && (
        <ContentRow
          title="All Content"
          contents={homeData.allContent}
          onItemPress={handleItemPress}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
