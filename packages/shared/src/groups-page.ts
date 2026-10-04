import { z } from 'zod';
import type { UserSummary } from './dto.js';

export const groupsPageConfigSchema = z.object({
  enabled: z.boolean(),
  showMembers: z.boolean(),
  memberLimit: z.number().int().min(1).max(200),
  groups: z.array(z.number().int().positive()).max(500),
});

export type GroupsPageConfig = z.infer<typeof groupsPageConfigSchema>;

export const DEFAULT_GROUPS_PAGE: GroupsPageConfig = {
  enabled: true,
  showMembers: true,
  memberLimit: 24,
  groups: [],
};

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
  members: GroupsPageMember[];
}

export interface GroupsPageData {
  showMembers: boolean;
  memberLimit: number;
  groups: GroupsPageGroup[];
}
