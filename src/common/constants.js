(function (global) {
  const constants = {
    DEFAULT_GRACE_PERIOD_MS: 1 * 60 * 1000, // grace period after joining before the first nag
    DEFAULT_REPEAT_INTERVAL_MS: 5 * 60 * 1000, // how often to re-show the banner
    MUTATION_DEBOUNCE_MS: 750, // debounce for Meet's constant DOM churn
    FIREFLIES_NAME_MATCH: /fireflies/i,
    // Auto-clicks "Admit" for any pending participant named "fireflies" so
    // no one has to manually let the bot in. Trade-off: bypasses Meet's own
    // bot-safety confirmation gate for anything matching that name — set to
    // false to require manual admission instead.
    AUTO_ADMIT_FIREFLIES: true,
    STORAGE_MUTE_PREFIX: "firefliesMute:",
    LOG_PREFIX: "[fireflies-reminder]",
  };

  global.__fireflies = global.__fireflies || {};
  global.__fireflies.constants = constants;
})(window);
