// Mirror of apps/mobile/TESTIDS.md (frontend owns the names). Keep this the ONLY
// place test IDs and routes are spelled out, so a rename in the app is a one-line change here.
export const ROUTES = {
  root: '/',
  onboarding: '/onboarding',
  library: '/library',
  restaurant: (id: string) => `/restaurant/${id}`,
  scan: '/scan',
  review: '/review',
  profile: '/profile',
} as const;

/** Taste profile form, shared by onboarding and /profile. */
const profileForm = {
  spice: (n: number) => `profile-spice-${n}`,
  diet: (d: string) => `profile-diet-${d}`,
  favInput: 'profile-fav-input',
  favAdd: 'profile-fav-add',
  avoidInput: 'profile-avoid-input',
  avoidAdd: 'profile-avoid-add',
  cuisine: (slug: string) => `profile-cuisine-${slug}`,
};

export const T = {
  profileForm,
  onboarding: {
    screen: 'onboarding-screen',
    skip: 'onboarding-skip',
    save: 'onboarding-save',
    error: 'onboarding-error',
  },
  profile: {
    screen: 'profile-screen',
    save: 'profile-save',
    saved: 'profile-saved',
    saveError: 'profile-save-error',
  },
  library: {
    screen: 'library-screen',
    profileButton: 'library-profile-button',
    scanButton: 'library-scan-button',
    search: 'library-search',
    list: 'library-list',
    itemPrefix: 'library-item-',
    itemNamePrefix: 'library-item-name-',
    item: (id: string) => `library-item-${id}`,
    itemName: (id: string) => `library-item-name-${id}`,
    mockNotice: 'library-mock-notice',
  },
  restaurant: {
    screen: 'restaurant-screen',
    name: 'restaurant-name',
    sortToggle: 'sort-toggle',
    menuList: 'menu-list',
  },
  card: {
    namePrefix: 'dish-card-name-',
    root: (id: string) => `dish-card-${id}`,
    photo: (id: string) => `dish-card-photo-${id}`,
    photoPlaceholder: (id: string) => `dish-card-photo-placeholder-${id}`,
    name: (id: string) => `dish-card-name-${id}`,
    price: (id: string) => `dish-card-price-${id}`,
    anchor: (id: string) => `dish-card-anchor-${id}`,
    description: (id: string) => `dish-card-description-${id}`,
    spice: (id: string) => `dish-card-spice-${id}`,
    texture: (id: string) => `dish-card-texture-${id}`,
    adventurousness: (id: string) => `dish-card-adventurousness-${id}`,
    note: (id: string) => `dish-card-note-${id}`,
    source: (id: string) => `dish-card-source-${id}`,
    feedbackCounts: (id: string) => `dish-card-feedback-counts-${id}`,
    match: (id: string) => `dish-card-match-${id}`,
    matchUnrated: (id: string) => `dish-card-match-unrated-${id}`,
    matchScore: (id: string) => `dish-card-match-score-${id}`,
    matchState: (id: string) => `dish-card-match-state-${id}`,
    matchReason: (id: string) => `dish-card-match-reason-${id}`,
    add: (id: string) => `dish-card-add-${id}`,
    feedback: (id: string) => `dish-card-feedback-${id}`,
  },
  shortlist: {
    bar: 'shortlist-bar',
    count: 'shortlist-count',
    total: 'shortlist-total',
  },
  scan: {
    screen: 'scan-screen',
    library: 'scan-library',
    progress: 'scan-progress',
    error: 'scan-error',
  },
  review: {
    screen: 'review-screen',
    restaurantName: 'review-restaurant-name',
    cuisine: 'review-restaurant-cuisine',
    itemPrefix: 'review-item-',
    namePrefix: 'review-name-',
    item: (tempId: string) => `review-item-${tempId}`,
    badge: (tempId: string) => `review-badge-${tempId}`,
    name: (tempId: string) => `review-name-${tempId}`,
    price: (tempId: string) => `review-price-${tempId}`,
    discard: (tempId: string) => `review-discard-${tempId}`,
    discarded: (tempId: string) => `review-discarded-${tempId}`,
    restore: (tempId: string) => `review-restore-${tempId}`,
    addManual: 'review-add-manual',
    save: 'review-save',
    saveError: 'review-save-error',
  },
  feedback: {
    screen: 'feedback-screen',
    accurateYes: 'feedback-accurate-yes',
    accurateNo: 'feedback-accurate-no',
    tastesLike: 'feedback-tastes-like',
    likedYes: 'feedback-liked-yes',
    likedNo: 'feedback-liked-no',
    submit: 'feedback-submit',
    success: 'feedback-success',
    done: 'feedback-done',
    error: 'feedback-error',
  },
} as const;

/** Card text -> numeric signal, per TESTIDS.md wording. */
export const SPICE_LABELS = ['No heat', 'Mild', 'Medium', 'Hot'] as const;
export const ADVENTUROUSNESS_LABELS = ['Familiar', 'A little new', 'Adventurous'] as const; // 1..3
export const AI_SOURCE_LABEL = /AI-written, not yet confirmed by diners/i;
export const UNRATED_TEXT = /still learning your taste/i;
