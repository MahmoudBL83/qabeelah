import { Person, User, UserRole, Branch } from '@qabila/types';

export const isDescendantBranch = (targetBranchId: string, adminBranchId: string, branches: Branch[]): boolean => {
  if (targetBranchId === adminBranchId) return true;
  
  let current = branches.find(b => b._id === targetBranchId || b.id === targetBranchId);
  while (current && current.parentId) {
    if (current.parentId === adminBranchId) return true;
    current = branches.find(b => b._id === current!.parentId || b.id === current!.parentId);
  }
  return false;
};

export const canEditPerson = (user: User | null, person: Person | null, branches: Branch[] = []) => {
  if (!user || !person) return false;

  if (user.role === UserRole.SUPER_ADMIN) return true;

  if (user.role === UserRole.QABILA_ADMIN) {
    return Boolean(user.tenantId && person.tenantId === user.tenantId);
  }

  if (user.role === UserRole.SUB_ADMIN) {
    const personBranch = person.branchId;
    if (!user.tenantId || !user.branchId || person.tenantId !== user.tenantId || !personBranch) return false;
    
    return isDescendantBranch(personBranch, user.branchId, branches);
  }

  return false;
};

export const canEditBranch = (user: User | null) => {
  return user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.QABILA_ADMIN;
};

export const canCreatePerson = (user: User | null) => {
  return user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUB_ADMIN;
};

export const canCreatePersonInBranch = (user: User | null, branchId?: string, branches: Branch[] = []) => {
  if (!user) return false;
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.QABILA_ADMIN) return true;
  
  if (user.role === UserRole.SUB_ADMIN) {
    if (!user.branchId || !branchId) return false;
    return isDescendantBranch(branchId, user.branchId, branches);
  }
  return false;
};
