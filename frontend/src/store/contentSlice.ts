import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { contentService } from '../services/content.service';
import { Content, HomeData, ContentRow } from '../types';

interface ContentState {
  homeData: HomeData | null;
  searchResults: Content[];
  isLoadingHome: boolean;
  isSearching: boolean;
}

const initialState: ContentState = {
  homeData: null,
  searchResults: [],
  isLoadingHome: false,
  isSearching: false,
};

export const fetchHomeData = createAsyncThunk('content/fetchHome', async () => {
  return await contentService.getHomeRows();
});

export const searchContent = createAsyncThunk('content/search', async (query: string) => {
  const result = await contentService.search(query);
  return result.results;
});

const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    clearSearch(state) {
      state.searchResults = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHomeData.pending, (state) => {
        state.isLoadingHome = true;
      })
      .addCase(fetchHomeData.fulfilled, (state, action) => {
        state.homeData = action.payload;
        state.isLoadingHome = false;
      })
      .addCase(fetchHomeData.rejected, (state) => {
        state.isLoadingHome = false;
      })
      .addCase(searchContent.pending, (state) => {
        state.isSearching = true;
      })
      .addCase(searchContent.fulfilled, (state, action) => {
        state.searchResults = action.payload;
        state.isSearching = false;
      })
      .addCase(searchContent.rejected, (state) => {
        state.isSearching = false;
      });
  },
});

export const { clearSearch } = contentSlice.actions;
export default contentSlice.reducer;
