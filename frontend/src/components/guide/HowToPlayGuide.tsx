export interface HowToPlayGuideProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Your Role",
    text: "You are India's Head of Defense Integration (2026–2036). Over 40 quarterly turns, you'll modernize the IAF through procurement, R&D, and force management to meet strategic objectives.",
  },
  {
    title: "Each Turn",
    text: "1. Allocate your quarterly budget across 5 categories (maintenance, R&D, acquisitions, infrastructure, reserves).\n2. Manage R&D programs and acquisition orders in the Procurement hub.\n3. Review intelligence reports in the Intel inbox.\n4. Click 'End Turn' to advance the quarter.",
  },
  {
    title: "Vignettes (Combat)",
    text: "Periodically, a security event will fire. You'll enter the Ops Room to commit squadrons, choose support assets (AWACS, tankers), and set rules of engagement. Combat resolves automatically based on platform capabilities, numbers, and stealth.",
  },
  {
    title: "Winning Fights",
    text: "Detection advantage matters — better radar + AWACS lets you shoot first. Stealth aircraft (VLO) are harder to hit. Numbers help but generation gap can overcome them. Weapons Free ROE gives the best missile performance.",
  },
  {
    title: "Objectives",
    text: "Your 3–5 chosen objectives (e.g., field AMCA squadrons, maintain 42 squadrons, achieve missile sovereignty) are evaluated at campaign end. The Defense White Paper grades your performance.",
  },
  {
    title: "Key Tips",
    text: "• Invest in R&D early — programs take years to complete.\n• Don't neglect maintenance budget — low readiness reduces combat effectiveness.\n• AWACS support gives +5% missile hit probability.\n• Stealth platforms (J-20, J-35) are very hard to kill — you need numbers or your own 5th-gen fighters.",
  },
];

export function HowToPlayGuide({ open, onClose }: HowToPlayGuideProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full max-h-96 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">How to Play</h2>

          <div className="space-y-4">
            {SECTIONS.map((section, idx) => (
              <div key={idx}>
                <h3 className="text-amber-400 font-semibold text-sm mb-1">
                  {section.title}
                </h3>
                <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {section.text}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold rounded-lg px-4 py-2 text-sm mt-6"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
