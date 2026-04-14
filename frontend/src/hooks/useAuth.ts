import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  return { ...auth, dispatch };
}

export function useAppDispatch() {
  return useDispatch<AppDispatch>();
}
