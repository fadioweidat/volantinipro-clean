export type AiAuthProfile = { role?: string | null } | null | undefined;
export type AiCampaignOwner = { user_id?: string | null } | null | undefined;

export function isAdminProfile(profile: AiAuthProfile): boolean {
  return profile?.role === "admin";
}

export function canAccessCampaign(
  userId: string,
  campaign: AiCampaignOwner,
  profile: AiAuthProfile,
): boolean {
  return Boolean(userId) && (
    campaign?.user_id === userId || isAdminProfile(profile)
  );
}
