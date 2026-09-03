(function (global) {
  const constants = {
    DEFAULT_GRACE_PERIOD_MS: 1 * 60 * 1000, // grace period after joining before the first nag
    DEFAULT_REPEAT_INTERVAL_MS: 5 * 60 * 1000, // how often to re-show the banner
    MUTATION_DEBOUNCE_MS: 750, // debounce for Meet's constant DOM churn
    FIREFLIES_NAME_MATCH: /fireflies/i,
    STORAGE_MUTE_PREFIX: "firefliesMute:",
    LOG_PREFIX: "[fireflies-reminder]",
  };

  global.__fireflies = global.__fireflies || {};
  global.__fireflies.constants = constants;
})(window);
