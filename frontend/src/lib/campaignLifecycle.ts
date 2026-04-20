import type { Campaign } from "./types";

export function isCampaignComplete(campaign: Campaign | null | undefined): boolean {
  if (!campaign) return false;
  return (
    campaign.current_year > 2036 ||
    (campaign.current_year === 2036 && campaign.current_quarter > 1)
  );
}
