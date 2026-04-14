import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const screen = {
  width,
  height,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

// Content card sizes
export const cardSize = {
  poster: {
    width: width * 0.28,
    height: width * 0.28 * 1.5,
  },
  backdrop: {
    width: width * 0.7,
    height: width * 0.7 * 0.56,
  },
  hero: {
    width: width,
    height: height * 0.55,
  },
};
