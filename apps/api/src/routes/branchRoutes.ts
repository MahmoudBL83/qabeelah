import express from 'express';
import { authenticate } from '../middleware/auth';
import { UserRole } from '../types/shared';
import { getBranches, createBranch, updateBranch, deleteBranch } from '../controllers/branchController';

const router = express.Router();

// All branch routes require authentication
router.use(authenticate);

// Middleware for admin roles
const requireAdmin = (req: any, res: any, next: any) => {
  const user = req.user;
  if (!user || (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.QABILA_ADMIN)) {
    return res.status(403).json({ error: 'Access denied: Admin role required' });
  }
  next();
};

// Everyone can view branches
router.get('/', getBranches);

// Only Super Admins and Qabila Admins can manage branches
router.post('/', requireAdmin, createBranch);
router.put('/:id', requireAdmin, updateBranch);
router.delete('/:id', requireAdmin, deleteBranch);

export default router;
