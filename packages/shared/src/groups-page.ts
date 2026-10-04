import { z } from 'zod';
import type { UserSummary } from './dto.js';

export const groupsPageConfigSchema = z.object({
  enabled: z.boolean(),
  showPermissions: z.boolean(),
  showMembers: z.boolean(),
  memberLimit: z.number().int().min(1).max(200),
  groups: z.array(z.number().int().positive()).max(500),
});

export type GroupsPageConfig = z.infer<typeof groupsPageConfigSchema>;

export const DEFAULT_GROUPS_PAGE: GroupsPageConfig = {
  enabled: true,
  showPermissions: true,
  showMembers: true,
  memberLimit: 24,
  groups: [],
};

export interface GroupsPagePermission {
  key: string;
  label: string;
  category: string;
}

export interface GroupsPageMember {
  user: UserSummary;
  isLeader: boolean;
}

export interface GroupsPageGroup {
  id: number;
  name: string;
  description: string;
  color: string | null;
  iconUrl: string | null;
  iconCount: number;
  kind: string;
  minPosts: number | null;
  joinType: string;
  visibility: string;
  memberCount: number;
  isProtected: boolean;
  isMember: boolean;
  isPrimary: boolean;
  canSetPrimary: boolean;
  hasPendingRequest: boolean;
  canManage: boolean;
  allPermissions: boolean;
  inheritsFrom: string | null;
  permissions: GroupsPagePermission[];
  members: GroupsPageMember[];
}

export interface GroupsPageData {
  showPermissions: boolean;
  showMembers: boolean;
  memberLimit: number;
  groups: GroupsPageGroup[];
}
