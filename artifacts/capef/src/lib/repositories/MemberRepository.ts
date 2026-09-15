import { db, type LocalMember } from './CapefDexieDatabase';

export interface IMemberRepository {
  saveMember(member: LocalMember): Promise<LocalMember>;
  getMemberByLocalId(localId: string, userId: string): Promise<LocalMember | undefined>;
  getMembersByUser(userId: string): Promise<LocalMember[]>;
  getPendingMembersByUser(userId: string): Promise<LocalMember[]>;
  deleteMember(localId: string, userId: string): Promise<void>;
  clearUserMembers(userId: string): Promise<void>;
}

export class DexieMemberRepository implements IMemberRepository {
  async saveMember(member: LocalMember): Promise<LocalMember> {
    try {
      const existing = await db.members
        .where({ localId: member.localId, userId: member.userId })
        .first();

      if (existing && existing.id) {
        await db.members.update(existing.id, {
          ...member,
          updatedAt: new Date().toISOString(),
        });
        return { ...existing, ...member, updatedAt: new Date().toISOString() };
      } else {
        const id = await db.members.add(member);
        return { ...member, id };
      }
    } catch (error) {
      console.error('[MemberRepository] Error saving member:', error);
      throw error;
    }
  }

  async getMemberByLocalId(localId: string, userId: string): Promise<LocalMember | undefined> {
    try {
      return await db.members.where({ localId, userId }).first();
    } catch (error) {
      console.error('[MemberRepository] Error fetching member by localId:', error);
      throw error;
    }
  }

  async getMembersByUser(userId: string): Promise<LocalMember[]> {
    try {
      return await db.members.where('userId').equals(userId).toArray();
    } catch (error) {
      console.error('[MemberRepository] Error fetching user members:', error);
      throw error;
    }
  }

  async getPendingMembersByUser(userId: string): Promise<LocalMember[]> {
    try {
      return await db.members
        .where({ userId, syncStatus: 'pending' })
        .toArray();
    } catch (error) {
      console.error('[MemberRepository] Error fetching pending members:', error);
      throw error;
    }
  }

  async deleteMember(localId: string, userId: string): Promise<void> {
    try {
      const existing = await db.members.where({ localId, userId }).first();
      if (existing && existing.id) {
        await db.members.delete(existing.id);
      }
    } catch (error) {
      console.error('[MemberRepository] Error deleting member:', error);
      throw error;
    }
  }

  async clearUserMembers(userId: string): Promise<void> {
    try {
      await db.members.where('userId').equals(userId).delete();
    } catch (error) {
      console.error('[MemberRepository] Error clearing user members:', error);
      throw error;
    }
  }
}

export const memberRepository = new DexieMemberRepository();
