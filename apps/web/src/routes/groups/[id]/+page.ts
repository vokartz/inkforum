import type { UserSummary } from '@forum/shared';
import { redirect } from '@sveltejs/kit';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface GroupDetail extends GroupDto {
  isMember: boolean;
  isPrimary: boolean;
  hasPendingRequest: boolean;
  canManage: boolean;
  moderators: UserSummary[];
}

export interface GroupMember {
  user: UserSummary;
  isPrimary: boolean;
  expiresAt: number | null;
  addedAt: number;
}

export const load: PageLoad = ({ params }) => {
  redirect(308, `/groups#group-${params.id}`);
};
