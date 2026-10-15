// Stable avatar codes stay intact for accounts that already own an old cosmetic.
// The first fifteen codes are the fifteen distinct owls shown in the shop.
export const SHOP_OWL_CODES = [
  "avatar_analyst", "avatar_diplomat", "avatar_manager", "avatar_researcher", "avatar_mediator",
  "avatar_beginner", "avatar_hr", "avatar_sales", "avatar_negotiator", "avatar_deal",
  "avatar_speaker", "avatar_consultant", "avatar_observer", "avatar_partner", "avatar_practitioner",
];

const legacyOwlNumbers = {
  avatar_argument: 12,
  avatar_market: 11,
  avatar_alternative: 8,
  avatar_trust: 2,
  avatar_sales_leader: 5,
  avatar_master: 1,
  avatar_calm: 14,
  avatar_trust_master: 7,
  avatar_goal_master: 15,
};

const owlNumbers = Object.fromEntries(SHOP_OWL_CODES.map((code, index) => [code, index + 1]));

export function owlImageForCode(code) {
  const number = owlNumbers[code] || legacyOwlNumbers[code] || 1;
  return `avatars/owls/owl-${String(number).padStart(2, "0")}.webp`;
}
