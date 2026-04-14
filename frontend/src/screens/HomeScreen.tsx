import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme';
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
});
