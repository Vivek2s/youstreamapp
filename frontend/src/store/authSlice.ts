import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '../services/auth.service';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isLoggedIn: false,
  isLoading: true,
  error: null,
};

export const checkAuth = createAsyncThunk('auth/check', async () => {
  const isLoggedIn = await authService.isLoggedIn();
  if (isLoggedIn) {
    const user = await authService.getStoredUser();
    return { isLoggedIn: true, user };
  }
  return { isLoggedIn: false, user: null };
});

export const sendOTP = createAsyncThunk('auth/sendOTP', async (phone: string, { rejectWithValue }) => {
  try {
    const result = await authService.sendOTP(phone);
    return result;
  } catch (err: any) {
    console.log('[sendOTP] Error:', err.message, err.code);
    return rejectWithValue(err.response?.data?.error?.message || err.message || 'Network error');
  }
});

export const verifyOTP = createAsyncThunk(
  'auth/verifyOTP',
  async ({ phone, otp }: { phone: string; otp: string }, { rejectWithValue }) => {
    try {
      const result = await authService.verifyOTP(phone, otp);
      if (!result.success) return rejectWithValue(result.error?.message || 'Verification failed');
      return result.data;
    } catch (err: any) {
      console.log('[verifyOTP] Error:', err.message, err.code);
      return rejectWithValue(err.response?.data?.error?.message || err.message || 'Network error');
    }
  }
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await authService.logout();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Check auth
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.isLoggedIn = action.payload.isLoggedIn;
        state.user = action.payload.user;
        state.isLoading = false;
      })
      .addCase(checkAuth.rejected, (state) => {
        state.isLoading = false;
      })
      // Verify OTP
      .addCase(verifyOTP.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyOTP.fulfilled, (state, action) => {
        state.isLoggedIn = true;
        state.user = action.payload.user;
        state.isLoading = false;
      })
      .addCase(verifyOTP.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Verification failed';
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.isLoggedIn = false;
        state.user = null;
      });
  },
});

export const { clearError, setUser } = authSlice.actions;
export default authSlice.reducer;
