import { User } from '@qabila/types';

export const getUserAvatarUrl = (user?: User | null) => {
  if (!user) return '';
  return user.avatarUrl || user.avatar || '';
};