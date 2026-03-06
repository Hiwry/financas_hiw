import { AppState, CategoryGoal, HouseholdMember } from '../types';

const mergeById = <T extends { id: string }>(localItems: T[], remoteItems: T[]): T[] => {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    merged.set(item.id, item);
  }

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
};

const mergeStringList = (localItems: string[], remoteItems: string[]): string[] => {
  const merged = new Set<string>();

  for (const item of localItems) {
    if (!item) continue;
    merged.add(item);
  }

  for (const item of remoteItems) {
    if (!item) continue;
    merged.add(item);
  }

  return Array.from(merged.values());
};

const mergeCategoryGoals = (localGoals: CategoryGoal[], remoteGoals: CategoryGoal[]): CategoryGoal[] => {
  const merged = new Map<string, CategoryGoal>();

  for (const goal of remoteGoals) {
    merged.set(goal.categoryId, goal);
  }

  for (const goal of localGoals) {
    merged.set(goal.categoryId, goal);
  }

  return Array.from(merged.values());
};

const mergeHouseholdMembers = (localMembers: HouseholdMember[], remoteMembers: HouseholdMember[]): HouseholdMember[] => {
  const merged = new Map<string, HouseholdMember>();

  for (const member of remoteMembers) {
    merged.set(member.id, member);
  }

  for (const member of localMembers) {
    merged.set(member.id, member);
  }

  return Array.from(merged.values());
};

const pickActiveMemberId = (memberIds: Set<string>, candidate?: string): string | null => {
  if (!candidate) return null;
  return memberIds.has(candidate) ? candidate : null;
};

export const mergeAppStatesOnConflict = (localState: AppState, remoteState: AppState): AppState => {
  const mergedMembers = mergeHouseholdMembers(localState.household.members, remoteState.household.members);
  const memberIdSet = new Set(mergedMembers.map((member) => member.id));
  const activeMemberId =
    pickActiveMemberId(memberIdSet, localState.household.activeMemberId) ||
    pickActiveMemberId(memberIdSet, remoteState.household.activeMemberId) ||
    mergedMembers[0]?.id ||
    localState.household.activeMemberId;

  return {
    ...remoteState,
    transactions: mergeById(localState.transactions, remoteState.transactions),
    categories: mergeById(localState.categories, remoteState.categories),
    accounts: mergeStringList(localState.accounts, remoteState.accounts),
    creditCards: mergeById(localState.creditCards, remoteState.creditCards),
    invoicePayments: mergeById(localState.invoicePayments, remoteState.invoicePayments),
    categoryGoals: mergeCategoryGoals(localState.categoryGoals, remoteState.categoryGoals),
    reminderSettings: {
      ...remoteState.reminderSettings,
      ...localState.reminderSettings,
    },
    household: {
      ...remoteState.household,
      ...localState.household,
      members: mergedMembers,
      activeMemberId,
    },
  };
};
