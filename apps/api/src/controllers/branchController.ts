import { Request, Response } from 'express';
import Branch from '../models/Branch';

// GET /api/branches
export const getBranches = async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.body?.tenantId || req.query?.tenantId || res.locals.tenantId || (req as any).user?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const branches = await Branch.find({ tenantId }).sort({ createdAt: 1 });
    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
};

// POST /api/branches
export const createBranch = async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.body?.tenantId || req.query?.tenantId || res.locals.tenantId || (req as any).user?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { name, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const branch = new Branch({
      tenantId,
      name,
      parentId: parentId || undefined
    });

    await branch.save();
    res.status(201).json(branch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
};

// PUT /api/branches/:id
export const updateBranch = async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.body?.tenantId || req.query?.tenantId || res.locals.tenantId || (req as any).user?.tenantId || '');
    const { id } = req.params;
    const { name, parentId } = req.body;

    const branch = await Branch.findOne({ _id: id, tenantId });
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    if (name) branch.name = name;
    if (parentId !== undefined) {
      // Allow unsetting parentId by passing null
      branch.parentId = parentId || undefined;
    }

    await branch.save();
    res.json(branch);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Failed to update branch' });
  }
};

// DELETE /api/branches/:id
export const deleteBranch = async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.body?.tenantId || req.query?.tenantId || res.locals.tenantId || (req as any).user?.tenantId || '');
    const { id } = req.params;

    const branch = await Branch.findOne({ _id: id, tenantId });
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if branch has children
    const childrenCount = await Branch.countDocuments({ parentId: id });
    if (childrenCount > 0) {
      return res.status(400).json({ error: 'Cannot delete branch because it has sub-branches. Delete them first.' });
    }

    // Check if any person or user is assigned to this branch
    const db = branch.db;
    const personsCount = await db.collection('persons').countDocuments({ branchId: branch._id });
    const usersCount = await db.collection('users').countDocuments({ branchId: branch._id });
    
    if (personsCount > 0 || usersCount > 0) {
      return res.status(400).json({ error: 'Cannot delete branch because it has people or admins assigned to it.' });
    }

    await Branch.deleteOne({ _id: id });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
};
